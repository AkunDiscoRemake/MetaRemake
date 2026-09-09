import java.net.URL

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.zentra.xr"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.zentra.xr"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"

        buildConfigField("String", "VERSION_LABEL", "\"1.0.0\"")
        buildConfigField("String", "HAND_MODEL_URL", "\"https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task\"")

        // Keep the APK small: the heavy MediaPipe native libs are only needed on 64-bit
        // devices but 32-bit support is kept for older handsets commonly used with Cardboard.
        resourceConfigurations += setOf("en", "pt-rBR")
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
        freeCompilerArgs += listOf("-Xno-param-assertions", "-Xno-call-assertions", "-Xjvm-default=all")
    }

    buildTypes {
        debug {
            isMinifyEnabled = false
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
        release {
            isMinifyEnabled = false
            isShrinkResources = false
            // CI has no release keystore: sign with the debug key so the artifact is
            // installable as-is. Replace with a real signingConfig for store releases.
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    packaging {
        resources.excludes += setOf(
            "META-INF/DEPENDENCIES",
            "META-INF/LICENSE",
            "META-INF/LICENSE.txt",
            "META-INF/NOTICE",
            "META-INF/NOTICE.txt",
            "META-INF/*.kotlin_module"
        )
    }

    lint {
        abortOnError = false
        checkReleaseBuilds = false
    }
}

/**
 * Downloads the MediaPipe Hand Landmarker model into the assets folder.
 * Never fails the build: when offline the app offers a runtime download instead.
 */
val handModelUrl =
    "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"

tasks.register("downloadHandModel") {
    val target = layout.projectDirectory.file("src/main/assets/models/hand_landmarker.task").asFile
    onlyIf { !target.exists() }
    doLast {
        target.parentFile.mkdirs()
        try {
            // NOTE: `java` is shadowed by the Java plugin extension inside Gradle Kotlin
            // DSL scripts, so the URL class is imported at the top of this file instead.
            URL(handModelUrl).openStream().use { input ->
                target.outputStream().use { output -> input.copyTo(output) }
            }
            logger.lifecycle("Hand Landmarker model downloaded (${target.length() / 1024} KB)")
        } catch (t: Throwable) {
            target.delete()
            logger.lifecycle("Hand model download skipped: ${t.message}")
        }
    }
}

tasks.named("preBuild") { dependsOn("downloadHandModel") }

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")

    // Camera (hand tracking only - never used for passthrough/AR)
    implementation("androidx.camera:camera-core:1.4.2")
    implementation("androidx.camera:camera-camera2:1.4.2")
    implementation("androidx.camera:camera-lifecycle:1.4.2")

    // MediaPipe Hand Landmarker
    implementation("com.google.mediapipe:tasks-vision:0.10.29")

    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
}
