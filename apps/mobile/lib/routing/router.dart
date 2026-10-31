import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../env.dart';
import '../models/models.dart';
import '../providers/app_providers.dart';
import '../screens/change_password_screen.dart';
import '../screens/debug_similarity_screen.dart';
import '../screens/enrolment_screen.dart';
import '../screens/face_capture_screen.dart';
import '../screens/history_screen.dart';
import '../screens/home_screen.dart';
import '../screens/login_screen.dart';
import '../screens/profile_screen.dart';
import '../screens/splash_screen.dart';
import 'route_gate.dart';

/// Set when the employee taps "Not now" on the enrolment screen, so the gate
/// stops sending them back. Deliberately not persisted: the offer returns next
/// time the app is opened.
class EnrolmentSkipped extends Notifier<bool> {
  @override
  bool build() => false;

  void skip() => state = true;
}

final enrolmentSkippedProvider =
    NotifierProvider<EnrolmentSkipped, bool>(EnrolmentSkipped.new);

/// Collapse the providers the gate depends on into a [GateState].
GateState _gateState(Ref ref) {
  final auth = ref.watch(authStateProvider);
  final claims = ref.watch(claimsProvider);
  final appUser = ref.watch(appUserProvider);
  final employee = ref.watch(employeeProvider);
  final restaurant = ref.watch(restaurantProvider);

  final signedIn = auth.value != null;
  final isEmployee = claims.value?.isEmployee ?? false;

  // While signed out there is nothing left to wait for, so the login screen
  // must not be held behind a spinner.
  final loading = auth.isLoading ||
      (signedIn && claims.isLoading) ||
      (signedIn && isEmployee && (appUser.isLoading || employee.isLoading));

  final face = employee.value?.faceStatus;

  return GateState(
    loading: loading,
    signedIn: signedIn,
    isEmployee: isEmployee,
    mustChangePassword: appUser.value?.mustChangePassword ?? false,
    needsEnrolment: face == FaceStatus.none || face == FaceStatus.rejected,
    enrolmentPending: face == FaceStatus.pending,
    // Default to allowing manual while the restaurant document is in flight,
    // so a slow read cannot trap someone on the enrolment screen.
    manualAllowed: restaurant.value?.allowsManual ?? true,
    enrolmentSkipped: ref.watch(enrolmentSkippedProvider),
  );
}

/// Bridges Riverpod changes into something go_router will listen to.
class _GateListenable extends ChangeNotifier {
  _GateListenable(Ref ref) {
    ref.listen(authStateProvider, (_, _) => notifyListeners());
    ref.listen(claimsProvider, (_, _) => notifyListeners());
    ref.listen(appUserProvider, (_, _) => notifyListeners());
    ref.listen(employeeProvider, (_, _) => notifyListeners());
    ref.listen(restaurantProvider, (_, _) => notifyListeners());
    ref.listen(enrolmentSkippedProvider, (_, _) => notifyListeners());
  }
}

final routerProvider = Provider<GoRouter>((ref) {
  final listenable = _GateListenable(ref);
  ref.onDispose(listenable.dispose);

  return GoRouter(
    initialLocation: Routes.splash,
    refreshListenable: listenable,
    redirect: (context, state) =>
        resolveRoute(_gateState(ref), state.matchedLocation),
    routes: [
      GoRoute(path: Routes.splash, builder: (_, _) => const SplashScreen()),
      GoRoute(path: Routes.login, builder: (_, _) => const LoginScreen()),
      GoRoute(
        path: Routes.changePassword,
        builder: (_, _) => const ChangePasswordScreen(),
      ),
      GoRoute(path: Routes.enrol, builder: (_, _) => const EnrolmentScreen()),
      GoRoute(path: Routes.home, builder: (_, _) => const HomeScreen()),
      GoRoute(
        path: Routes.capture,
        builder: (_, state) => FaceCaptureScreen(
          // `check_out` when the employee is already in; the home screen passes
          // this so the capture screen does not have to re-derive presence.
          type: state.uri.queryParameters['type'] == 'check_out'
              ? AttendanceType.checkOut
              : AttendanceType.checkIn,
        ),
      ),
      GoRoute(path: Routes.history, builder: (_, _) => const HistoryScreen()),
      GoRoute(path: Routes.profile, builder: (_, _) => const ProfileScreen()),
      if (Env.debugSimilarity)
        GoRoute(
          path: Routes.debugSimilarity,
          builder: (_, _) => const DebugSimilarityScreen(),
        ),
    ],
  );
});
