# The JS bridge is reached by name from JavaScript — never rename it.
-keepclassmembers class com.metaport.fanmade.MetaPortBridge {
   @android.webkit.JavascriptInterface <methods>;
}
-keepattributes JavascriptInterface
-keepattributes *Annotation*
