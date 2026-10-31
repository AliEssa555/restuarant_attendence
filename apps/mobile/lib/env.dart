/// Build-time configuration, all supplied with `--dart-define`.
///
/// Nothing here is a secret: the Firebase client config is public by design and
/// the real access control lives in the security rules and callables.
class Env {
  const Env._();

  /// Point every Firebase service at the local Emulator Suite.
  ///
  ///     flutter run --dart-define=USE_EMULATORS=true
  static const bool localDemo = bool.fromEnvironment('LOCAL_DEMO', defaultValue: false);

  // Face recognition is deprecated for the current location attendance flow.
  static const bool faceRecognitionEnabled = false;

  static const bool useEmulators = localDemo ||
      bool.fromEnvironment('USE_EMULATORS', defaultValue: false);

  /// Host the emulators are reachable on from the device.
  ///
  /// `10.0.2.2` is the Android emulator's alias for the host machine. On a
  /// physical phone pass your computer's LAN address instead:
  ///
  ///     --dart-define=EMULATOR_HOST=192.168.1.20
  static const String emulatorHost =
      String.fromEnvironment('EMULATOR_HOST', defaultValue: '10.0.2.2');

  /// Replaces the on-device face pipeline with a fixed embedding, so the whole
  /// enrolment and check-in flow can be exercised on a simulator with no
  /// working camera. See `FaceEmbedder`.
  static const bool fakeFace =
      bool.fromEnvironment('FAKE_FACE', defaultValue: false);

  /// Shows the hidden threshold-calibration screen (TECHNICAL_PLAN.md M5).
  static const bool debugSimilarity =
      bool.fromEnvironment('DEBUG_SIMILARITY', defaultValue: false);

  /// Must match the Cloud Functions region in `firebase/functions/src/config.ts`.
  static const String functionsRegion =
      String.fromEnvironment('FUNCTIONS_REGION', defaultValue: 'asia-south1');

  /// Reported with every attendance record, so a bad build can be identified
  /// from the portal later.
  static const String appVersion = '0.1.0';

  /// Identifies the bundled TFLite model. The server refuses a check-in whose
  /// model version differs from the one used at enrolment, because embeddings
  /// from two different models are not comparable.
  static const String modelVersion = 'mobilefacenet-v1';

  static const int authEmulatorPort = 9099;
  static const int firestoreEmulatorPort = 8080;
  static const int storageEmulatorPort = 9199;
  static const int functionsEmulatorPort = 5001;
}
