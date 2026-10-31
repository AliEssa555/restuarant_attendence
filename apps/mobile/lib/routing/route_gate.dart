/// Where the app should be, given what it knows about the signed-in account.
///
/// Kept as a pure function so the gate can be unit-tested without a Navigator,
/// Firebase, or a widget tree — the ordering of these rules is the part that
/// actually goes wrong.
class Routes {
  const Routes._();

  static const splash = '/';
  static const login = '/login';
  static const changePassword = '/change-password';
  static const enrol = '/enrol';
  static const home = '/home';
  static const capture = '/capture';
  static const history = '/history';
  static const profile = '/profile';
  static const debugSimilarity = '/debug/similarity';
}

/// Everything the gate needs, flattened out of the providers.
class GateState {
  const GateState({
    required this.loading,
    required this.signedIn,
    required this.isEmployee,
    required this.mustChangePassword,
    required this.needsEnrolment,
    required this.enrolmentPending,
    required this.manualAllowed,
    required this.enrolmentSkipped,
  });

  /// Auth, claims or the employee document have not arrived yet.
  final bool loading;
  final bool signedIn;

  /// Signed in, and with employee claims. Owners and managers belong in the
  /// portal and are bounced back to the login screen.
  final bool isEmployee;
  final bool mustChangePassword;

  /// `face.status` is `none` or `rejected`.
  final bool needsEnrolment;

  /// `face.status` is `pending` — waiting on a manager.
  final bool enrolmentPending;

  /// The restaurant allows manual check-in, so enrolment can wait.
  final bool manualAllowed;

  /// The employee chose "not now" on the enrolment screen this session.
  final bool enrolmentSkipped;
}

/// The route the app belongs on, or null to stay where it is.
///
/// Order matters: a forced password change has to come before anything that
/// would write data, and an account that is not an employee account must never
/// reach the check-in screen.
String? resolveRoute(GateState state, String current) {
  if (state.loading) {
    return current == Routes.splash ? null : Routes.splash;
  }

  if (!state.signedIn || !state.isEmployee) {
    return current == Routes.login ? null : Routes.login;
  }

  if (state.mustChangePassword) {
    return current == Routes.changePassword ? null : Routes.changePassword;
  }

  // Enrolment is only *forced* when there is no other way to check in.
  // Otherwise it is offered once and can be skipped, because an employee at the
  // start of a shift should never be locked out of a manual check-in.
  final mustEnrolNow =
      state.needsEnrolment && !state.manualAllowed && !state.enrolmentSkipped;
  final shouldOfferEnrolment = state.needsEnrolment && !state.enrolmentSkipped;

  if (mustEnrolNow) {
    return current == Routes.enrol ? null : Routes.enrol;
  }

  if (current == Routes.splash ||
      current == Routes.login ||
      current == Routes.changePassword) {
    return shouldOfferEnrolment ? Routes.enrol : Routes.home;
  }

  // An employee whose enrolment is awaiting approval can still use the app; the
  // enrolment screen shows the waiting state if they navigate back to it.
  if (current == Routes.enrol &&
      !state.needsEnrolment &&
      !state.enrolmentPending) {
    return Routes.home;
  }

  return null;
}
