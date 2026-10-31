import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../env.dart';
import '../models/models.dart';
import '../providers/app_providers.dart';
import '../routing/route_gate.dart';
import '../routing/router.dart';
import '../services/face_embedder.dart';
import '../widgets/camera_capture.dart';

/// Face enrolment: three captures, averaged into one embedding, then a manager
/// approves it (TECHNICAL_PLAN.md §7.3).
///
/// Manager approval is the anti-fraud anchor of the whole system. Averaging
/// three poses makes the stored vector tolerant of how someone stands at 7am,
/// and the local consistency check catches the case where one of the three is
/// actually a different person or a blurred mess.
const List<({String title, String instruction})> _steps = [
  (
    title: 'Look straight ahead',
    instruction: 'Hold the phone at eye level and look straight at the camera.',
  ),
  (
    title: 'Turn slightly left',
    instruction: 'Turn your head a little to your left, eyes on the camera.',
  ),
  (
    title: 'Turn slightly right',
    instruction: 'Now turn a little to your right, eyes on the camera.',
  ),
];

/// Two captures of the same person should agree at least this much. Below it,
/// one of the three photos is almost certainly bad (or not the same person).
const double _minPairSimilarity = 0.6;

class EnrolmentScreen extends ConsumerStatefulWidget {
  const EnrolmentScreen({super.key});

  @override
  ConsumerState<EnrolmentScreen> createState() => _EnrolmentScreenState();
}

class _EnrolmentScreenState extends ConsumerState<EnrolmentScreen> {
  final List<File> _photos = [];
  final List<List<double>> _embeddings = [];
  String? _hint;
  bool _submitting = false;

  Future<void> _onCaptured(File jpeg) async {
    setState(() => _hint = null);
    try {
      final result = await ref.read(faceEmbedderProvider).embedFile(jpeg);
      if (!mounted) return;
      setState(() {
        _photos.add(jpeg);
        _embeddings.add(result.embedding);
      });
      if (_embeddings.length == _steps.length) await _finish();
    } on FaceCaptureException catch (err) {
      if (!mounted) return;
      setState(() => _hint = err.message);
    } on FaceEmbedderUnavailable catch (err) {
      if (!mounted) return;
      setState(() => _hint = err.message);
    }
  }

  /// Average the three, check they agree, upload the straight-on shot, submit.
  Future<void> _finish() async {
    final session = ref.read(sessionProvider);
    if (session == null) return;

    // Consistency check before anything is uploaded.
    for (var i = 0; i < _embeddings.length; i++) {
      for (var j = i + 1; j < _embeddings.length; j++) {
        if (cosineSimilarity(_embeddings[i], _embeddings[j]) < _minPairSimilarity) {
          setState(() {
            _photos.clear();
            _embeddings.clear();
            _hint = 'Those photos did not match each other. '
                "Let's try again in better light, without a mask or sunglasses.";
          });
          return;
        }
      }
    }

    setState(() => _submitting = true);
    final service = ref.read(attendanceServiceProvider);
    try {
      final compressed = await service.compressForUpload(_photos.first);
      final photoPath = await service.uploadEnrolmentPhoto(
        restaurantId: session.restaurantId,
        employeeId: session.employeeId,
        jpeg: compressed,
      );
      await service.submitFaceEnrolment(
        photoPath: photoPath,
        embedding: averageEmbeddings(_embeddings),
        modelVersion: Env.modelVersion,
      );
      // The employee document flips to `pending` and this screen switches to
      // the waiting state on its own.
    } catch (err) {
      if (!mounted) return;
      setState(() {
        _photos.clear();
        _embeddings.clear();
        _hint = 'Could not send your enrolment. Check your connection '
            'and try again.';
      });
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final employee = ref.watch(employeeProvider).value;
    final restaurant = ref.watch(restaurantProvider).value;
    final canSkip = restaurant?.allowsManual ?? false;

    if (employee?.faceStatus == FaceStatus.pending) {
      return _WaitingForApproval(canContinue: canSkip);
    }

    if (_submitting) {
      return const Scaffold(
        body: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              CircularProgressIndicator(),
              SizedBox(height: 20),
              Text('Sending your enrolment...'),
            ],
          ),
        ),
      );
    }

    final step = _steps[_embeddings.length.clamp(0, _steps.length - 1)];

    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: Text('Enrol your face  ${_embeddings.length + 1}/${_steps.length}'),
        actions: [
          if (canSkip)
            TextButton(
              onPressed: () {
                ref.read(enrolmentSkippedProvider.notifier).skip();
                context.go(Routes.home);
              },
              child: const Text('Not now'),
            ),
        ],
      ),
      body: Column(
        children: [
          _StepHeader(
            title: step.title,
            done: _embeddings.length,
            total: _steps.length,
            hint: _hint,
          ),
          Expanded(
            child: CameraCaptureView(
              instruction: step.instruction,
              onCaptured: _onCaptured,
            ),
          ),
        ],
      ),
    );
  }
}

class _StepHeader extends StatelessWidget {
  const _StepHeader({
    required this.title,
    required this.done,
    required this.total,
    this.hint,
  });

  final String title;
  final int done;
  final int total;
  final String? hint;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      color: Colors.black,
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              for (var i = 0; i < total; i++)
                Expanded(
                  child: Container(
                    height: 4,
                    margin: EdgeInsets.only(right: i == total - 1 ? 0 : 6),
                    decoration: BoxDecoration(
                      color: i < done ? Colors.tealAccent : Colors.white24,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 14),
          Text(
            title,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 19,
              fontWeight: FontWeight.w600,
            ),
          ),
          if (hint != null) ...[
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.errorContainer,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                hint!,
                style: TextStyle(
                  color: Theme.of(context).colorScheme.onErrorContainer,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// Enrolment submitted; a manager has to compare the photo with the real person
/// before face check-in unlocks.
class _WaitingForApproval extends ConsumerWidget {
  const _WaitingForApproval({required this.canContinue});

  final bool canContinue;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Enrolment sent')),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.hourglass_top_rounded,
                  size: 64, color: theme.colorScheme.tertiary),
              const SizedBox(height: 22),
              Text('Waiting for your manager',
                  style: theme.textTheme.titleLarge, textAlign: TextAlign.center),
              const SizedBox(height: 10),
              Text(
                'Your manager will compare the photo with you in person and '
                'approve it. This screen updates by itself.',
                textAlign: TextAlign.center,
                style: theme.textTheme.bodyMedium
                    ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
              ),
              const SizedBox(height: 28),
              if (canContinue)
                FilledButton(
                  onPressed: () {
                    ref.read(enrolmentSkippedProvider.notifier).skip();
                    context.go(Routes.home);
                  },
                  child: const Text('Continue with manual check-in'),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
