# Verification status

What has actually been run on this machine, and what is still unverified.

## Verified

| Check | Command | Result |
|---|---|---|
| Cloud Functions compile | `npm run build:functions` | clean |
| Cloud Functions typecheck | `npm run typecheck:functions` | clean |
| Cloud Functions unit tests | `npm run test:functions` | 93 passing |
| All 10 callables load and register | `firebase emulators:start --only functions,auth` | all 10 in `asia-south1` |
| Emulator config valid | as above | Auth + Functions start, UI on :4000 |
| Portal production build | `npm run build:portal` | 13 routes |
| Portal typecheck | `npm run typecheck:portal` | clean |
| Portal lint | `npx next lint` | clean |
| Flutter static analysis | `npm run analyze:mobile` | no issues |
| Flutter tests | `npm run test:mobile` | 63 passing |
| Seed script typecheck | `npm --prefix scripts run typecheck` | clean |

## Not verified — needs a JDK

The Firestore and Storage emulators are JVM processes, and there is no Java on
this machine (`java -version` fails). That blocks:

- **`npm run test:rules`** — the Firestore and Storage rules tests in
  `firebase/tests`. They are written and cover every §9 and §6 bullet, but have
  never been executed, so treat them as unreviewed until they pass once.
- **`npm run seed`** — needs the Firestore and Auth emulators together.
- **Any end-to-end run**: owner signup, creating an employee, a manual check-in
  moving the dashboard, a face check-in through `recordAttendance`.

Install a JDK ([Temurin](https://adoptium.net/) is fine), then:

```bash
java -version          # expect 11 or newer
npm run emulators      # all four emulators should now start
npm run seed
npm run test:rules
```

## Not verified — needs a real Android device

- The ML Kit face detection path and the TFLite interpreter. Both need a
  physical device; `FAKE_FACE=true` covers everything around them.
- End-to-end face check-in against a printed poster, and therefore the
  threshold calibration described in `MODEL.md`.

## Deliberately incomplete

- **No `.tflite` model is committed.** No MobileFaceNet TFLite build with
  verifiable licence terms was found, and bundling a model of unknown provenance
  is a licensing decision rather than a build step. The loader fails with a
  clear, actionable message and `FAKE_FACE=true` exercises the whole flow. See
  `MODEL.md`.
- **The similarity thresholds are placeholders.** They are model-specific and
  must be measured; the calibration screen and procedure exist for exactly that.


## GPS continuation checks

- Location is required by default for both attendance methods and event types.
- Owner settings include coordinates, radius (10–5000 m), browser location, map link and enable toggle.
- Location failures are stored as rejected attendance. Supplied GPS evidence includes actual distance and mock status. Presence is unchanged.
- A repeated employee/request key returns the original outcome, including rejected attempts; transaction IDs also prevent concurrent duplicate writes.
- The source helper directory was absent from GitHub because `firebase/functions/.gitignore` matched every `lib` directory. The rule now ignores only the root build output; source helpers have been restored.
- `npm --prefix firebase/functions test` covers the location gate, callable persistence/retry flow and restored helpers.
- `npm --prefix firebase/functions run build` and `npm --prefix apps/portal run typecheck` check TypeScript.
- Security rules tests include owner access, legacy settings compatibility and invalid GPS settings. They require Firestore and Storage emulators.
- Flutter SDK is required for `flutter pub get`, `flutter analyze` and `flutter test`. Regenerate the mobile dependency lockfile after resolving geolocator on a Flutter workstation.
- Real Android/iOS permission prompts, GPS accuracy and APK installation still need device verification.


### Verified in the continuation environment

- 34 backend tests passed.
- 77 Firestore/Storage rules tests passed against local emulators.
- Functions TypeScript build and portal production build passed.
- Existing face-write test now attempts an actual value change rather than the already-seeded approved value.
- Storage immutability test now attempts a content change. It exposed an overwrite path, fixed by requiring `resource == null` on photo creation.
- Flutter analysis/tests and Android/iOS device checks were not run: the Flutter SDK is unavailable here. The mobile lockfile needs regeneration with `flutter pub get`.
