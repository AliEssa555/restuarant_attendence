import 'dart:io';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:google_mlkit_face_detection/google_mlkit_face_detection.dart';
import 'package:image/image.dart' as img;
import 'package:tflite_flutter/tflite_flutter.dart';

import '../env.dart';

/// On-device face pipeline (TECHNICAL_PLAN.md §7.2).
///
/// Enrolment and check-in both go through here, so a check-in embedding is
/// produced exactly the same way as the enrolment one it will be compared
/// against. Any difference in cropping or normalisation between the two would
/// show up as a lower similarity score and look like a stranger.
///
/// Nothing in here decides anything: the result is a vector that gets sent to
/// `recordAttendance`, which does the comparing. The app never computes a
/// similarity score of its own (except on the debug calibration screen).

/// Why a capture was rejected before it ever reached the network.
enum FaceQuality {
  ok,
  noFace,
  multipleFaces,
  faceTooSmall,
  faceOffCentre,
  eyesClosed,
}

String faceQualityHint(FaceQuality quality) => switch (quality) {
      FaceQuality.ok => 'Looks good.',
      FaceQuality.noFace =>
        "We can't see your face. Hold the phone at eye level in good light.",
      FaceQuality.multipleFaces =>
        'More than one face in frame. Make sure you are alone in the photo.',
      FaceQuality.faceTooSmall => 'Move a little closer to the camera.',
      FaceQuality.faceOffCentre => 'Centre your face in the oval.',
      FaceQuality.eyesClosed => 'Keep both eyes open and look at the camera.',
    };

class FaceCaptureException implements Exception {
  FaceCaptureException(this.quality, [String? message])
      : message = message ?? faceQualityHint(quality);

  final FaceQuality quality;
  final String message;

  @override
  String toString() => 'FaceCaptureException(${quality.name}): $message';
}

/// Thrown when the pipeline itself cannot run — almost always a missing model.
class FaceEmbedderUnavailable implements Exception {
  FaceEmbedderUnavailable(this.message);
  final String message;

  @override
  String toString() => 'FaceEmbedderUnavailable: $message';
}

/// One successful capture.
class FaceEmbedding {
  const FaceEmbedding({
    required this.embedding,
    required this.facesDetected,
    required this.modelVersion,
  });

  /// L2-normalised, length matches the model's output.
  final List<double> embedding;

  /// Reported to the server so it can reject 0 or 2+ face photos.
  final int facesDetected;

  final String modelVersion;
}

/// Geometry the preprocessing isolate needs — all plain numbers so it can cross
/// an isolate boundary.
///
/// Public so `preprocessFaceCrop` can be unit-tested directly: the crop and
/// normalisation are where enrolment and check-in could silently diverge.
@immutable
class FaceCropSpec {
  const FaceCropSpec({
    required this.jpegBytes,
    required this.centreX,
    required this.centreY,
    required this.side,
    required this.rotationDegrees,
    required this.inputSize,
    required this.mean,
    required this.std,
  });

  final Uint8List jpegBytes;
  final double centreX;
  final double centreY;
  final double side;
  final double rotationDegrees;
  final int inputSize;
  final double mean;
  final double std;
}

/// Decode, align, crop and normalise — the expensive, pure-Dart part.
///
/// Runs in a background isolate via `compute`, because decoding a 1600px JPEG
/// and rotating it takes long enough to drop frames on a mid-range phone.
Float32List preprocessFaceCrop(FaceCropSpec spec) {
  final img.Image decoded;
  try {
    final result = img.decodeImage(spec.jpegBytes);
    if (result == null) {
      throw FaceEmbedderUnavailable('That photo could not be decoded.');
    }
    decoded = result;
  } on FaceEmbedderUnavailable {
    rethrow;
  } catch (err) {
    // `decodeImage` sniffs the format and can throw rather than return null on
    // a truncated or non-image file. A bad upload must surface as a retryable
    // message, not an unhandled exception mid-check-in.
    throw FaceEmbedderUnavailable('That photo could not be decoded. ($err)');
  }

  // Work on a square larger than the face, so levelling the eye line cannot
  // pull empty corners into the final frame. A square of side*1.6 is enough for
  // any rotation: the axis-aligned square inscribed in a rotated square of side
  // s is s/(|cos|+|sin|), worst case s/1.415.
  final padded = (spec.side * 1.6).round();
  final work = img.Image(width: padded, height: padded)
    ..clear(img.ColorRgb8(128, 128, 128));

  // Copy the overlapping region explicitly instead of compositing at a negative
  // offset: a face near the edge of the frame must be padded, and only the part
  // that actually exists may be copied.
  final srcLeft = (spec.centreX - padded / 2).round();
  final srcTop = (spec.centreY - padded / 2).round();
  final x0 = srcLeft.clamp(0, decoded.width);
  final y0 = srcTop.clamp(0, decoded.height);
  final x1 = (srcLeft + padded).clamp(0, decoded.width);
  final y1 = (srcTop + padded).clamp(0, decoded.height);
  if (x1 > x0 && y1 > y0) {
    final piece = img.copyCrop(
      decoded,
      x: x0,
      y: y0,
      width: x1 - x0,
      height: y1 - y0,
    );
    img.compositeImage(work, piece, dstX: x0 - srcLeft, dstY: y0 - srcTop);
  }

  // Level the eye line.
  final levelled = spec.rotationDegrees.abs() < 0.5
      ? work
      : img.copyRotate(work, angle: -spec.rotationDegrees);

  // Centre-crop back to the face box plus its margin.
  final side = spec.side.round();
  final left = ((levelled.width - side) / 2).round();
  final top = ((levelled.height - side) / 2).round();
  final face = img.copyCrop(
    levelled,
    x: left.clamp(0, math.max(0, levelled.width - 1)),
    y: top.clamp(0, math.max(0, levelled.height - 1)),
    width: math.min(side, levelled.width),
    height: math.min(side, levelled.height),
  );

  final resized = img.copyResize(
    face,
    width: spec.inputSize,
    height: spec.inputSize,
    interpolation: img.Interpolation.cubic,
  );

  // NHWC float32, RGB, scaled the way the model was trained.
  final out = Float32List(spec.inputSize * spec.inputSize * 3);
  var i = 0;
  for (var y = 0; y < spec.inputSize; y++) {
    for (var x = 0; x < spec.inputSize; x++) {
      final px = resized.getPixel(x, y);
      out[i++] = (px.r - spec.mean) / spec.std;
      out[i++] = (px.g - spec.mean) / spec.std;
      out[i++] = (px.b - spec.mean) / spec.std;
    }
  }
  return out;
}

/// L2-normalise in place and return the list.
List<double> l2Normalise(List<double> v) {
  var sumSquares = 0.0;
  for (final n in v) {
    sumSquares += n * n;
  }
  final norm = math.sqrt(sumSquares);
  if (norm == 0) return v;
  return [for (final n in v) n / norm];
}

/// Cosine similarity — used only by the debug calibration screen. The real
/// comparison happens on the server.
double cosineSimilarity(List<double> a, List<double> b) {
  if (a.length != b.length) return 0;
  var dot = 0.0;
  var na = 0.0;
  var nb = 0.0;
  for (var i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na == 0 || nb == 0) return 0;
  return (dot / (math.sqrt(na) * math.sqrt(nb))).clamp(-1.0, 1.0);
}

/// Mean of several embeddings, L2-normalised — the enrolment vector.
List<double> averageEmbeddings(List<List<double>> embeddings) {
  if (embeddings.isEmpty) return const [];
  final length = embeddings.first.length;
  final sum = List<double>.filled(length, 0);
  for (final e in embeddings) {
    for (var i = 0; i < length; i++) {
      sum[i] += e[i];
    }
  }
  return l2Normalise([for (final n in sum) n / embeddings.length]);
}

/// The pipeline. One instance per app session; `dispose` releases the detector
/// and the interpreter.
abstract class FaceEmbedder {
  /// Detect, align, embed. Throws [FaceCaptureException] for a bad capture and
  /// [FaceEmbedderUnavailable] if the model is missing.
  Future<FaceEmbedding> embedFile(File jpeg);

  Future<void> dispose();

  /// `--dart-define=FAKE_FACE=true` swaps in a stub, so the enrolment and
  /// check-in flows can be walked through on a simulator with no camera and no
  /// bundled model.
  factory FaceEmbedder.create() =>
      Env.fakeFace ? _FakeFaceEmbedder() : MlKitFaceEmbedder();
}

/// Properties of the bundled model. Changing any of these means re-enrolling
/// everybody, which is why `Env.modelVersion` is sent with every embedding.
class FaceModelSpec {
  const FaceModelSpec({
    required this.assetPath,
    required this.inputSize,
    required this.mean,
    required this.std,
    required this.version,
  });

  final String assetPath;
  final int inputSize;
  final double mean;
  final double std;
  final String version;

  /// See `assets/models/MODEL.md` — update both together.
  static const bundled = FaceModelSpec(
    assetPath: 'assets/models/mobilefacenet.tflite',
    inputSize: 112,
    mean: 127.5,
    std: 128.0,
    version: Env.modelVersion,
  );
}

class MlKitFaceEmbedder implements FaceEmbedder {
  MlKitFaceEmbedder({this.spec = FaceModelSpec.bundled});

  final FaceModelSpec spec;

  final FaceDetector _detector = FaceDetector(
    options: FaceDetectorOptions(
      performanceMode: FaceDetectorMode.accurate,
      enableLandmarks: true,
      enableClassification: true,
      minFaceSize: 0.15,
    ),
  );

  Interpreter? _interpreter;
  IsolateInterpreter? _isolate;
  int? _embeddingLength;

  /// The face box must fill at least this fraction of the shorter image edge,
  /// or the capture is too far away for the model to work with.
  static const double _minFaceFraction = 0.22;

  /// How far the face centre may sit from the image centre, as a fraction of
  /// the image size.
  static const double _maxOffCentre = 0.28;

  Future<void> _ensureModel() async {
    if (_isolate != null) return;
    try {
      final interpreter = await Interpreter.fromAsset(spec.assetPath);
      final outputShape = interpreter.getOutputTensor(0).shape;
      _embeddingLength = outputShape.last;
      _interpreter = interpreter;
      _isolate = await IsolateInterpreter.create(address: interpreter.address);
    } catch (err) {
      throw FaceEmbedderUnavailable(
        'The face model is missing from this build. See '
        'apps/mobile/assets/models/MODEL.md for how to add it, or run with '
        '--dart-define=FAKE_FACE=true to test the flow without it. ($err)',
      );
    }
  }

  @override
  Future<FaceEmbedding> embedFile(File jpeg) async {
    await _ensureModel();

    final faces = await _detector.processImage(InputImage.fromFile(jpeg));
    if (faces.isEmpty) throw FaceCaptureException(FaceQuality.noFace);
    if (faces.length > 1) throw FaceCaptureException(FaceQuality.multipleFaces);
    final face = faces.first;

    final bytes = await jpeg.readAsBytes();
    final decoded = await compute(_probeSize, bytes);

    _assertFraming(face, decoded.$1, decoded.$2);
    _assertEyesOpen(face);

    final box = face.boundingBox;
    // 20% margin around the detected box, squared off so the aspect ratio
    // cannot stretch the face.
    final side = math.max(box.width, box.height) * 1.2;

    final float32 = await compute(
      preprocessFaceCrop,
      FaceCropSpec(
        jpegBytes: bytes,
        centreX: box.center.dx,
        centreY: box.center.dy,
        side: side,
        rotationDegrees: _eyeLineDegrees(face),
        inputSize: spec.inputSize,
        mean: spec.mean,
        std: spec.std,
      ),
    );

    final length = _embeddingLength ?? 192;
    final input = float32.reshape([1, spec.inputSize, spec.inputSize, 3]);
    final output = List.filled(1 * length, 0.0).reshape([1, length]);
    await _isolate!.run(input, output);

    final raw = (output[0] as List).cast<double>();
    return FaceEmbedding(
      embedding: l2Normalise(raw),
      facesDetected: faces.length,
      modelVersion: spec.version,
    );
  }

  void _assertFraming(Face face, int imageWidth, int imageHeight) {
    final box = face.boundingBox;
    final shortEdge = math.min(imageWidth, imageHeight).toDouble();
    if (shortEdge <= 0) return;

    if (math.max(box.width, box.height) / shortEdge < _minFaceFraction) {
      throw FaceCaptureException(FaceQuality.faceTooSmall);
    }

    final offX = (box.center.dx - imageWidth / 2).abs() / imageWidth;
    final offY = (box.center.dy - imageHeight / 2).abs() / imageHeight;
    if (offX > _maxOffCentre || offY > _maxOffCentre) {
      throw FaceCaptureException(FaceQuality.faceOffCentre);
    }
  }

  void _assertEyesOpen(Face face) {
    final left = face.leftEyeOpenProbability;
    final right = face.rightEyeOpenProbability;
    // Classification can come back null on a low-quality frame; only fail when
    // the detector actually reports closed eyes.
    if ((left != null && left <= 0.5) || (right != null && right <= 0.5)) {
      throw FaceCaptureException(FaceQuality.eyesClosed);
    }
  }

  /// Angle of the line between the eyes, in degrees. Rotating the crop by the
  /// negative of this levels the face.
  double _eyeLineDegrees(Face face) {
    final left = face.landmarks[FaceLandmarkType.leftEye]?.position;
    final right = face.landmarks[FaceLandmarkType.rightEye]?.position;
    if (left == null || right == null) {
      // Fall back to the detector's own head tilt estimate.
      return face.headEulerAngleZ ?? 0;
    }
    final dx = (right.x - left.x).toDouble();
    final dy = (right.y - left.y).toDouble();
    if (dx == 0 && dy == 0) return 0;
    return math.atan2(dy, dx) * 180 / math.pi;
  }

  @override
  Future<void> dispose() async {
    await _detector.close();
    await _isolate?.close();
    _interpreter?.close();
    _isolate = null;
    _interpreter = null;
  }
}

/// Image dimensions only — cheap enough to justify its own isolate hop rather
/// than decoding twice on the UI thread.
(int, int) _probeSize(Uint8List bytes) {
  final decoded = img.decodeImage(bytes);
  if (decoded == null) return (0, 0);
  return (decoded.width, decoded.height);
}

/// `FAKE_FACE=true`: a deterministic embedding, so enrolment and check-in agree
/// and the full server path can be exercised without a camera or a model.
///
/// The vector is perturbed slightly on every call. That is deliberate: the
/// server rejects a check-in embedding that is *identical* to the enrolment one
/// as a replay (see `EMBEDDING_COPY_THRESHOLD`), so a perfectly constant stub
/// would fail every check-in with EMBEDDING_INVALID.
class _FakeFaceEmbedder implements FaceEmbedder {
  int _calls = 0;

  @override
  Future<FaceEmbedding> embedFile(File jpeg) async {
    _calls++;
    const length = 192;
    final jitter = _calls * 0.0007;
    final raw = <double>[
      for (var i = 0; i < length; i++)
        math.sin(i * 0.37) + (i.isEven ? jitter : -jitter),
    ];
    return FaceEmbedding(
      embedding: l2Normalise(raw),
      facesDetected: 1,
      modelVersion: Env.modelVersion,
    );
  }

  @override
  Future<void> dispose() async {}
}
