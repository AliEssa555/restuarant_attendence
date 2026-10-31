import 'package:flutter_test/flutter_test.dart';
import 'package:restaurant_attendance/utils/restaurant_time.dart';
import 'package:timezone/data/latest_all.dart' as tzdata;

/// Current CLDR puts a narrow no-break space (U+202F) before AM/PM, which is
/// correct typography but invisible in a failure diff. Compare on normalised
/// whitespace so these tests assert the time, not the space character.
String norm(String value) =>
    value.replaceAll(' ', ' ').replaceAll(' ', ' ');

void main() {
  setUpAll(tzdata.initializeTimeZones);

  group('renders in the restaurant timezone, not the phone timezone', () {
    final at = DateTime.utc(2026, 3, 14, 4, 5);

    test('the same instant reads differently in two restaurants', () {
      expect(norm(const RestaurantTime('Asia/Karachi').time(at)), '9:05 AM');
      expect(norm(const RestaurantTime('UTC').time(at)), '4:05 AM');
    });

    test('the local date can differ from the UTC date', () {
      final evening = DateTime.utc(2026, 3, 14, 19, 30);
      expect(const RestaurantTime('UTC').isoDate(evening), '2026-03-14');
      expect(const RestaurantTime('Asia/Karachi').isoDate(evening), '2026-03-15');
    });

    test('isoDate matches the format the server writes to localDate', () {
      expect(
        const RestaurantTime('Asia/Karachi').isoDate(at),
        matches(r'^\d{4}-\d{2}-\d{2}$'),
      );
    });

    test('falls back to UTC for an unknown zone rather than throwing', () {
      expect(norm(const RestaurantTime('Mars/Olympus').time(at)), '4:05 AM');
    });

    test('handles a DST change in the restaurant zone', () {
      // US DST starts 2026-03-08, so 16:05 UTC is 09:05 local after the change
      // and 17:05 UTC is 09:05 local before it.
      const zone = RestaurantTime('America/Los_Angeles');
      expect(norm(zone.time(DateTime.utc(2026, 3, 7, 17, 5))), '9:05 AM');
      expect(norm(zone.time(DateTime.utc(2026, 3, 9, 16, 5))), '9:05 AM');
    });
  });

  group('sinceLabel', () {
    const clock = RestaurantTime('Asia/Karachi');
    final now = DateTime.utc(2026, 3, 14, 12, 0);

    test('reads "just now" within the first minute', () {
      expect(
        clock.sinceLabel(now.subtract(const Duration(seconds: 30)), now: now),
        'just now',
      );
    });

    test('shows minutes under an hour', () {
      expect(
        clock.sinceLabel(now.subtract(const Duration(minutes: 42)), now: now),
        '42m',
      );
    });

    test('shows hours and minutes over an hour', () {
      expect(
        clock.sinceLabel(
          now.subtract(const Duration(hours: 3, minutes: 7)),
          now: now,
        ),
        '3h 7m',
      );
    });

    test('shows a long shift without wrapping at 24 hours', () {
      expect(
        clock.sinceLabel(
          now.subtract(const Duration(hours: 26, minutes: 5)),
          now: now,
        ),
        '26h 5m',
      );
    });

    test('does not show a negative duration for a clock-skewed timestamp', () {
      expect(
        clock.sinceLabel(now.add(const Duration(minutes: 5)), now: now),
        'just now',
      );
    });
  });

  group('date formatting', () {
    const clock = RestaurantTime('Asia/Karachi');

    test('dayAndMonth is short and unambiguous', () {
      expect(clock.dayAndMonth(DateTime.utc(2026, 3, 14, 6, 0)), 'Sat 14 Mar');
    });

    test('full combines the date and the time', () {
      expect(
        norm(clock.full(DateTime.utc(2026, 3, 14, 4, 5))),
        'Sat 14 Mar, 9:05 AM',
      );
    });
  });
}
