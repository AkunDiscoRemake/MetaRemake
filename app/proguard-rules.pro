# MetaRemake ProGuard rules.
# MediaPipe ships its own consumer rules; keep the JNI entry points reachable.
-keep class com.google.mediapipe.** { *; }
-keep class com.google.mediapipe.tasks.** { *; }
-keep class com.google.mediapipe.framework.** { *; }
-dontwarn com.google.mediapipe.**

# JS bridge exposed to the WebView via addJavascriptInterface.
-keepclassmembers class com.metaremake.vr.bridge.NativeBridge {
    @android.webkit.JavascriptInterface <methods>;
}

# Kotlin coroutines / metadata.
-keepattributes *Annotation*, InnerClasses, EnclosingMethod, Signature
