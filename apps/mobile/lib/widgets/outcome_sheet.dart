import 'package:flutter/material.dart';

import '../models/models.dart';
import '../models/reason_codes.dart';

/// The outcome of an attendance attempt, shown the same way wherever it came
/// from (manual button, face capture) so employees learn one pattern.
///
/// Returns true if the employee asked to retry.
Future<bool> showOutcomeSheet(
  BuildContext context, {
  required AttendanceOutcome outcome,
  bool allowRetry = false,
}) async {
  final (icon, title, tone) = switch (outcome.status) {
    AttendanceStatus.verified => (
        Icons.check_circle_rounded,
        outcome.duplicate ? 'Already recorded' : 'Done',
        _Tone.success,
      ),
    AttendanceStatus.pendingReview => (
        Icons.hourglass_top_rounded,
        'Sent for manager review',
        _Tone.warning,
      ),
    AttendanceStatus.rejected => (
        Icons.cancel_rounded,
        'Not accepted',
        _Tone.error,
      ),
  };

  final body = switch (outcome.status) {
    AttendanceStatus.verified when outcome.duplicate =>
      'This check-in was already saved. Nothing was recorded twice.',
    AttendanceStatus.verified when outcome.late =>
      'Recorded. You were ${outcome.minutesLate} minutes late.',
    AttendanceStatus.verified => 'Recorded. Have a good shift.',
    AttendanceStatus.pendingReview =>
      "We couldn't be certain it was you, so your manager will check the photo. "
          'Your time has been recorded in the meantime.',
    AttendanceStatus.rejected => ReasonCodes.message(outcome.rejectReason),
  };

  final retryable = allowRetry &&
      outcome.status == AttendanceStatus.rejected &&
      ReasonCodes.isRetryable(outcome.rejectReason);

  return await _show(
    context,
    icon: icon,
    title: title,
    body: body,
    tone: tone,
    allowRetry: retryable,
  );
}

/// A failure that never produced a record — a network error, a rate limit, or a
/// wrong presence state.
Future<bool> showFailureSheet(
  BuildContext context, {
  required String message,
  bool allowRetry = false,
}) =>
    _show(
      context,
      icon: Icons.error_outline_rounded,
      title: 'Could not check in',
      body: message,
      tone: _Tone.error,
      allowRetry: allowRetry,
    );

enum _Tone { success, warning, error }

Future<bool> _show(
  BuildContext context, {
  required IconData icon,
  required String title,
  required String body,
  required _Tone tone,
  required bool allowRetry,
}) async {
  final result = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    builder: (context) {
      final theme = Theme.of(context);
      final scheme = theme.colorScheme;
      final colour = switch (tone) {
        _Tone.success => scheme.primary,
        _Tone.warning => scheme.tertiary,
        _Tone.error => scheme.error,
      };

      return SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 28, 24, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Icon(icon, size: 56, color: colour),
              const SizedBox(height: 16),
              Text(
                title,
                textAlign: TextAlign.center,
                style: theme.textTheme.headlineSmall,
              ),
              const SizedBox(height: 10),
              Text(
                body,
                textAlign: TextAlign.center,
                style: theme.textTheme.bodyLarge
                    ?.copyWith(color: scheme.onSurfaceVariant),
              ),
              const SizedBox(height: 28),
              if (allowRetry) ...[
                FilledButton(
                  onPressed: () => Navigator.of(context).pop(true),
                  child: const Text('Try again'),
                ),
                const SizedBox(height: 10),
                OutlinedButton(
                  onPressed: () => Navigator.of(context).pop(false),
                  child: const Text('Not now'),
                ),
              ] else
                FilledButton(
                  onPressed: () => Navigator.of(context).pop(false),
                  child: const Text('Done'),
                ),
            ],
          ),
        ),
      );
    },
  );
  return result ?? false;
}
