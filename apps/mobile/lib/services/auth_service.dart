import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

import '../models/models.dart';

/// Sign-in, the forced first password change, and the claims the rest of the
/// app routes on.
class AuthService {
  AuthService({FirebaseAuth? auth, FirebaseFirestore? firestore})
      : _auth = auth ?? FirebaseAuth.instance,
        _firestore = firestore ?? FirebaseFirestore.instance;

  final FirebaseAuth _auth;
  final FirebaseFirestore _firestore;

  Stream<User?> get authStateChanges => _auth.authStateChanges();
  User? get currentUser => _auth.currentUser;

  Future<void> signIn({required String email, required String password}) async {
    await _auth.signInWithEmailAndPassword(
      email: email.trim(),
      password: password,
    );
  }

  Future<void> signOut() => _auth.signOut();

  Future<void> sendPasswordReset(String email) =>
      _auth.sendPasswordResetEmail(email: email.trim());

  /// Change the password and clear `mustChangePassword`.
  ///
  /// Firebase requires a recent sign-in for this, so the current password is
  /// re-entered and used to reauthenticate — which also means a borrowed,
  /// already-unlocked phone cannot be used to change the password.
  Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    final user = _auth.currentUser;
    if (user == null || user.email == null) {
      throw FirebaseAuthException(
        code: 'no-current-user',
        message: 'You are not signed in.',
      );
    }

    await user.reauthenticateWithCredential(
      EmailAuthProvider.credential(email: user.email!, password: currentPassword),
    );
    await user.updatePassword(newPassword);

    // The security rules allow exactly this one client write: setting your own
    // mustChangePassword to false.
    await _firestore
        .collection('users')
        .doc(user.uid)
        .update({'mustChangePassword': false});
  }

  /// Claims, refreshed from the server.
  ///
  /// Needed right after `createEmployee` sets them, and after an account is
  /// disabled — a cached token would still look valid for up to an hour.
  Future<AuthClaims> claims({bool forceRefresh = false}) async {
    final user = _auth.currentUser;
    if (user == null) return const AuthClaims.empty();
    final token = await user.getIdTokenResult(forceRefresh);
    final c = token.claims ?? const {};
    return AuthClaims(
      role: roleFromString(c['role'] as String?),
      restaurantId: c['rid'] as String?,
      employeeId: c['eid'] as String?,
    );
  }
}

/// The custom claims the server attached to this account.
class AuthClaims {
  const AuthClaims({
    required this.role,
    required this.restaurantId,
    required this.employeeId,
  });

  const AuthClaims.empty()
      : role = Role.unknown,
        restaurantId = null,
        employeeId = null;

  final Role role;
  final String? restaurantId;
  final String? employeeId;

  /// Only employees may use this app at all; owners and managers belong in the
  /// portal and have no `eid` to check in with.
  bool get isEmployee =>
      role == Role.employee && restaurantId != null && employeeId != null;
}

/// A sign-in failure, in words an employee can act on.
String authErrorMessage(Object error) {
  if (error is! FirebaseAuthException) {
    return 'Could not sign in. Check your connection and try again.';
  }
  return switch (error.code) {
    'invalid-email' => 'That email address does not look right.',
    'user-disabled' => 'This account has been turned off. Ask your manager.',
    'user-not-found' ||
    'wrong-password' ||
    'invalid-credential' =>
      'Wrong email or password.',
    'too-many-requests' => 'Too many attempts. Wait a minute and try again.',
    'weak-password' => 'Pick a longer password — at least 8 characters.',
    'requires-recent-login' => 'Please sign in again, then change your password.',
    'network-request-failed' =>
      'No connection. Check the restaurant wifi and try again.',
    _ => error.message ?? 'Could not sign in. Try again.',
  };
}
