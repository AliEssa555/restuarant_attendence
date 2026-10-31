import 'package:flutter_test/flutter_test.dart';
import 'package:restaurant_attendance/models/reason_codes.dart';

/// The server's reason codes are a contract. If a code gains a message on the
/// server but not here, the employee sees a raw identifier instead of an
/// instruction — so this list is kept in lockstep deliberately.
const _serverReasonCodes = <String>[
  'MARKER_NOT_FOUND',
  'MARKER_INVALID',
  'FACE_NOT_ENROLLED',
  'FACE_MODEL_MISMATCH',
  'NO_FACE',
  'MULTIPLE_FACES',
  'FACE_MISMATCH',
  'EMBEDDING_INVALID',
  'PHOTO_STALE',
  'PHOTO_REUSED',
  'RATE_LIMITED',
  'ALREADY_CHECKED_IN',
  'NOT_CHECKED_IN',
  'METHOD_NOT_ALLOWED',
  'EMPLOYEE_INACTIVE',
  'LOCATION_REQUIRED',
  'LOCATION_OUT_OF_RANGE',
  'LOCATION_MOCK',
  'LOCATION_ACCURACY_LOW',
  'LOCATION_STALE',
];

void main() {
  group('message', () {
    test('covers every code the server can send', () {
      for (final code in _serverReasonCodes) {
        final message = ReasonCodes.message(code);
        expect(message, isNotEmpty, reason: code);
        expect(
          message.contains(code),
          isFalse,
          reason: '$code fell through to the generic message',
        );
      }
    });

    test('has no codes here that the server does not send', () {
      expect(ReasonCodes.all.toSet(), _serverReasonCodes.toSet());
    });

    test('reads as an instruction, not a status', () {
      // Every message should be a full sentence an employee can act on.
      for (final code in _serverReasonCodes) {
        final message = ReasonCodes.message(code);
        expect(message.endsWith('.'), isTrue, reason: code);
        expect(message[0], message[0].toUpperCase(), reason: code);
        expect(message.length, greaterThan(15), reason: code);
      }
    });

    test('falls back safely for an unknown code from a newer server', () {
      final message = ReasonCodes.message('SOMETHING_NEW');
      expect(message, contains('SOMETHING_NEW'));
      expect(message, startsWith('Something went wrong'));
    });

    test('handles a null code', () {
      expect(ReasonCodes.message(null), isNotEmpty);
    });

    test('names the poster for the marker codes', () {
      expect(ReasonCodes.message(ReasonCodes.markerNotFound), contains('poster'));
      expect(ReasonCodes.message(ReasonCodes.markerInvalid), contains('poster'));
    });
  });

  group('isRetryable', () {
    test('offers a retry for the fixable problems', () {
      for (final code in [
        ReasonCodes.markerNotFound,
        ReasonCodes.noFace,
        ReasonCodes.multipleFaces,
        ReasonCodes.faceMismatch,
        ReasonCodes.photoStale,
        ReasonCodes.photoReused,
        ReasonCodes.embeddingInvalid,
      ]) {
        expect(ReasonCodes.isRetryable(code), isTrue, reason: code);
      }
    });

    test('does not offer a retry where retrying cannot help', () {
      for (final code in [
        ReasonCodes.alreadyCheckedIn,
        ReasonCodes.notCheckedIn,
        ReasonCodes.methodNotAllowed,
        ReasonCodes.employeeInactive,
        ReasonCodes.faceNotEnrolled,
        ReasonCodes.rateLimited,
      ]) {
        expect(ReasonCodes.isRetryable(code), isFalse, reason: code);
      }
    });
  });
}
