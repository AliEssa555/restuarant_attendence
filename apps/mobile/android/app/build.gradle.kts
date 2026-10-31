plugins {
    id("com.android.application")
    id("kotlin-android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

val localDemoBuild = providers.gradleProperty("localDemo").orNull == "true"

android {
    namespace = "com.demo.attendance.restaurant_attendance"
    // permission_handler_android requires API 37.
    compileSdk = 37
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        applicationId = "com.demo.attendance.restaurant_attendance"
        if (localDemoBuild) applicationIdSuffix = ".localdemo"
        manifestPlaceholders["allowLocalHttp"] = localDemoBuild.toString()
        manifestPlaceholders["appLabel"] = if (localDemoBuild) "Attendance Local Demo" else "Attendance"
        // firebase_auth requires 23+. ML Kit face detection and tflite_flutter
        // are both satisfied by 21, so 23 is the binding constraint.
        minSdk = 23
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    buildTypes {
        release {
            // Demo only: signed with the debug keys so `flutter build apk` works
            // out of the box. Replace with a real signing config before shipping.
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    // The bundled .tflite model must not be compressed, or tflite_flutter
    // cannot memory-map it out of the APK.
    androidResources {
        noCompress += "tflite"
    }
}

// Kotlin 2.4 uses the typed compiler DSL.
kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

flutter {
    source = "../.."
}
