package com.zentra.xr.tracking

import android.content.Context
import com.zentra.xr.BuildConfig
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL

/**
 * Provides the MediaPipe Hand Landmarker model.
 * The build downloads it into the assets folder when possible; if the app was built
 * offline the user can fetch it later from Settings > Tracking.
 */
class ModelInstaller(private val context: Context) {

    enum class Status { READY, MISSING, DOWNLOADING, ERROR }

    var status: Status = Status.MISSING
        private set

    @Volatile
    var progress = 0f
        private set

    var message = ""
        private set

    val modelPath: String
        get() = File(File(context.filesDir, "models"), MODEL_NAME).absolutePath

    fun refresh() {
        val file = File(modelPath)
        status = if (file.exists() && file.length() > 1024) Status.READY else Status.MISSING
    }

    fun isReady(): Boolean = File(modelPath).let { it.exists() && it.length() > 1024 }

    /** Copies the model bundled in the APK assets (when the build had network access). */
    fun installFromAssets(): Boolean {
        return try {
            val dir = File(context.filesDir, "models")
            if (!dir.exists()) dir.mkdirs()
            val target = File(dir, MODEL_NAME)
            if (!isReady()) {
                context.assets.open("models/$MODEL_NAME").use { input ->
                    FileOutputStream(target).use { output -> input.copyTo(output) }
                }
            }
            refresh()
            status == Status.READY
        } catch (t: Throwable) {
            message = t.message ?: "assets indisponíveis"
            false
        }
    }

    /** Downloads the model. Must be called from a background thread. */
    fun download(): Boolean {
        status = Status.DOWNLOADING
        progress = 0f
        val dir = File(context.filesDir, "models")
        if (!dir.exists()) dir.mkdirs()
        val target = File(dir, MODEL_NAME)
        val tmp = File(dir, "$MODEL_NAME.part")
        return try {
            val url = URL(BuildConfig.HAND_MODEL_URL)
            val conn = url.openConnection() as HttpURLConnection
            conn.connectTimeout = 15000
            conn.readTimeout = 60000
            conn.instanceFollowRedirects = true
            conn.connect()
            if (conn.responseCode !in 200..299) {
                throw java.io.IOException("HTTP ${conn.responseCode}")
            }
            val total = conn.contentLength.toFloat()
            conn.inputStream.use { input ->
                FileOutputStream(tmp).use { output ->
                    val buffer = ByteArray(64 * 1024)
                    var read: Int
                    var done = 0f
                    while (input.read(buffer).also { read = it } > 0) {
                        output.write(buffer, 0, read)
                        done += read
                        progress = if (total > 0f) (done / total).coerceAtMost(1f) else 0f
                    }
                }
            }
            if (tmp.length() < 1024) throw java.io.IOException("arquivo incompleto")
            if (target.exists()) target.delete()
            tmp.renameTo(target)
            progress = 1f
            refresh()
            status == Status.READY
        } catch (t: Throwable) {
            tmp.delete()
            status = Status.ERROR
            message = t.message ?: "falha no download"
            false
        }
    }

    companion object {
        const val MODEL_NAME = "hand_landmarker.task"
    }
}
