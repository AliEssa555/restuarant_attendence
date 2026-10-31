plugins {
    id("com.android.application")
    id("kotlin-android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

android {
    namespace = "com.demo.attendance.restaurant_attendance"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_17.toString()
    }

    defaultConfig {
        applicationId = "com.demo.attendance.restaurant_attendance"
        // firebase_auth requires 23+. ML Kit face detection and tflite_flutter
        // are both satisfied by 21, so 23 is the binding constraint.
        minSdk = 23
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    val releaseKeystorePath = System.getenv("ANDROID_KEYSTORE_PATH")
    signingConfigs {
        if (!releaseKeystorePath.isNullOrBlank()) {
            create("distribution") {
                storeFile = file(releaseKeystorePath)
                storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("ANDROID_KEY_ALIAS")
                keyPassword = System.getenv("ANDROID_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            // CI supplies a stable release key. Local demos retain debug signing.
            signingConfig = signingConfigs.getByName(
                if (releaseKeystorePath.isNullOrBlank()) "debug" else "distribution"
            )
        }
    }

    // The bundled .tflite model must not be compressed, or tflite_flutter
    // cannot memory-map it out of the APK.
    androidResources {
        noCompress += "tflite"
    }
}

flutter {
    source = "../.."
}
