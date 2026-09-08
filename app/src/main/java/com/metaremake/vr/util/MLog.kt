package com.metaremake.vr.util

import android.util.Log

/**
 * Tiny centralized logger so the whole runtime reports through one tag and can
 * be silenced per-subsystem.
 */
object MLog {
    const val TAG = "MetaRemake"
    var verbose = true

    @JvmStatic
    fun d(tag: String, msg: String) { if (verbose) Log.d(TAG, "[$tag] $msg") }

    @JvmStatic
    fun w(tag: String, msg: String) { Log.w(TAG, "[$tag] $msg") }

    @JvmStatic
    fun e(tag: String, msg: String, t: Throwable? = null) {
        if (t == null) Log.e(TAG, "[$tag] $msg") else Log.e(TAG, "[$tag] $msg", t)
    }
}
