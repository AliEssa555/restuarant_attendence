import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/models.dart';
import '../services/attendance_service.dart';
import '../services/auth_service.dart';
import '../services/employee_repository.dart';
import '../services/face_embedder.dart';

/// Service singletons.

final authServiceProvider = Provider<AuthService>((ref) => AuthService());

final attendanceServiceProvider =
    Provider<AttendanceService>((ref) => AttendanceService());

final employeeRepositoryProvider =
    Provider<EmployeeRepository>((ref) => EmployeeRepository());

/// One embedder for the app's lifetime: loading the TFLite model and spinning
/// up its isolate costs a noticeable moment, and the camera screens are entered
/// repeatedly.
final faceEmbedderProvider = Provider<FaceEmbedder>((ref) {
  final embedder = FaceEmbedder.create();
  ref.onDispose(embedder.dispose);
  return embedder;
});

/// Auth state and claims.

final authStateProvider = StreamProvider<User?>(
  (ref) => ref.watch(authServiceProvider).authStateChanges,
);

/// Claims, re-read whenever the signed-in user changes.
///
/// Forced to refresh because `createEmployee` sets the claims *after* the
/// account exists: a token minted at first sign-in would have no `rid`.
final claimsProvider = FutureProvider<AuthClaims>((ref) async {
  final user = ref.watch(authStateProvider).value;
  if (user == null) return const AuthClaims.empty();
  return ref.watch(authServiceProvider).claims(forceRefresh: true);
});

/// The signed-in employee's identity, once both auth and claims have landed.
class Session {
  const Session({
    required this.uid,
    required this.restaurantId,
    required this.employeeId,
  });

  final String uid;
  final String restaurantId;
  final String employeeId;
}

/// Null until we know the caller is an employee of a restaurant.
final sessionProvider = Provider<Session?>((ref) {
  final user = ref.watch(authStateProvider).value;
  final claims = ref.watch(claimsProvider).value;
  if (user == null || claims == null || !claims.isEmployee) return null;
  return Session(
    uid: user.uid,
    restaurantId: claims.restaurantId!,
    employeeId: claims.employeeId!,
  );
});

/// Live documents.

final appUserProvider = StreamProvider<AppUser?>((ref) {
  final user = ref.watch(authStateProvider).value;
  if (user == null) return Stream.value(null);
  return ref.watch(employeeRepositoryProvider).watchUser(user.uid);
});

final employeeProvider = StreamProvider<Employee?>((ref) {
  final session = ref.watch(sessionProvider);
  if (session == null) return Stream.value(null);
  return ref
      .watch(employeeRepositoryProvider)
      .watchEmployee(session.restaurantId, session.employeeId);
});

final restaurantProvider = StreamProvider<Restaurant?>((ref) {
  final session = ref.watch(sessionProvider);
  if (session == null) return Stream.value(null);
  return ref
      .watch(employeeRepositoryProvider)
      .watchRestaurant(session.restaurantId);
});

final historyProvider = StreamProvider<List<AttendanceRecord>>((ref) {
  final session = ref.watch(sessionProvider);
  if (session == null) return Stream.value(const []);
  return ref
      .watch(employeeRepositoryProvider)
      .watchMyHistory(session.restaurantId, session.employeeId);
});
