import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_storage/firebase_storage.dart';

import 'env.dart';
import 'firebase_options.dart';

/// Initialise Firebase and, when asked, redirect everything to the local
/// Emulator Suite.
///
/// Call this once from `main` before `runApp`.
Future<void> bootstrapFirebase() async {
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);

  if (!Env.useEmulators) return;

  final host = Env.emulatorHost;

  await FirebaseAuth.instance.useAuthEmulator(host, Env.authEmulatorPort);
  FirebaseFirestore.instance.useFirestoreEmulator(host, Env.firestoreEmulatorPort);
  await FirebaseStorage.instance.useStorageEmulator(host, Env.storageEmulatorPort);
  FirebaseFunctions.instanceFor(region: Env.functionsRegion)
      .useFunctionsEmulator(host, Env.functionsEmulatorPort);
}

/// The callable client, always pinned to the deployed region.
FirebaseFunctions get functions =>
    FirebaseFunctions.instanceFor(region: Env.functionsRegion);
