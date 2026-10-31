import 'dart:math' as math;
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:restaurant_attendance/services/face_embedder.dart';

/// A deterministic unit-length vector.
List<double> unitVector(int length, int seed) {
  var x = seed;
  final raw = <double>[];
  for (var i = 0; i < length; i++) {
    x = (x * 1103515245 + 12345) % 2147483648;
    raw.add(x / 2147483648 - 0.5);
  }
  return l2Normalise(raw);
}

void main() {
  group('l2Normalise', () {
    test('produces a unit-length vector', () {
      final v = l2Normalise([3, 4]);
      expect(v[0], closeTo(0.6, 1e-12));
      expect(v[1], closeTo(0.8, 1e-12));
    });

    test('leaves an all-zero vector alone instead of dividing by zero', () {
      expect(l2Normalise([0, 0, 0]), [0, 0, 0]);
    });

    test('is idempotent', () {
      final once = unitVector(128, 3);
      expect(cosineSimilarity(once, l2Normalise(once)), closeTo(1, 1e-12));
    });
  });

  group('cosineSimilarity', () {
    test('is 1 for identical vectors', () {
      final v = unitVector(128, 11);
      expect(cosineSimilarity(v, v), closeTo(1, 1e-10));
    });

    test('is -1 for opposed vectors', () {
      final v = unitVector(128, 12);
      expect(cosineSimilarity(v, [for (final n in v) -n]), closeTo(-1, 1e-10));
    });

    test('is 0 for orthogonal vectors', () {
      expect(cosineSimilarity([1, 0], [0, 1]), closeTo(0, 1e-12));
    });

    test('ignores magnitude', () {
      final v = unitVector(64, 13);
      expect(cosineSimilarity(v, [for (final n in v) n * 9]), closeTo(1, 1e-10));
    });

    test('returns 0 rather than NaN on a zero vector', () {
      expect(cosineSimilarity([0, 0], [1, 0]), 0);
    });

    test('returns 0 on a length mismatch instead of throwing mid-check-in', () {
      expect(cosineSimilarity([1, 0], [1, 0, 0]), 0);
    });

    test('stays within [-1, 1]', () {
      final v = unitVector(512, 14);
      final sim = cosineSimilarity(v, v);
      expect(sim, lessThanOrEqualTo(1.0));
      expect(sim, greaterThanOrEqualTo(-1.0));
    });

    test('agrees with the server formula to well inside threshold precision', () {
      // The server computes the same cosine in TypeScript. If these two ever
      // disagreed by more than rounding, thresholds calibrated on this screen
      // would not match the ones the server applies.
      final a = unitVector(192, 21);
      final b = unitVector(192, 22);
      var dot = 0.0;
      for (var i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
      }
      expect(cosineSimilarity(a, b), closeTo(dot, 1e-12));
    });
  });

  group('averageEmbeddings', () {
    test('returns a unit-length mean', () {
      final mean = averageEmbeddings([
        unitVector(128, 31),
        unitVector(128, 32),
        unitVector(128, 33),
      ]);
      var sumSquares = 0.0;
      for (final n in mean) {
        sumSquares += n * n;
      }
      expect(math.sqrt(sumSquares), closeTo(1, 1e-10));
    });

    test('is the identity for one embedding', () {
      final v = unitVector(128, 34);
      expect(cosineSimilarity(averageEmbeddings([v]), v), closeTo(1, 1e-10));
    });

    test('sits closer to its inputs than to a stranger', () {
      final a = unitVector(128, 35);
      final b = l2Normalise([
        for (var i = 0; i < a.length; i++) a[i] + (i % 5 == 0 ? 0.05 : 0),
      ]);
      final mean = averageEmbeddings([a, b]);
      expect(
        cosineSimilarity(mean, a),
        greaterThan(cosineSimilarity(mean, unitVector(128, 999))),
      );
    });

    test('returns empty for empty input rather than throwing', () {
      expect(averageEmbeddings(const []), isEmpty);
    });
  });

  group('preprocessFaceCrop', () {
    /// A solid-colour JPEG, as the camera would hand us.
    List<int> solidJpeg(int r, int g, int b, {int size = 400}) {
      final image = img.Image(width: size, height: size)
        ..clear(img.ColorRgb8(r, g, b));
      return img.encodeJpg(image, quality: 100);
    }

    FaceCropSpec specFor(List<int> jpeg, {double rotation = 0, double side = 200}) =>
        FaceCropSpec(
          jpegBytes: Uint8List.fromList(jpeg),
          centreX: 200,
          centreY: 200,
          side: side,
          rotationDegrees: rotation,
          inputSize: 112,
          mean: 127.5,
          std: 128.0,
        );

    test('produces exactly one NHWC 112x112x3 tensor', () {
      final out = preprocessFaceCrop(specFor(solidJpeg(128, 128, 128)));
      expect(out.length, 112 * 112 * 3);
    });

    test('normalises mid-grey to about zero', () {
      final out = preprocessFaceCrop(specFor(solidJpeg(128, 128, 128)));
      for (final v in out) {
        expect(v, closeTo((128 - 127.5) / 128, 0.03));
      }
    });

    test('normalises white and black to the ends of the range', () {
      final white = preprocessFaceCrop(specFor(solidJpeg(255, 255, 255)));
      final black = preprocessFaceCrop(specFor(solidJpeg(0, 0, 0)));
      expect(white.first, closeTo((255 - 127.5) / 128, 0.02));
      expect(black.first, closeTo((0 - 127.5) / 128, 0.02));
    });

    test('keeps every value inside the range the model was trained on', () {
      final out = preprocessFaceCrop(specFor(solidJpeg(200, 40, 90)));
      for (final v in out) {
        expect(v, inInclusiveRange(-1.0, 1.0));
      }
    });

    test('keeps channels in RGB order', () {
      // Pure red: R high, G and B low.
      final out = preprocessFaceCrop(specFor(solidJpeg(255, 0, 0)));
      expect(out[0], greaterThan(0.9));
      expect(out[1], lessThan(-0.9));
      expect(out[2], lessThan(-0.9));
    });

    test('rotating a solid image does not pull in empty corners', () {
      // The crop is padded before rotation, so a levelled face never gains a
      // black triangle that the model would read as part of the face.
      final out = preprocessFaceCrop(
        specFor(solidJpeg(200, 200, 200), rotation: 18),
      );
      expect(out.length, 112 * 112 * 3);
      for (final v in out) {
        expect(v, greaterThan(0.0));
      }
    });

    test('still produces a full tensor for a face at the image edge', () {
      final jpeg = solidJpeg(180, 180, 180);
      final spec = FaceCropSpec(
        jpegBytes: Uint8List.fromList(jpeg),
        centreX: 5,
        centreY: 5,
        side: 200,
        rotationDegrees: 0,
        inputSize: 112,
        mean: 127.5,
        std: 128.0,
      );
      expect(preprocessFaceCrop(spec).length, 112 * 112 * 3);
    });

    test('throws a clear error on bytes that are not an image', () {
      final spec = FaceCropSpec(
        jpegBytes: Uint8List.fromList('definitely not a jpeg'.codeUnits),
        centreX: 10,
        centreY: 10,
        side: 50,
        rotationDegrees: 0,
        inputSize: 112,
        mean: 127.5,
        std: 128.0,
      );
      expect(
        () => preprocessFaceCrop(spec),
        throwsA(isA<FaceEmbedderUnavailable>()),
      );
    });
  });
}
