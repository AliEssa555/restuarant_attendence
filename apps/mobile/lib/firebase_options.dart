// PLACEHOLDER Firebase client configuration.
//
// These values are deliberately fake. They are enough to run the app against
// the local Emulator Suite, because `bootstrapFirebase()` redirects every
// service to the emulator before any request is made, and the emulators do not
// check credentials.
//
// To run against a real Firebase project, replace this file by running:
//
//     cd apps/mobile
//     flutterfire configure
//
// That rewrites this file and drops `android/app/google-services.json` into
// place. None of these values are secret — Firebase client config is public by
// design, and access control lives in the security rules and the callables.
//
// ignore_for_file: lines_longer_than_80_chars

import 'package:firebase_core/firebase_core.dart' show FirebaseOptions;
import 'package:flutter/foundation.dart'
    show TargetPlatform, defaultTargetPlatform, kIsWeb;

class DefaultFirebaseOptions {
  const DefaultFirebaseOptions._();

  static const String projectId = 'restaurant-attendance-demo';

  static FirebaseOptions get currentPlatform {
    if (kIsWeb) {
      throw UnsupportedError(
        'The employee app is Android/iOS only. Managers use the Next.js portal.',
      );
    }
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return android;
      case TargetPlatform.iOS:
        return ios;
      default:
        throw UnsupportedError(
          'No Firebase options for $defaultTargetPlatform. '
          'Run `flutterfire configure` to generate them.',
        );
    }
  }

  static const FirebaseOptions android = FirebaseOptions(
    apiKey: 'AIzaSyDEMO-emulator-placeholder-key-0001',
    appId: '1:000000000000:android:0000000000000000000000',
    messagingSenderId: '000000000000',
    projectId: projectId,
    storageBucket: '$projectId.appspot.com',
  );

  static const FirebaseOptions ios = FirebaseOptions(
    apiKey: 'AIzaSyDEMO-emulator-placeholder-key-0002',
    appId: '1:000000000000:ios:0000000000000000000000',
    messagingSenderId: '000000000000',
    projectId: projectId,
    storageBucket: '$projectId.appspot.com',
    iosBundleId: 'com.demo.attendance.restaurantAttendance',
  );
}
