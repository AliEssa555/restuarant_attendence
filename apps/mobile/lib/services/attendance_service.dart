import 'dart:io';
import 'dart:math';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter_image_compress/flutter_image_compress.dart';
import 'package:path_provider/path_provider.dart';

import '../env.dart';
import 'location_service.dart';
import '../firebase_bootstrap.dart';
import '../models/models.dart';

/// Everything the app sends to the server: photo uploads and the three
/// employee-facing callables.
///
/// The app uploads evidence and asks for a verdict. It never sends a similarity
/// score or a status. GPS capture time is evidence checked against the server
/// clock; attendance time and the verdict are always assigned by the server.
class AttendanceService {
  AttendanceService({FirebaseStorage? storage, FirebaseFunctions? callables})
      : _storage = storage ?? FirebaseStorage.instance,
        _functions = callables ?? functions;

  final FirebaseStorage _storage;
  final FirebaseFunctions _functions;
  final Random _random = Random.secure();

  /// Resize to a 1600px long edge at JPEG q85 — small enough to upload on a
  /// restaurant's wifi, large enough that the poster's QR code survives.
  Future<File> compressForUpload(File source) async {
    final dir = await getTemporaryDirectory();
    final target =
        '${dir.path}/upload_${DateTime.now().millisecondsSinceEpoch}.jpg';
    final result = await FlutterImageCompress.compressAndGetFile(
      source.absolute.path,
      target,
      minWidth: 1600,
      minHeight: 1600,
      quality: 85,
      keepExif: false,
    );
    // If the platform plugin declines (rare, and always on an odd codec), the
    // original is still a valid JPEG under the 3 MB rule.
    return result == null ? source : File(result.path);
  }

  /// Upload a check-in photo and return its Storage path.
  Future<String> uploadCheckinPhoto({
    required String restaurantId,
    required String employeeId,
    required File jpeg,
    void Function(double progress)? onProgress,
  }) async {
    final path =
        'checkins/$restaurantId/$employeeId/${DateTime.now().millisecondsSinceEpoch}.jpg';
    await _upload(path, jpeg, onProgress);
    return path;
  }

  /// Upload the straight-on enrolment photo and return its Storage path.
  Future<String> uploadEnrolmentPhoto({
    required String restaurantId,
    required String employeeId,
    required File jpeg,
    void Function(double progress)? onProgress,
  }) async {
    final path =
        'faces/$restaurantId/$employeeId/enrol-${DateTime.now().millisecondsSinceEpoch}.jpg';
    await _upload(path, jpeg, onProgress);
    return path;
  }

  Future<void> _upload(
    String path,
    File jpeg,
    void Function(double progress)? onProgress,
  ) async {
    final task = _storage.ref(path).putFile(
          jpeg,
          SettableMetadata(contentType: 'image/jpeg'),
        );
    if (onProgress != null) {
      task.snapshotEvents.listen((snap) {
        if (snap.totalBytes > 0) {
          onProgress(snap.bytesTransferred / snap.totalBytes);
        }
      });
    }
    await task;
  }

  /// A fresh idempotency key. If the call times out and the app retries with
  /// the same key, the server returns the original record instead of creating
  /// a second one.
  String newRequestId() {
    final bytes = List<int>.generate(16, (_) => _random.nextInt(256));
    return bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  }

  Future<AttendanceOutcome> recordManual({
    required AttendanceType type,
    required String clientRequestId,
    GpsCapture? gpsCoords,
  }) async {
    final result = await _functions.httpsCallable('recordAttendance').call({
      'type': attendanceTypeToWire(type),
      'method': 'manual',
      'clientRequestId': clientRequestId,
      if (gpsCoords != null) 'gpsCoords': gpsCoords.toJson(),
      'device': _device(),
    });
    return AttendanceOutcome.fromCallable(
      Map<String, dynamic>.from(result.data as Map),
    );
  }

  Future<AttendanceOutcome> recordFace({
    required AttendanceType type,
    required String clientRequestId,
    GpsCapture? gpsCoords,
    required String photoPath,
    required List<double> embedding,
    required int facesDetected,
    required String modelVersion,
  }) async {
    final result = await _functions.httpsCallable('recordAttendance').call({
      'type': attendanceTypeToWire(type),
      'method': 'face',
      'clientRequestId': clientRequestId,
      if (gpsCoords != null) 'gpsCoords': gpsCoords.toJson(),
      'photoPath': photoPath,
      'embedding': embedding,
      'facesDetected': facesDetected,
      'modelVersion': modelVersion,
      'device': _device(),
    });
    return AttendanceOutcome.fromCallable(
      Map<String, dynamic>.from(result.data as Map),
    );
  }

  Future<void> submitFaceEnrolment({
    required String photoPath,
    required List<double> embedding,
    required String modelVersion,
  }) async {
    await _functions.httpsCallable('submitFaceEnrolment').call({
      'photoPath': photoPath,
      'embedding': embedding,
      'modelVersion': modelVersion,
    });
  }

  Map<String, String> _device() => {
        'platform': Platform.operatingSystem,
        'appVersion': Env.appVersion,
      };
}

/// Pull the server's reason code out of a failed callable.
///
/// Cloud Functions puts our `{ code: 'MARKER_NOT_FOUND' }` payload in
/// `details`; everything else is an ordinary network or permission failure.
String? reasonCodeOf(Object error) {
  if (error is! FirebaseFunctionsException) return null;
  final details = error.details;
  if (details is Map && details['code'] is String) {
    return details['code'] as String;
  }
  return null;
}
