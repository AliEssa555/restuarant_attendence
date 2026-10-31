# Download an APK from GitHub Actions

Firebase App Distribution is shelved for now. The workflow builds an APK for you to download and email manually. It does not upload to Firebase App Distribution or send invitations.

## One required secret

You only need `GOOGLE_SERVICES_JSON`, which contains the real Android app configuration downloaded from Firebase. In GitHub, go to **Settings → Secrets and variables → Actions → Secrets → New repository secret** to set it.

No repository variables, service-account credentials, or Android signing secrets are required. The App ID is read from the JSON. The Android package must be `com.demo.attendance.restaurant_attendance`.

## Get the APK

1. Merge the workflow PR into `main`.
2. Open **Actions → Android APK download**. Merging the workflow triggers a run; future changes to mobile or CI files on `main` also trigger it. Use **Run workflow → main** for a manual build.
3. Wait for the build to finish successfully. The workflow resolves dependencies, analyzes and tests the app, then builds the APK.
4. Open the run's **Summary** and click **Download APK archive**, or scroll down to **Artifacts** and click `restaurant-attendance-<run number>`.
5. Extract the downloaded ZIP. Email `app-release.apk` to your testers, or upload that APK to a file-sharing service and email its share link.

The GitHub artifact link requires GitHub sign-in and expires after 30 days. Download the APK yourself for testers who do not have GitHub access. The APK is not a public permanent download URL.

## Tester installation

Testers download the APK to an Android phone, open it and allow that browser/file app to install unknown apps when prompted. They do not need Firebase App Tester for this manual flow.

The repository's existing demo signing configuration signs the release APK with a debug key. No manual keystore creation is needed. The key can change between GitHub runners, so a later build may require uninstalling the earlier APK before installing the new one; uninstalling removes local app data. Stable release signing can be added later with Firebase distribution.

## App prerequisites

The APK connects to the real Firebase project from `GOOGLE_SERVICES_JSON`, with emulator and fake-face modes disabled. Deploy the backend and rules, create restaurant/employee accounts, and set restaurant coordinates in the portal before testing attendance.

The real face model is not included in the repository. Manual attendance is available; face attendance needs `assets/models/mobilefacenet.tflite` bundled according to `apps/mobile/assets/models/MODEL.md`.

The Flutter SDK is unavailable in the authoring environment, so the first GitHub run must verify Android compilation. Build or test failures appear in the relevant Actions step. Firebase distribution credentials and tester-group setup can wait until distribution is resumed.
