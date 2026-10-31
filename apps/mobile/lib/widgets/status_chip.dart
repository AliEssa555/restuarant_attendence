import 'package:flutter/material.dart';

import '../models/models.dart';

/// Verified / Pending / Rejected, with the same wording as the portal.
class StatusChip extends StatelessWidget {
  const StatusChip({required this.status, super.key});

  final AttendanceStatus status;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final (label, icon, colour) = switch (status) {
      AttendanceStatus.verified => ('Verified', Icons.check_circle, scheme.primary),
      AttendanceStatus.pendingReview =>
        ('In review', Icons.hourglass_top, scheme.tertiary),
      AttendanceStatus.rejected => ('Rejected', Icons.cancel, scheme.error),
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: colour.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 15, color: colour),
          const SizedBox(width: 5),
          Text(
            label,
            style: TextStyle(
              color: colour,
              fontSize: 12.5,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

/// A short label for a "late by N minutes" badge.
class LateBadge extends StatelessWidget {
  const LateBadge({required this.minutesLate, super.key});

  final int minutesLate;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: scheme.errorContainer,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        minutesLate >= 60
            ? 'Late ${(minutesLate / 60).floor()}h ${minutesLate % 60}m'
            : 'Late ${minutesLate}m',
        style: TextStyle(
          color: scheme.onErrorContainer,
          fontSize: 12,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}
