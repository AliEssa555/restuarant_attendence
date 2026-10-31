/// Reject reason codes from the server (TECHNICAL_PLAN.md §7.5) and the message
/// the employee actually sees.
///
/// The codes are a contract shared with `firebase/functions/src/lib/errors.ts`
/// and the portal. An unknown code falls back to a generic message rather than
/// showing the raw code, but still logs it.
class ReasonCodes {
  const ReasonCodes._();

  static const markerNotFound = 'MARKER_NOT_FOUND';
  static const markerInvalid = 'MARKER_INVALID';
  static const faceNotEnrolled = 'FACE_NOT_ENROLLED';
  static const faceModelMismatch = 'FACE_MODEL_MISMATCH';
  static const noFace = 'NO_FACE';
  static const multipleFaces = 'MULTIPLE_FACES';
  static const faceMismatch = 'FACE_MISMATCH';
  static const embeddingInvalid = 'EMBEDDING_INVALID';
  static const photoStale = 'PHOTO_STALE';
  static const photoReused = 'PHOTO_REUSED';
  static const rateLimited = 'RATE_LIMITED';
  static const alreadyCheckedIn = 'ALREADY_CHECKED_IN';
  static const notCheckedIn = 'NOT_CHECKED_IN';
  static const methodNotAllowed = 'METHOD_NOT_ALLOWED';
  static const employeeInactive = 'EMPLOYEE_INACTIVE';

  static const Map<String, String> _messages = {
    markerNotFound:
        "We couldn't see the check-in poster. Stand in front of it and try again.",
    markerInvalid:
        'That poster is out of date. Ask your manager to print the current one.',
    faceNotEnrolled:
        'Your face is not approved yet. Ask your manager to approve your enrolment.',
    faceModelMismatch:
        'The app was updated. Please enrol your face again.',
    noFace: "We couldn't find a face in the photo. Hold the phone at eye level.",
    multipleFaces:
        'More than one person is in the photo. Make sure you are alone in frame.',
    faceMismatch:
        "That doesn't look like you. Try again in better light, or check in manually.",
    embeddingInvalid:
        'Something went wrong reading your face. Retake the photo.',
    photoStale: 'That photo took too long to upload. Take a fresh one.',
    photoReused: 'That photo was already used. Take a new one.',
    rateLimited: 'Too many tries. Wait a few minutes and check in again.',
    alreadyCheckedIn: 'You are already checked in.',
    notCheckedIn: 'You are not checked in yet.',
    methodNotAllowed: 'That check-in method is turned off for this restaurant.',
    employeeInactive: 'Your account is inactive. Ask your manager.',
  };

  /// The employee-facing message for a reason code.
  static String message(String? code) {
    if (code == null) return 'Something went wrong. Please try again.';
    return _messages[code] ?? 'Something went wrong. Please try again. ($code)';
  }

  /// True when retrying immediately could plausibly succeed.
  static bool isRetryable(String? code) {
    switch (code) {
      case alreadyCheckedIn:
      case notCheckedIn:
      case methodNotAllowed:
      case employeeInactive:
      case faceNotEnrolled:
      case rateLimited:
        return false;
      default:
        return true;
    }
  }

  /// Every code, for the widget test that asserts each has a message.
  static List<String> get all => _messages.keys.toList(growable: false);
}
