import 'dart:io';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/app_providers.dart';
import '../services/face_embedder.dart';
import '../widgets/camera_capture.dart';

/// Hidden calibration screen, behind `--dart-define=DEBUG_SIMILARITY=true`.
///
/// This is how `faceVerifyThreshold` and `faceReviewThreshold` get their
/// values (TECHNICAL_PLAN.md M5). Point it at the same person in different
/// light, then at different people, and read off where the two distributions
/// separate. Record the numbers in `assets/models/MODEL.md`.
///
/// It shows the similarity the *server* would compute, using the same enrolment
/// vector and the same cosine formula — but nothing here is ever sent, and no
/// attendance is recorded.
final _enrolledEmbeddingProvider = FutureProvider<List<double>?>((ref) async {
  final session = ref.watch(sessionProvider);
  if (session == null) return null;
  final snap = await FirebaseFirestore.instance
      .collection('restaurants')
      .doc(session.restaurantId)
      .collection('employees')
      .doc(session.employeeId)
      .get();
  final face = snap.data()?['face'] as Map<String, dynamic>?;
  final raw = face?['embedding'] as List<dynamic>?;
  if (raw == null) return null;
  return raw.map((n) => (n as num).toDouble()).toList();
});

class DebugSimilarityScreen extends ConsumerStatefulWidget {
  const DebugSimilarityScreen({super.key});

  @override
  ConsumerState<DebugSimilarityScreen> createState() =>
      _DebugSimilarityScreenState();
}

class _DebugSimilarityScreenState
    extends ConsumerState<DebugSimilarityScreen> {
  final List<_Sample> _samples = [];
  List<double>? _reference;
  String? _hint;
  bool _busy = false;

  Future<void> _onCaptured(File jpeg) async {
    setState(() {
      _busy = true;
      _hint = null;
    });
    try {
      final result = await ref.read(faceEmbedderProvider).embedFile(jpeg);
      final enrolled = await ref.read(_enrolledEmbeddingProvider.future);
      if (!mounted) return;

      final reference = _reference ?? enrolled;
      setState(() {
        _reference ??= enrolled;
        _samples.insert(
          0,
          _Sample(
            at: DateTime.now(),
            vsEnrolled:
                enrolled == null ? null : cosineSimilarity(enrolled, result.embedding),
            vsPrevious: reference == null || _samples.isEmpty
                ? null
                : cosineSimilarity(_samples.first.embedding, result.embedding),
            embedding: result.embedding,
          ),
        );
      });
    } on FaceCaptureException catch (err) {
      if (mounted) setState(() => _hint = err.message);
    } on FaceEmbedderUnavailable catch (err) {
      if (mounted) setState(() => _hint = err.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final enrolled = ref.watch(_enrolledEmbeddingProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Similarity calibration')),
      body: Column(
        children: [
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(14),
            color: Theme.of(context).colorScheme.secondaryContainer,
            child: Text(
              enrolled.value == null
                  ? 'No approved enrolment on this account yet — only '
                      'capture-to-capture scores will be shown.'
                  : 'Comparing each capture against the approved enrolment '
                      'embedding and against the previous capture.',
              style: TextStyle(
                color: Theme.of(context).colorScheme.onSecondaryContainer,
                fontSize: 13,
              ),
            ),
          ),
          if (_hint != null)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              color: Theme.of(context).colorScheme.errorContainer,
              child: Text(_hint!),
            ),
          Expanded(
            flex: 3,
            child: CameraCaptureView(
              instruction: 'Capture repeatedly: same face in different light, '
                  'then a different person.',
              busy: _busy,
              onCaptured: _onCaptured,
            ),
          ),
          Expanded(
            flex: 2,
            child: _samples.isEmpty
                ? const Center(child: Text('No captures yet'))
                : ListView.separated(
                    itemCount: _samples.length,
                    separatorBuilder: (_, _) => const Divider(height: 1),
                    itemBuilder: (context, i) {
                      final s = _samples[i];
                      return ListTile(
                        dense: true,
                        leading: Text('#${_samples.length - i}'),
                        title: Text(
                          s.vsEnrolled == null
                              ? 'vs enrolment: n/a'
                              : 'vs enrolment: ${s.vsEnrolled!.toStringAsFixed(4)}',
                          style: const TextStyle(
                            fontFeatures: [],
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        subtitle: Text(
                          s.vsPrevious == null
                              ? 'vs previous capture: -'
                              : 'vs previous capture: ${s.vsPrevious!.toStringAsFixed(4)}',
                        ),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}

class _Sample {
  const _Sample({
    required this.at,
    required this.embedding,
    this.vsEnrolled,
    this.vsPrevious,
  });

  final DateTime at;
  final List<double> embedding;
  final double? vsEnrolled;
  final double? vsPrevious;
}
