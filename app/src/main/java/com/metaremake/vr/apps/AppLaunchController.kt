package com.metaremake.vr.apps

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.provider.Settings
import org.json.JSONArray
import org.json.JSONObject

/**
 * Launches existing Android apps (via their launcher intents) and exposes them
 * to the VR launcher as an app list. All interaction with the launched app
 * happens through the AccessibilityBridge (authorized gestures) once the screen
 * is captured by MediaProjection.
 */
class AppLaunchController(private val context: Context) {

    data class AppInfo(val packageName: String, val label: String)

    fun launchPackage(packageName: String): String? {
        return try {
            val intent = context.packageManager.getLaunchIntentForPackage(packageName)
            if (intent == null) {
                "no launch intent for $packageName"
            } else {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(intent)
                null
            }
        } catch (t: Throwable) {
            t.message ?: "failed to launch $packageName"
        }
    }

    fun launchUrl(url: String): String? {
        return try {
            val intent = Intent(Intent.ACTION_VIEW, android.net.Uri.parse(if (url.startsWith("http")) url else "https://$url"))
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
            null
        } catch (t: Throwable) {
            t.message ?: "failed to open url"
        }
    }

    fun launchHome(): String? {
        return try {
            val intent = Intent(Intent.ACTION_MAIN).apply {
                addCategory(Intent.CATEGORY_HOME)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
            null
        } catch (t: Throwable) {
            t.message ?: "failed to open home"
        }
    }

    /** Installed launchable apps, as a JSON array for the VR launcher. */
    fun installedApps(): JSONArray {
        val out = JSONArray()
        try {
            val pm = context.packageManager
            val intent = Intent(Intent.ACTION_MAIN, null).addCategory(Intent.CATEGORY_LAUNCHER)
            val resolved = if (android.os.Build.VERSION.SDK_INT >= 33) {
                pm.queryIntentActivities(intent, PackageManager.ResolveInfoFlags.of(0))
            } else {
                @Suppress("DEPRECATION")
                pm.queryIntentActivities(intent, 0)
            }
            val seen = HashSet<String>()
            for (ri in resolved) {
                val pkg = ri.activityInfo?.packageName ?: continue
                if (!seen.add(pkg)) continue
                val label = ri.loadLabel(pm)?.toString() ?: pkg
                val o = JSONObject()
                o.put("package", pkg)
                o.put("label", label)
                out.put(o)
            }
        } catch (t: Throwable) {
            com.metaremake.vr.util.MLog.w("AppLaunch", "installedApps failed: ${t.message}")
        }
        return out
    }

    /** Whether our accessibility service is enabled. */
    fun isAccessibilityEnabled(): Boolean {
        val expected = ComponentName(context, AccessibilityBridge::class.java).flattenToString()
        val enabled = Settings.Secure.getString(
            context.contentResolver,
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        ) ?: return false
        return enabled.split(':').any { it.equals(expected, ignoreCase = true) || it.contains("AccessibilityBridge") }
    }

    fun openAccessibilitySettings(): String? {
        return try {
            context.startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            null
        } catch (t: Throwable) {
            t.message ?: "cannot open accessibility settings"
        }
    }
}
