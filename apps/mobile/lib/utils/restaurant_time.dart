import 'package:intl/intl.dart';
import 'package:timezone/timezone.dart' as tz;

/// Formatting helpers that always render in the restaurant's timezone.
///
/// The phone's own zone is never used: a manager in Karachi and an employee
/// whose phone is set to UTC must read the same check-in time.
class RestaurantTime {
  const RestaurantTime(this.timezone);

  final String timezone;

  tz.Location get _location {
    try {
      return tz.getLocation(timezone);
    } catch (_) {
      // An unknown zone should degrade to UTC rather than crash a check-in.
      return tz.UTC;
    }
  }

  tz.TZDateTime local(DateTime at) => tz.TZDateTime.from(at, _location);

  /// `9:04 AM`
  String time(DateTime at) => DateFormat.jm().format(local(at));

  /// `Tue 14 Mar`
  String dayAndMonth(DateTime at) => DateFormat('EEE d MMM').format(local(at));

  /// `Tue 14 Mar, 9:04 AM`
  String full(DateTime at) => '${dayAndMonth(at)}, ${time(at)}';

  /// `2026-03-14`, matching the server's `localDate` field.
  String isoDate(DateTime at) => DateFormat('yyyy-MM-dd').format(local(at));

  /// "2h 15m" since an instant, for the "In since" line on the home screen.
  String sinceLabel(DateTime from, {DateTime? now}) {
    final elapsed = (now ?? DateTime.now()).difference(from);
    if (elapsed.isNegative) return 'just now';
    final hours = elapsed.inHours;
    final minutes = elapsed.inMinutes % 60;
    if (hours == 0 && minutes == 0) return 'just now';
    if (hours == 0) return '${minutes}m';
    return '${hours}h ${minutes}m';
  }
}
