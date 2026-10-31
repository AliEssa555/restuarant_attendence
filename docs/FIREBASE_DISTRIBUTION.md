# Android tester build

The app must first be connected to your Firebase project using the README's Firebase setup. Register the Android package `com.demo.attendance.restaurant_attendance`, then select that app in Firebase Console → App Distribution → Get started. Create a tester group such as `restaurant-testers`.

From `apps/mobile`:

```bash
flutter pub get
flutter analyze
flutter test
flutter build apk --release
```

The APK is `apps/mobile/build/app/outputs/flutter-apk/app-release.apk`. This repository currently signs release builds with the debug key for demo testing. Configure a stable release signing key before production use; changing signing keys prevents updating an existing installation in place.

From the repository root, after installing Firebase CLI and signing in:

```bash
firebase login
firebase appdistribution:distribute apps/mobile/build/app/outputs/flutter-apk/app-release.apk \
  --app YOUR_FIREBASE_ANDROID_APP_ID \
  --groups restaurant-testers \
  --release-notes "GPS attendance: owner fence settings and mock-location audit trail"
```

Use the Android App ID from Firebase project settings, rather than the project ID. Uploading with a tester group sends invitations; run this command only when ready to invite those testers. They accept the invitation with the invited Google account and follow the installation instructions, optionally using Firebase App Tester.

Before testing, deploy the functions and Firestore rules together. In the owner portal, set the restaurant latitude, longitude and radius, then save. Both check-in and check-out require GPS by default. Test inside/outside the fence and a mock GPS provider; rejected attempts should appear in attendance details without changing presence. An emulator fix may be flagged as mocked. To exercise other emulator flows, explicitly disable location in that demo restaurant's settings.

GPS evidence is reported by the phone. The backend checks reported mock status, accuracy, capture age and distance against its own clock and settings; this does not authenticate a GPS signal or defeat a modified client. Photo upload freshness remains a separate check.

Official instructions: https://firebase.google.com/docs/app-distribution/android/distribute-cli
