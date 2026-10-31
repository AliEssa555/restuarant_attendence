import 'package:flutter_test/flutter_test.dart';
import 'package:restaurant_attendance/routing/route_gate.dart';

/// The gate decides what an employee is allowed to reach. The ordering of its
/// rules is the part that breaks, so each rule gets a case that would fail if
/// the rules were reordered.
GateState state({
  bool loading = false,
  bool signedIn = true,
  bool isEmployee = true,
  bool mustChangePassword = false,
  bool needsEnrolment = false,
  bool enrolmentPending = false,
  bool manualAllowed = true,
  bool enrolmentSkipped = false,
}) =>
    GateState(
      loading: loading,
      signedIn: signedIn,
      isEmployee: isEmployee,
      mustChangePassword: mustChangePassword,
      needsEnrolment: needsEnrolment,
      enrolmentPending: enrolmentPending,
      manualAllowed: manualAllowed,
      enrolmentSkipped: enrolmentSkipped,
    );

void main() {
  group('while loading', () {
    test('holds on the splash screen', () {
      expect(resolveRoute(state(loading: true), Routes.splash), isNull);
    });

    test('pulls any other route back to splash', () {
      expect(resolveRoute(state(loading: true), Routes.home), Routes.splash);
      expect(resolveRoute(state(loading: true), Routes.capture), Routes.splash);
    });
  });

  group('signed out', () {
    test('goes to login', () {
      expect(resolveRoute(state(signedIn: false), Routes.splash), Routes.login);
    });

    test('stays on login once there', () {
      expect(resolveRoute(state(signedIn: false), Routes.login), isNull);
    });

    test('cannot reach the capture screen', () {
      expect(resolveRoute(state(signedIn: false), Routes.capture), Routes.login);
    });
  });

  group('a manager account', () {
    test('is sent back to login even though it is signed in', () {
      expect(
        resolveRoute(state(isEmployee: false), Routes.home),
        Routes.login,
      );
    });

    test('cannot reach the capture screen', () {
      expect(
        resolveRoute(state(isEmployee: false), Routes.capture),
        Routes.login,
      );
    });
  });

  group('forced password change', () {
    test('takes priority over the home screen', () {
      expect(
        resolveRoute(state(mustChangePassword: true), Routes.home),
        Routes.changePassword,
      );
    });

    test('takes priority over enrolment', () {
      expect(
        resolveRoute(
          state(mustChangePassword: true, needsEnrolment: true, manualAllowed: false),
          Routes.enrol,
        ),
        Routes.changePassword,
      );
    });

    test('stays put once there', () {
      expect(
        resolveRoute(state(mustChangePassword: true), Routes.changePassword),
        isNull,
      );
    });
  });

  group('enrolment', () {
    test('is forced when face is the only allowed method', () {
      expect(
        resolveRoute(
          state(needsEnrolment: true, manualAllowed: false),
          Routes.home,
        ),
        Routes.enrol,
      );
    });

    test('is offered, not forced, when manual check-in is available', () {
      // Offered on arrival...
      expect(
        resolveRoute(state(needsEnrolment: true), Routes.splash),
        Routes.enrol,
      );
      // ...but the employee is not dragged back from the home screen.
      expect(resolveRoute(state(needsEnrolment: true), Routes.home), isNull);
    });

    test('can be skipped, and then the home screen is reachable', () {
      expect(
        resolveRoute(
          state(needsEnrolment: true, enrolmentSkipped: true),
          Routes.splash,
        ),
        Routes.home,
      );
    });

    test('cannot be skipped away from when face is the only method', () {
      // "Not now" must not strand someone with no way to check in at all, so
      // the skip is honoured — the enrolment screen hides the button instead.
      expect(
        resolveRoute(
          state(needsEnrolment: true, manualAllowed: false, enrolmentSkipped: true),
          Routes.home,
        ),
        isNull,
      );
    });

    test('is left open while waiting for manager approval', () {
      expect(
        resolveRoute(state(enrolmentPending: true), Routes.enrol),
        isNull,
      );
    });

    test('redirects away once approved', () {
      expect(resolveRoute(state(), Routes.enrol), Routes.home);
    });
  });

  group('a settled employee', () {
    test('lands on home from splash', () {
      expect(resolveRoute(state(), Routes.splash), Routes.home);
    });

    test('lands on home after signing in', () {
      expect(resolveRoute(state(), Routes.login), Routes.home);
    });

    test('lands on home after changing their password', () {
      expect(resolveRoute(state(), Routes.changePassword), Routes.home);
    });

    test('is left alone on the inner screens', () {
      for (final route in [
        Routes.home,
        Routes.capture,
        Routes.history,
        Routes.profile,
      ]) {
        expect(resolveRoute(state(), route), isNull, reason: route);
      }
    });
  });
}
