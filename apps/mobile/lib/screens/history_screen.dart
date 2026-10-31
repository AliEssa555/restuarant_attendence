import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/models.dart';
import '../models/reason_codes.dart';
import '../providers/app_providers.dart';
import '../utils/restaurant_time.dart';
import '../widgets/status_chip.dart';

/// The employee's own last 30 records.
///
/// Rejected attempts are shown too, with the reason. Hiding them would leave
/// someone whose check-in silently failed with no way to see what happened.
class HistoryScreen extends ConsumerWidget {
  const HistoryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final history = ref.watch(historyProvider);
    final restaurant = ref.watch(restaurantProvider).value;
    final clock = RestaurantTime(restaurant?.timezone ?? 'Asia/Karachi');

    return Scaffold(
      appBar: AppBar(title: const Text('My history')),
      body: history.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, _) => _Empty(
          icon: Icons.cloud_off,
          title: 'Could not load your history',
          body: 'Check your connection and pull down to retry.',
        ),
        data: (records) {
          if (records.isEmpty) {
            return const _Empty(
              icon: Icons.history_toggle_off,
              title: 'Nothing yet',
              body: 'Your check-ins will appear here.',
            );
          }

          return ListView.separated(
            padding: const EdgeInsets.symmetric(vertical: 8),
            itemCount: records.length,
            separatorBuilder: (_, _) => const Divider(height: 1),
            itemBuilder: (context, i) {
              final record = records[i];
              final isFirstOfDay = i == 0 ||
                  records[i - 1].localDate != record.localDate;
              return Column(
                children: [
                  if (isFirstOfDay)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 16, 16, 6),
                      child: Align(
                        alignment: Alignment.centerLeft,
                        child: Text(
                          clock.dayAndMonth(record.createdAt),
                          style: Theme.of(context).textTheme.labelLarge?.copyWith(
                                color:
                                    Theme.of(context).colorScheme.onSurfaceVariant,
                              ),
                        ),
                      ),
                    ),
                  _RecordTile(record: record, clock: clock),
                ],
              );
            },
          );
        },
      ),
    );
  }
}

class _RecordTile extends StatelessWidget {
  const _RecordTile({required this.record, required this.clock});

  final AttendanceRecord record;
  final RestaurantTime clock;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isIn = record.type == AttendanceType.checkIn;

    return ListTile(
      leading: Icon(
        isIn ? Icons.login_rounded : Icons.logout_rounded,
        color: theme.colorScheme.onSurfaceVariant,
      ),
      title: Row(
        children: [
          Text(
            isIn ? 'Checked in' : 'Checked out',
            style: theme.textTheme.titleSmall,
          ),
          const SizedBox(width: 8),
          Icon(
            record.method == AttendanceMethod.face
                ? Icons.face_retouching_natural
                : Icons.touch_app_outlined,
            size: 15,
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ],
      ),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 2),
          Text(clock.time(record.createdAt)),
          if (record.status == AttendanceStatus.rejected &&
              record.rejectReason != null) ...[
            const SizedBox(height: 4),
            Text(
              ReasonCodes.message(record.rejectReason),
              style: theme.textTheme.bodySmall
                  ?.copyWith(color: theme.colorScheme.error),
            ),
          ],
        ],
      ),
      trailing: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          StatusChip(status: record.status),
          if (record.late && isIn) ...[
            const SizedBox(height: 5),
            LateBadge(minutesLate: record.minutesLate),
          ],
        ],
      ),
      isThreeLine: record.status == AttendanceStatus.rejected,
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty({required this.icon, required this.title, required this.body});

  final IconData icon;
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 56, color: theme.colorScheme.onSurfaceVariant),
            const SizedBox(height: 18),
            Text(title, style: theme.textTheme.titleMedium),
            const SizedBox(height: 8),
            Text(
              body,
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium
                  ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
            ),
          ],
        ),
      ),
    );
  }
}
