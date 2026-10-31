import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../models/models.dart';
import '../models/reason_codes.dart';
import '../providers/app_providers.dart';
import '../services/attendance_service.dart';
import '../services/location_service.dart';
import '../services/face_embedder.dart';
import '../widgets/camera_capture.dart';
import '../widgets/outcome_sheet.dart';

/// Face check-in: capture, analyse on device, confirm, upload, get a verdict
/// (TECHNICAL_PLAN.md §7.4).
///
/// The on-device pipeline runs *before* the preview, so a photo that cannot
/// produce an embedding is never uploaded and never costs the employee a wait.
class FaceCaptureScreen extends ConsumerStatefulWidget {
  const FaceCaptureScreen({required this.type, super.key});

  final AttendanceType type;

  @override
  ConsumerState<FaceCaptureScreen> createState() => _FaceCaptureScreenState();
}

enum _Phase { camera, analysing, preview, uploading, verifying }

class _FaceCaptureScreenState extends ConsumerState<FaceCaptureScreen> {
  _Phase _phase = _Phase.camera;
  File? _photo;
  FaceEmbedding? _embedding;
  GpsCapture? _gps;
  String? _hint;
  double _uploadProgress = 0;

  bool get _isCheckIn => widget.type == AttendanceType.checkIn;

  Future<void> _onCaptured(File jpeg) async {
    setState(() {
      _phase = _Phase.analysing;
      _photo = jpeg;
      _hint = null;
    });

    try {
      final restaurant = ref.read(restaurantProvider).value;
      if (restaurant == null) throw const LocationException('Restaurant settings are still loading. Try again.');
      _gps = restaurant.requireLocation ? await LocationService.capture() : null;
      final embedding = await ref.read(faceEmbedderProvider).embedFile(jpeg);
      if (!mounted) return;
      setState(() {
        _embedding = embedding;
        _phase = _Phase.preview;
      });
    } on LocationException catch (err) {
      if (!mounted) return;
      setState(() { _hint = err.message; _phase = _Phase.camera; });
    } on FaceCaptureException catch (err) {
      if (!mounted) return;
      setState(() {
        _hint = err.message;
        _phase = _Phase.camera;
      });
    } on FaceEmbedderUnavailable catch (err) {
      if (!mounted) return;
      setState(() {
        _hint = err.message;
        _phase = _Phase.camera;
      });
    }
  }

  Future<void> _submit() async {
    final photo = _photo;
    final embedding = _embedding;
    final session = ref.read(sessionProvider);
    if (photo == null || embedding == null || session == null) return;

    final service = ref.read(attendanceServiceProvider);
    // One id for this attempt, reused if the call has to be retried, so a
    // timeout cannot produce two records.
    final requestId = service.newRequestId();

    setState(() {
      _phase = _Phase.uploading;
      _uploadProgress = 0;
    });

    try {
      final compressed = await service.compressForUpload(photo);
      final photoPath = await service.uploadCheckinPhoto(
        restaurantId: session.restaurantId,
        employeeId: session.employeeId,
        jpeg: compressed,
        onProgress: (p) {
          if (mounted) setState(() => _uploadProgress = p);
        },
      );

      if (!mounted) return;
      setState(() => _phase = _Phase.verifying);

      final outcome = await service.recordFace(
        type: widget.type,
        clientRequestId: requestId,
        gpsCoords: _gps,
        photoPath: photoPath,
        embedding: embedding.embedding,
        facesDetected: embedding.facesDetected,
        modelVersion: embedding.modelVersion,
      );

      if (!mounted) return;
      final retry = await showOutcomeSheet(
        context,
        outcome: outcome,
        allowRetry: true,
      );
      if (!mounted) return;
      if (retry) {
        setState(() {
          _phase = _Phase.camera;
          _photo = null;
          _embedding = null;
          _hint = null;
        });
      } else {
        context.pop();
      }
    } catch (err) {
      if (!mounted) return;
      final code = reasonCodeOf(err);
      final retry = await showFailureSheet(
        context,
        message: err is LocationException ? err.message : ReasonCodes.message(code),
        allowRetry: ReasonCodes.isRetryable(code),
      );
      if (!mounted) return;
      if (retry) {
        setState(() {
          _phase = _Phase.camera;
          _photo = null;
          _embedding = null;
        });
      } else {
        context.pop();
      }
    }
  }

  void _retake() {
    setState(() {
      _phase = _Phase.camera;
      _photo = null;
      _embedding = null;
      _hint = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: Text(_isCheckIn ? 'Check in' : 'Check out'),
      ),
      body: switch (_phase) {
        _Phase.camera => Column(
            children: [
              if (_hint != null) _HintBanner(message: _hint!),
              Expanded(
                child: CameraCaptureView(
                  instruction:
                      'Stand in front of the check-in poster so the QR code is '
                      'visible behind you, then take the photo.',
                  onCaptured: _onCaptured,
                ),
              ),
            ],
          ),
        _Phase.analysing => const _Working(label: 'Checking the photo...'),
        _Phase.preview => _Preview(
            photo: _photo!,
            onUse: _submit,
            onRetake: _retake,
          ),
        _Phase.uploading => _Working(
            label: 'Uploading photo...',
            progress: _uploadProgress == 0 ? null : _uploadProgress,
          ),
        _Phase.verifying => const _Working(label: 'Verifying...'),
      },
    );
  }
}

class _HintBanner extends StatelessWidget {
  const _HintBanner({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      color: Theme.of(context).colorScheme.errorContainer,
      padding: const EdgeInsets.all(14),
      child: Row(
        children: [
          Icon(Icons.info_outline,
              size: 20, color: Theme.of(context).colorScheme.onErrorContainer),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              message,
              style: TextStyle(
                color: Theme.of(context).colorScheme.onErrorContainer,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Preview extends StatelessWidget {
  const _Preview({
    required this.photo,
    required this.onUse,
    required this.onRetake,
  });

  final File photo;
  final VoidCallback onUse;
  final VoidCallback onRetake;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Expanded(
          child: Center(
            child: Image.file(photo, fit: BoxFit.contain),
          ),
        ),
        Container(
          color: Colors.black,
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
          child: SafeArea(
            top: false,
            child: Column(
              children: [
                const Text(
                  'Can you see the poster behind you in this photo?',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.white70, fontSize: 14.5),
                ),
                const SizedBox(height: 16),
                FilledButton(onPressed: onUse, child: const Text('Use photo')),
                const SizedBox(height: 10),
                OutlinedButton(
                  onPressed: onRetake,
                  style: OutlinedButton.styleFrom(
                    foregroundColor: Colors.white,
                    side: const BorderSide(color: Colors.white54),
                  ),
                  child: const Text('Retake'),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _Working extends StatelessWidget {
  const _Working({required this.label, this.progress});

  final String label;
  final double? progress;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          SizedBox(
            width: 52,
            height: 52,
            child: CircularProgressIndicator(
              value: progress,
              strokeWidth: 3,
              color: Colors.white,
            ),
          ),
          const SizedBox(height: 22),
          Text(label, style: const TextStyle(color: Colors.white, fontSize: 16)),
        ],
      ),
    );
  }
}
