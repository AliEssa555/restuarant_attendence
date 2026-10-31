# Automatic Android APK distribution

The `Android APK to Firebase` GitHub Actions workflow builds, tests and signs the app, saves the APK as a workflow artifact, then uploads it to Firebase App Distribution for a tester group. It runs on `main` when mobile code, CI helpers or the workflow change. You can also select **Actions → Android APK to Firebase → Run workflow → main**.

## 1. Set up Firebase once

1. In your real Firebase project, register an Android app with package name `com.demo.attendance.restaurant_attendance`. Download its `google-services.json` from Project settings → Your apps.
2. Open **App Distribution**, select that Android app, and complete **Get started**.
3. In **Testers & Groups**, create a group with alias `restaurant-testers` and add tester email addresses. Use the group alias in CI, not its display name.
4. Create a dedicated Google Cloud service account in this Firebase project and give it **Firebase App Distribution Admin** (`roles/firebaseappdistro.admin`). Create and download a JSON key for this account. This is different from `google-services.json`: it authorizes CI uploads. Do not commit it or paste it into chat.
5. Enable the Firebase App Distribution API in that project if it is not enabled.

The pipeline generates Android `firebase_options.dart` from `google-services.json` during the build, replacing the repository's emulator placeholders. No FlutterFire login is required on GitHub. The generated configuration is Android-only and is never committed.

## 2. Create a stable signing key once

On a workstation with Java (or Android Studio's bundled JDK):

```bash
keytool -genkeypair -v -keystore restaurant-release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias restaurant
```

Keep a backup of the keystore and its passwords. Reuse the same key for every build so installed apps can update. If you already have a release key, use that instead.

Convert the keystore to Base64 in Windows PowerShell:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes((Resolve-Path .\restaurant-release.jks))) | Set-Clipboard
```

On Linux:

```bash
base64 -w 0 restaurant-release.jks
```

On macOS:

```bash
base64 < restaurant-release.jks | tr -d '\n'
```

Use the copied output as the signing-key secret. Base64 is just an encoding; keep it private. If an earlier APK was signed with the demo debug key, testers need to uninstall that APK once before installing the first release-key build. Uninstalling removes local app data.

## 3. Configure GitHub Actions

Go to **Repository → Settings → Secrets and variables → Actions**. Under **Secrets**, add:

| Secret | Value |
| --- | --- |
| `GOOGLE_SERVICES_JSON` | Entire downloaded Android `google-services.json` contents, as JSON text |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Entire dedicated distribution service-account key JSON contents |
| `ANDROID_KEYSTORE_BASE64` | Base64 representation of the stable `.jks` file |
| `ANDROID_KEY_ALIAS` | `restaurant`, if you used the keytool command above |
| `ANDROID_KEYSTORE_PASSWORD` | Password used to protect the keystore |
| `ANDROID_KEY_PASSWORD` | Password for the signing key; commonly the same as the keystore password |

Under **Variables**, add:

| Variable | Value |
| --- | --- |
| `FIREBASE_APP_ID` | Firebase Android App ID, e.g. `1:123456789:android:abcdef...`, from project settings; must match `mobilesdk_app_id` in the JSON |
| `FIREBASE_TESTER_GROUPS` | `restaurant-testers`, or comma-separated group aliases |

Configure these before merging the workflow PR, since merging triggers the first build. The pipeline fails with a missing-setting message when required configuration is absent. The upload service account must belong to the same Firebase project as the Android app. Credentials are passed through environment variables, written only to temporary files and removed during cleanup.

GitHub's connected app cannot configure repository secrets here. Add them directly in the GitHub settings page.

## 4. Build and distribute

Merge the workflow PR into `main`, or run the workflow manually from `main`. It will:

1. Validate configuration and prepare the Firebase config and signing key.
2. Install Java 17, Flutter stable and Node 22.
3. Run `flutter pub get`, `flutter analyze` and `flutter test`. Analyzer errors block the build; existing warnings and informational lints are reported without blocking distribution.
4. Build a release APK using the workflow run number as the Android build number, with emulator and fake-face modes disabled.
5. Save `app-release.apk` as a GitHub Actions artifact for 14 days.
6. Authenticate using the distribution service account and upload to the configured tester group using Firebase CLI. Release notes include the build number and commit.

No upload runs on pull requests or non-main branches. A failed test/build prevents upload. Firebase service-account credentials are exposed only to the distribution step, after the build succeeds. The workflow distributes APKs and does not deploy Functions, rules or the web portal.

The Flutter SDK is not available in the authoring environment, so the first configured GitHub run must verify the Android build. `flutter pub get` resolves the new geolocator dependency; commit the updated `pubspec.lock` from a Flutter workstation when available.

## 5. Tester installation and updates

Testers receive an invitation when the APK is distributed to their group. On Android, accept the invitation, sign in with a Google account, and follow the install prompt. Firebase App Tester can be installed from the prompt or from https://appdistribution.firebase.google.com. Continue using the Google account that accepted the invitation to see the app and its newer builds. Installing App Tester alone does not grant access: the tester must be invited or join through a configured invite link.

## App setup before testing

- Deploy Firebase Functions and Firestore/Storage rules to the same Firebase project; enable the required Authentication provider as described in the main README.
- Create restaurant and employee accounts. The owner must set the restaurant's coordinates and fence radius in the portal before GPS attendance can succeed.
- The real `assets/models/mobilefacenet.tflite` model is not included in this repository. Manual attendance can be tested; real face attendance needs that model bundled according to `apps/mobile/assets/models/MODEL.md`. This workflow deliberately keeps fake-face mode disabled.
- This pipeline produces Android APKs. iOS distribution requires a separate signed IPA workflow and Apple provisioning.

## Troubleshooting

- **403 / permission denied during upload:** check the service-account role, Firebase App Distribution API and selected project.
- **App ID mismatch:** use the Firebase Android App ID, not the package name or project ID.
- **No app in App Tester:** check group alias, group membership, invitation acceptance and the Google account currently signed in.
- **App not installed / signature mismatch:** use the same signing key as the installed APK, or uninstall the earlier debug-signed build once.
- **Build failed:** open the failed Actions step. The generated APK is available under workflow artifacts if compilation passed and only Firebase upload failed.

Official references:

- https://firebase.google.com/docs/app-distribution/android/distribute-cli
- https://firebase.google.com/docs/app-distribution/authenticate-service-account?platform=android
- https://firebase.google.com/docs/app-distribution/get-set-up-as-a-tester?platform=android
- https://docs.flutter.dev/deployment/android
