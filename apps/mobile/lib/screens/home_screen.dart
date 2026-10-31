import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../env.dart';
import '../models/models.dart';
import '../models/reason_codes.dart';
import '../providers/app_providers.dart';
import '../routing/route_gate.dart';
import '../services/attendance_service.dart';
import '../services/location_service.dart';
import '../utils/restaurant_time.dart';
import '../widgets/outcome_sheet.dart';

/// The screen an employee actually uses: am I in, and the one button that
/// changes that.
class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  bool _busy = false;

  Future<void> _manual(AttendanceType type) async {
    setState(() => _busy = true);
    final service = ref.read(attendanceServiceProvider);
    try {
      final restaurant = ref.read(restaurantProvider).value;
      if (restaurant == null) throw const LocationException('Restaurant settings are still loading. Try again.');
      final gps = restaurant.requireLocation ? await LocationService.capture() : null;
      final outcome = await service.recordManual(
        type: type,
        clientRequestId: service.newRequestId(),
        gpsCoords: gps,
      );
      if (!mounted) return;
      await showOutcomeSheet(context, outcome: outcome);
    } catch (err) {
      if (!mounted) return;
      await showFailureSheet(
        context,
        message: err is LocationException ? err.message : ReasonCodes.message(reasonCodeOf(err)),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final employee = ref.watch(employeeProvider).value;
    final restaurant = ref.watch(restaurantProvider).value;

    if (employee == null || restaurant == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    final clock = RestaurantTime(restaurant.timezone);
    final isIn = employee.isCheckedIn;
    final nextType = isIn ? AttendanceType.checkOut : AttendanceType.checkIn;
    final faceReady = employee.canUseFace(Env.modelVersion);

    return Scaffold(
      appBar: AppBar(
        title: Text(restaurant.name),
        actions: [
          IconButton(
            tooltip: 'My history',
            icon: const Icon(Icons.history),
            onPressed: () => context.push(Routes.history),
          ),
          IconButton(
            tooltip: 'Profile',
            icon: const Icon(Icons.person_outline),
            onPressed: () => context.push(Routes.profile),
          ),
        ],
      ),
      body: SafeArea(
        child: RefreshIndicator(
          // The streams are live, so this is only here because people pull to
          // refresh regardless and a dead gesture reads as a hung app.
          onRefresh: () async => ref.invalidate(employeeProvider),
          child: ListView(
            padding: const EdgeInsets.all(20),
            children: [
              Text(
                'Hello, ${employee.name.split(' ').first}',
                style: theme.textTheme.headlineSmall,
              ),
              if (employee.position != null) ...[
                const SizedBox(height: 4),
                Text(
                  employee.position!,
                  style: theme.textTheme.bodyMedium
                      ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                ),
              ],
              const SizedBox(height: 20),
              _PresenceCard(employee: employee, clock: clock),
              const SizedBox(height: 24),
              if (!employee.active)
                _Notice(
                  icon: Icons.block,
                  text: 'Your account is inactive. Ask your manager.',
                  tone: _Tone.error,
                )
              else ...[
                if (restaurant.allowsFace)
                  FilledButton.icon(
                    onPressed: (_busy || !faceReady)
                        ? null
                        : () => context.push(
                              '${Routes.capture}?type=${attendanceTypeToWire(nextType)}',
                            ),
                    icon: const Icon(Icons.face_retouching_natural),
                    label: Text(
                      isIn ? 'Check out with face' : 'Check in with face',
                    ),
                  ),
                if (restaurant.allowsFace && restaurant.allowsManual)
                  const SizedBox(height: 12),
                if (restaurant.allowsManual)
                  OutlinedButton.icon(
                    onPressed: _busy ? null : () => _manual(nextType),
                    icon: _busy
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2.5),
                          )
                        : const Icon(Icons.touch_app_outlined),
                    label: Text(isIn ? 'Check out manually' : 'Check in manually'),
                  ),
                if (restaurant.allowsFace && !faceReady) ...[
                  const SizedBox(height: 16),
                  _FaceNotReadyNotice(employee: employee),
                ],
              ],
              if (Env.debugSimilarity) ...[
                const SizedBox(height: 32),
                OutlinedButton.icon(
                  onPressed: () => context.push(Routes.debugSimilarity),
                  icon: const Icon(Icons.science_outlined),
                  label: const Text('Similarity calibration (debug)'),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// "In since 9:04 AM" / "Not checked in".
class _PresenceCard extends StatelessWidget {
  const _PresenceCard({required this.employee, required this.clock});

  final Employee employee;
  final RestaurantTime clock;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final isIn = employee.isCheckedIn;
    final since = employee.lastEventAt;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Row(
          children: [
            Container(
              width: 52,
              height: 52,
              decoration: BoxDecoration(
                color: (isIn ? scheme.primary : scheme.outline)
                    .withValues(alpha: 0.14),
                shape: BoxShape.circle,
              ),
              child: Icon(
                isIn ? Icons.login_rounded : Icons.logout_rounded,
                color: isIn ? scheme.primary : scheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    isIn ? 'Checked in' : 'Not checked in',
                    style: theme.textTheme.titleMedium,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    switch ((isIn, since)) {
                      (true, final DateTime at) =>
                        'Since ${clock.time(at)} · ${clock.sinceLabel(at)}',
                      (false, final DateTime at) =>
                        'Last out at ${clock.time(at)}',
                      _ => 'No activity yet today',
                    },
                    style: theme.textTheme.bodyMedium
                        ?.copyWith(color: scheme.onSurfaceVariant),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Explains why "check in with face" is disabled, and what to do about it.
class _FaceNotReadyNotice extends StatelessWidget {
  const _FaceNotReadyNotice({required this.employee});

  final Employee employee;

  @override
  Widget build(BuildContext context) {
    final (text, tone) = switch (employee.faceStatus) {
      FaceStatus.pending => (
          'Your face enrolment is waiting for manager approval.',
          _Tone.info,
        ),
      FaceStatus.rejected => (
          'Your manager rejected your enrolment photos. Enrol again.',
          _Tone.error,
        ),
      FaceStatus.none => (
          'Enrol your face to use face check-in.',
          _Tone.info,
        ),
      FaceStatus.approved => (
          // Approved, but against a different model than this build carries —
          // the server would reject the check-in with FACE_MODEL_MISMATCH.
          'The app was updated. Please enrol your face again.',
          _Tone.info,
        ),
    };

    return Column(
      children: [
        _Notice(icon: Icons.face_outlined, text: text, tone: tone),
        if (employee.faceStatus != FaceStatus.pending) ...[
          const SizedBox(height: 12),
          OutlinedButton(
            onPressed: () => GoRouter.of(context).push(Routes.enrol),
            child: const Text('Enrol my face'),
          ),
        ],
      ],
    );
  }
}

enum _Tone { info, error }

class _Notice extends StatelessWidget {
  const _Notice({required this.icon, required this.text, required this.tone});

  final IconData icon;
  final String text;
  final _Tone tone;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final (bg, fg) = tone == _Tone.error
        ? (scheme.errorContainer, scheme.onErrorContainer)
        : (scheme.secondaryContainer, scheme.onSecondaryContainer);

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        children: [
          Icon(icon, size: 20, color: fg),
          const SizedBox(width: 10),
          Expanded(child: Text(text, style: TextStyle(color: fg))),
        ],
      ),
    );
  }
}
