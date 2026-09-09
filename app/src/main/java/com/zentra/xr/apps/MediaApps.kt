package com.zentra.xr.apps

import android.content.ContentUris
import android.content.Context
import android.graphics.Bitmap
import android.graphics.SurfaceTexture
import android.media.MediaMetadataRetriever
import android.media.MediaPlayer
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.util.Size
import android.view.Surface
import com.zentra.xr.core.GLES11ExtCompat
import com.zentra.xr.core.Geometry
import com.zentra.xr.core.Texture
import com.zentra.xr.ui.Button3D
import com.zentra.xr.ui.Icon
import com.zentra.xr.ui.Icons
import com.zentra.xr.ui.Label3D
import com.zentra.xr.ui.Panel3D
import com.zentra.xr.ui.UiContext
import com.zentra.xr.ui.Widget
import com.zentra.xr.xr.Engine
import com.zentra.xr.xr.VrRenderer
import kotlin.math.sin

// ---------------------------------------------------------------------------
// shared media plumbing
// ---------------------------------------------------------------------------

data class MediaItem(val id: Long, val name: String, val uri: android.net.Uri)

object MediaQuery {
    fun images(context: Context, limit: Int = 60): List<MediaItem> {
        val list = ArrayList<MediaItem>()
        val collection = if (Build.VERSION.SDK_INT >= 29) {
            MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL)
        } else {
            @Suppress("DEPRECATION")
            MediaStore.Images.Media.EXTERNAL_CONTENT_URI
        }
        val projection = arrayOf(MediaStore.Images.Media._ID, MediaStore.Images.Media.DISPLAY_NAME)
        val order = "${MediaStore.Images.Media.DATE_ADDED} DESC"
        try {
            context.contentResolver.query(collection, projection, null, null, order)?.use { cursor ->
                val idCol = cursor.getColumnIndexOrThrow(MediaStore.Images.Media._ID)
                val nameCol = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DISPLAY_NAME)
                while (cursor.moveToNext() && list.size < limit) {
                    val id = cursor.getLong(idCol)
                    list.add(
                        MediaItem(
                            id,
                            cursor.getString(nameCol) ?: "photo",
                            ContentUris.withAppendedId(collection, id)
                        )
                    )
                }
            }
        } catch (t: Throwable) {
            // permission denied or no media: the app shows an empty state
        }
        return list
    }

    fun audio(context: Context, limit: Int = 60): List<MediaItem> {
        val list = ArrayList<MediaItem>()
        val collection = if (Build.VERSION.SDK_INT >= 29) {
            MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL)
        } else {
            @Suppress("DEPRECATION")
            MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
        }
        val projection = arrayOf(MediaStore.Audio.Media._ID, MediaStore.Audio.Media.TITLE)
        try {
            context.contentResolver.query(collection, projection, null, null,
                "${MediaStore.Audio.Media.TITLE} ASC")?.use { cursor ->
                val idCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media._ID)
                val nameCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.TITLE)
                while (cursor.moveToNext() && list.size < limit) {
                    val id = cursor.getLong(idCol)
                    list.add(
                        MediaItem(
                            id,
                            cursor.getString(nameCol) ?: "track",
                            ContentUris.withAppendedId(collection, id)
                        )
                    )
                }
            }
        } catch (t: Throwable) {
            // ignore
        }
        return list
    }

    fun videos(context: Context, limit: Int = 40): List<MediaItem> {
        val list = ArrayList<MediaItem>()
        val collection = if (Build.VERSION.SDK_INT >= 29) {
            MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL)
        } else {
            @Suppress("DEPRECATION")
            MediaStore.Video.Media.EXTERNAL_CONTENT_URI
        }
        val projection = arrayOf(MediaStore.Video.Media._ID, MediaStore.Video.Media.DISPLAY_NAME)
        try {
            context.contentResolver.query(collection, projection, null, null,
                "${MediaStore.Video.Media.DATE_ADDED} DESC")?.use { cursor ->
                val idCol = cursor.getColumnIndexOrThrow(MediaStore.Video.Media._ID)
                val nameCol = cursor.getColumnIndexOrThrow(MediaStore.Video.Media.DISPLAY_NAME)
                while (cursor.moveToNext() && list.size < limit) {
                    val id = cursor.getLong(idCol)
                    list.add(
                        MediaItem(
                            id,
                            cursor.getString(nameCol) ?: "video",
                            ContentUris.withAppendedId(collection, id)
                        )
                    )
                }
            }
        } catch (t: Throwable) {
            // ignore
        }
        return list
    }

    /** Loads a downscaled bitmap. Must run off the GL thread. */
    fun thumbnail(context: Context, item: MediaItem, size: Int): Bitmap? {
        return try {
            if (Build.VERSION.SDK_INT >= 29) {
                context.contentResolver.loadThumbnail(item.uri, Size(size, size), null)
            } else {
                @Suppress("DEPRECATION")
                MediaStore.Images.Thumbnails.getThumbnail(
                    context.contentResolver, item.id,
                    MediaStore.Images.Thumbnails.MINI_KIND, null
                )
            }
        } catch (t: Throwable) {
            null
        }
    }

    fun videoFrame(context: Context, item: MediaItem): Bitmap? {
        return try {
            val retriever = MediaMetadataRetriever()
            retriever.setDataSource(context, item.uri)
            val bmp = retriever.getFrameAtTime(1_000_000L, MediaMetadataRetriever.OPTION_CLOSEST_SYNC)
            retriever.release()
            bmp
        } catch (t: Throwable) {
            null
        }
    }
}

/** Video frames delivered through a SurfaceTexture into an OES texture. */
class VideoSurface {
    var texId = 0
        private set
    private var surfaceTexture: SurfaceTexture? = null
    private var surface: Surface? = null

    @Volatile
    var frameAvailable = false

    fun create() {
        if (texId != 0) return
        val ids = IntArray(1)
        GLES20.glGenTextures(1, ids, 0)
        texId = ids[0]
        GLES20.glBindTexture(GLES11ExtCompat.GL_TEXTURE_EXTERNAL_OES, texId)
        GLES20.glTexParameteri(GLES11ExtCompat.GL_TEXTURE_EXTERNAL_OES,
            GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR)
        GLES20.glTexParameteri(GLES11ExtCompat.GL_TEXTURE_EXTERNAL_OES,
            GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR)
        GLES20.glTexParameteri(GLES11ExtCompat.GL_TEXTURE_EXTERNAL_OES,
            GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE)
        GLES20.glTexParameteri(GLES11ExtCompat.GL_TEXTURE_EXTERNAL_OES,
            GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE)
        val st = SurfaceTexture(texId)
        st.setOnFrameAvailableListener({ frameAvailable = true }, Handler(Looper.getMainLooper()))
        surfaceTexture = st
        surface = Surface(st)
    }

    /** Must be called on the GL thread. */
    fun update() {
        if (frameAvailable) {
            frameAvailable = false
            try {
                surfaceTexture?.updateTexImage()
            } catch (t: Throwable) {
                // ignore
            }
        }
    }

    val surfaceForPlayer: Surface? get() = surface

    fun release() {
        surface?.release()
        surfaceTexture?.release()
        if (texId != 0) {
            GLES20.glDeleteTextures(1, intArrayOf(texId), 0)
            texId = 0
        }
        surface = null
        surfaceTexture = null
    }
}

// ---------------------------------------------------------------------------
// Gallery
// ---------------------------------------------------------------------------
class GalleryApp(engine: Engine) : XrApp(engine) {

    override val title = "VR Gallery"
    override val icon = Icon.GALLERY
    override val contentWidth = 0.84f
    override val contentHeight = 0.50f

    private val ctx: UiContext = engine.ui
    private val cards = ArrayList<Button3D>()
    private val pageButtons = ArrayList<Button3D>()
    private val infoLabel = Label3D(ctx, "", 0.018f, 1) { it.textDim }

    private val items = ArrayList<MediaItem>()
    private val textures = HashMap<Long, Texture>()
    private var page = 0
    private var fullscreenItem: MediaItem? = null
    private var fullTexture: Texture? = null
    private var loading = true
    private val pendingBitmaps = java.util.concurrent.ConcurrentLinkedQueue<Pair<Long, Bitmap>>()

    override fun onOpen() {
        infoLabel.value = "Carregando biblioteca…"
        Thread {
            val found = MediaQuery.images(engine.context)
            for (item in found.take(18)) {
                MediaQuery.thumbnail(engine.context, item, 256)?.let { pendingBitmaps.add(item.id to it) }
            }
            engine.host.runOnUi {
                items.clear()
                items.addAll(found)
                loading = false
            }
        }.apply { isDaemon = true }.start()
        buildPager()
    }

    override fun onClose() {
        textures.values.forEach { it.release() }
        textures.clear()
        fullTexture?.release()
        fullTexture = null
    }

    private fun buildPager() {
        val kit = engine.renderer.text
        val prev = Button3D(ctx, "", 0.05f, 0.05f)
        prev.icon = Icons.texture(kit, Icon.CHEVRON_LEFT)
        prev.iconSize = 0.024f
        prev.onTap = { if (page > 0) page-- }
        val next = Button3D(ctx, "", 0.05f, 0.05f)
        next.icon = Icons.texture(kit, Icon.CHEVRON_RIGHT)
        next.iconSize = 0.024f
        next.onTap = { if ((page + 1) * 6 < items.size) page++ }
        pageButtons.add(prev)
        pageButtons.add(next)
    }

    private fun ensureCards() {
        while (cards.size < 6) {
            val card = Button3D(ctx, "", 0.24f, 0.19f)
            card.radius = 0.014f
            card.onTap = {
                val index = page * 6 + cards.indexOf(card)
                if (index in items.indices) {
                    fullscreenItem = items[index]
                    loadFull(items[index])
                }
            }
            cards.add(card)
        }
    }

    private fun loadFull(item: MediaItem) {
        Thread {
            val bmp = MediaQuery.thumbnail(engine.context, item, 1024)
            if (bmp != null) pendingBitmaps.add(-item.id to bmp)
        }.apply { isDaemon = true }.start()
    }

    override fun update(dt: Float) {
        // move bitmaps produced by the worker threads into GPU textures
        while (true) {
            val pair = pendingBitmaps.poll() ?: break
            val id = pair.first
            if (id < 0L) {
                fullTexture?.release()
                fullTexture = Texture().apply { createFrom(pair.second) }
                pair.second.recycle()
            } else {
                textures[id]?.release()
                textures[id] = Texture().apply { createFrom(pair.second) }
                pair.second.recycle()
            }
        }

        ensureCards()
        val theme = engine.theme.current
        val cols = 3
        val cw = 0.26f
        val ch = 0.20f
        for ((index, card) in cards.withIndex()) {
            val slot = page * 6 + index
            val item = items.getOrNull(slot)
            card.visible = item != null
            if (item == null) continue
            val col = index % cols
            val row = index / cols
            card.size.set(cw, ch)
            card.pos.set((col - 1) * (cw + 0.02f), 0.06f - row * (ch + 0.02f), 0f)
            card.fillTop = theme.cardTop
            card.fillBottom = theme.cardBottom
            card.borderColor = theme.cardBorder
            card.borderWidth = 0.0014f
            card.radius = 0.014f
            card.image = textures[item.id]
            card.label = ""
            card.update(dt)
            card.updateWorld(parentMatrix)
        }

        pageButtons[0].pos.set(-0.40f, -0.20f, 0f)
        pageButtons[1].pos.set(0.40f, -0.20f, 0f)
        for (b in pageButtons) {
            b.fillTop = theme.raisedTop
            b.fillBottom = theme.raisedBottom
            b.borderColor = theme.cardBorder
            b.borderWidth = 0.0012f
            b.radius = 0.025f
            b.update(dt)
            b.updateWorld(parentMatrix)
        }

        infoLabel.value = when {
            loading -> "Carregando biblioteca…"
            items.isEmpty() -> "Nenhuma foto encontrada • permita o acesso às mídias"
            fullscreenItem != null -> fullscreenItem?.name ?: ""
            else -> "${items.size} fotos • página ${page + 1}/${((items.size + 5) / 6).coerceAtLeast(1)}"
        }
        infoLabel.pos.set(0f, -0.215f, 0f)
        infoLabel.update(dt)
        infoLabel.updateWorld(parentMatrix)
    }

    override fun collectTargets(out: ArrayList<Widget>) {
        val full = fullscreenItem
        if (full != null) {
            out.add(closeFullscreen)
            return
        }
        for (card in cards) if (card.visible) out.add(card)
        out.addAll(pageButtons)
    }

    private val closeFullscreen = Button3D(ctx, "Fechar", 0.12f, 0.045f).apply {
        textHeight = 0.018f
        radius = 0.022f
        onTap = {
            fullscreenItem = null
            fullTexture?.release()
            fullTexture = null
        }
    }

    override fun draw(r: VrRenderer) {
        val theme = r.theme
        val full = fullscreenItem
        if (full != null) {
            val tex = fullTexture
            r.push()
            r.translate(0f, 0.01f, 0.02f)
            if (tex != null) {
                val style = com.zentra.xr.xr.PanelStyle()
                style.surface(0x00000000, 0x00000000, 0.01f)
                style.image(tex)
                style.stroke(theme.cardBorder, 0.0016f)
                val aspect = tex.width.toFloat() / tex.height.toFloat().coerceAtLeast(1f)
                val h = 0.44f
                val w = (h * aspect).coerceAtMost(contentWidth)
                r.panel(w, h, style, 1f)
            } else {
                r.label("Carregando…", 0.02f, theme.textDim, 1, 1f, VrRenderer.ALIGN_CENTER)
            }
            r.translate(0f, -0.25f, 0f)
            closeFullscreen.draw(r)
            r.pop()
            return
        }
        for (card in cards) if (card.visible) card.draw(r)
        for (b in pageButtons) b.draw(r)
        infoLabel.draw(r)
    }

    override fun onBack(): Boolean {
        if (fullscreenItem != null) {
            fullscreenItem = null
            fullTexture?.release()
            fullTexture = null
            return true
        }
        return false
    }
}

// ---------------------------------------------------------------------------
// Music player
// ---------------------------------------------------------------------------
class MusicApp(engine: Engine) : XrApp(engine) {

    override val title = "VR Music Player"
    override val icon = Icon.MUSIC
    override val contentWidth = 0.80f
    override val contentHeight = 0.46f

    private val ctx: UiContext = engine.ui
    private val tracks = ArrayList<MediaItem>()
    private val trackButtons = ArrayList<Button3D>()
    private val titleLabel = Label3D(ctx, "", 0.026f, 2) { it.text }
    private val statusLabel = Label3D(ctx, "", 0.016f, 1) { it.textDim }
    private val controls = ArrayList<Widget>()
    private var player: MediaPlayer? = null
    private var current = -1
    private var playing = false
    private var cover: Texture? = null
    private var progress = 0f

    override fun onOpen() {
        tracks.clear()
        tracks.addAll(MediaQuery.audio(engine.context, 24))
        buildControls()
        for ((index, track) in tracks.withIndex()) {
            val button = Button3D(ctx, track.name, 0.36f, 0.042f)
            button.textHeight = 0.016f
            button.radius = 0.02f
            button.onTap = { play(index) }
            trackButtons.add(button)
        }
    }

    private fun buildControls() {
        val kit = engine.renderer.text
        val play = Button3D(ctx, "", 0.07f, 0.07f)
        play.icon = Icons.texture(kit, Icon.PLAY)
        play.iconSize = 0.03f
        play.radius = 0.035f
        play.onTap = { togglePlay() }
        val prev = Button3D(ctx, "", 0.055f, 0.055f)
        prev.icon = Icons.texture(kit, Icon.PREV)
        prev.iconSize = 0.024f
        prev.radius = 0.0275f
        prev.onTap = { play((current - 1).coerceAtLeast(0)) }
        val next = Button3D(ctx, "", 0.055f, 0.055f)
        next.icon = Icons.texture(kit, Icon.NEXT)
        next.iconSize = 0.024f
        next.radius = 0.0275f
        next.onTap = { play((current + 1).coerceAtMost(tracks.size - 1)) }
        controls.add(prev)
        controls.add(play)
        controls.add(next)
        this.playButton = play
    }

    private var playButton: Button3D? = null

    private fun togglePlay() {
        val p = player
        if (p == null) {
            if (tracks.isNotEmpty()) play(0)
            return
        }
        if (p.isPlaying) {
            p.pause()
            playing = false
        } else {
            p.start()
            playing = true
        }
    }

    private fun play(index: Int) {
        if (index !in tracks.indices) return
        current = index
        try {
            player?.release()
            val p = MediaPlayer().apply {
                setDataSource(engine.context, tracks[index].uri)
                setOnCompletionListener { playing = false }
                prepare()
                start()
            }
            player = p
            playing = true
            loadCover(tracks[index])
        } catch (t: Throwable) {
            statusLabel.value = "Não foi possível reproduzir"
        }
    }

    private fun loadCover(item: MediaItem) {
        Thread {
            try {
                val retriever = MediaMetadataRetriever()
                retriever.setDataSource(engine.context, item.uri)
                val art = retriever.embeddedPicture
                retriever.release()
                if (art != null) {
                    val bmp = android.graphics.BitmapFactory.decodeByteArray(art, 0, art.size)
                    engine.host.runOnUi {
                        cover?.release()
                        cover = Texture().apply { createFrom(bmp) }
                        bmp.recycle()
                    }
                }
            } catch (t: Throwable) {
                // keep the previous cover
            }
        }.apply { isDaemon = true }.start()
    }

    override fun update(dt: Float) {
        val theme = engine.theme.current
        val p = player
        if (p != null && p.isPlaying) {
            progress = (p.currentPosition.toFloat() / p.duration.toFloat().coerceAtLeast(1f))
                .coerceIn(0f, 1f)
        }
        playButton?.icon = Icons.texture(engine.renderer.text, if (playing) Icon.PAUSE else Icon.PLAY)

        var y = 0.02f
        for ((index, button) in trackButtons.withIndex()) {
            val col = index % 2
            val row = index / 2
            button.visible = row < 6
            if (!button.visible) continue
            button.pos.set(if (col == 0) -0.19f else 0.19f, -0.06f - row * 0.048f, 0f)
            button.fillTop = if (index == current) theme.raisedTop else theme.cardTop
            button.fillBottom = if (index == current) theme.raisedBottom else theme.cardBottom
            button.borderColor = theme.cardBorder
            button.borderWidth = 0.001f
            button.update(dt)
            button.updateWorld(parentMatrix)
        }

        controls[0].pos.set(-0.09f, 0.16f, 0f)
        controls[1].pos.set(0f, 0.16f, 0f)
        controls[2].pos.set(0.09f, 0.16f, 0f)
        for (c in controls) {
            (c as Button3D).fillTop = theme.raisedTop
            c.fillBottom = theme.raisedBottom
            c.borderColor = theme.cardBorder
            c.borderWidth = 0.0014f
            c.update(dt)
            c.updateWorld(parentMatrix)
        }

        titleLabel.value = if (current in tracks.indices) tracks[current].name else "Nenhuma faixa"
        titleLabel.pos.set(0f, -0.20f, 0f)
        titleLabel.update(dt)
        titleLabel.updateWorld(parentMatrix)

        statusLabel.value = when {
            tracks.isEmpty() -> "Nenhuma música encontrada • permita o acesso às mídias"
            playing -> "Tocando • ${(progress * 100).toInt()}%"
            else -> "Pausado"
        }
        statusLabel.pos.set(0f, -0.245f, 0f)
        statusLabel.update(dt)
        statusLabel.updateWorld(parentMatrix)
    }

    override fun collectTargets(out: ArrayList<Widget>) {
        out.addAll(controls)
        for (b in trackButtons) if (b.visible) out.add(b)
    }

    override fun draw(r: VrRenderer) {
        val theme = r.theme

        // album art
        r.push()
        r.translate(-0.28f, 0.10f, 0.002f)
        cover?.let {
            val style = com.zentra.xr.xr.PanelStyle()
            style.surface(theme.panelTop, theme.panelTop, 0.012f)
            style.image(it)
            style.stroke(theme.cardBorder, 0.0014f)
            r.panel(0.16f, 0.16f, style, 1f)
        } ?: run {
            val style = com.zentra.xr.xr.PanelStyle()
            style.surface(theme.raisedTop, theme.raisedBottom, 0.012f)
            style.stroke(theme.cardBorder, 0.0014f)
            r.panel(0.16f, 0.16f, style, 1f)
            r.push()
            r.translate(0f, 0f, 0.002f)
            r.sprite(Icons.texture(r.text, Icon.MUSIC), 0.07f, 0.07f, theme.textFaint, 0.7f)
            r.pop()
        }
        r.pop()

        // spectrum
        r.push()
        r.translate(0.10f, 0.10f, 0.002f)
        val bars = 22
        for (i in 0 until bars) {
            val t = engine.time * 2.2f + i * 0.42f
            val level = if (playing) (0.25f + 0.75f * kotlin.math.abs(sin(t))) else 0.08f
            r.push()
            r.translate(i * 0.012f - 0.13f, -0.05f + level * 0.05f, 0f)
            val barStyle = com.zentra.xr.xr.PanelStyle()
            barStyle.surface(theme.text, theme.text, 0.002f)
            r.panel(0.008f, 0.008f + level * 0.10f, barStyle, 0.75f)
            r.pop()
        }
        r.pop()

        // progress
        r.push()
        r.translate(0f, 0.03f, 0.002f)
        val track = com.zentra.xr.xr.PanelStyle()
        track.surface(theme.raisedBottom, theme.raisedBottom, 0.003f)
        r.panel(0.68f, 0.006f, track, 0.8f)
        r.push()
        r.translate(-0.34f + 0.34f * progress, 0f, 0.002f)
        val fill = com.zentra.xr.xr.PanelStyle()
        fill.surface(theme.text, theme.text, 0.003f)
        r.panel(0.68f * progress, 0.006f, fill, 0.95f)
        r.pop()
        r.pop()

        for (b in trackButtons) if (b.visible) b.draw(r)
        for (c in controls) c.draw(r)
        titleLabel.draw(r)
        statusLabel.draw(r)
    }

    override fun onClose() {
        player?.release()
        player = null
        cover?.release()
        cover = null
    }
}

// ---------------------------------------------------------------------------
// Video player / Theater
// ---------------------------------------------------------------------------
open class VideoApp(engine: Engine) : XrApp(engine) {

    override val title = "VR Video Player"
    override val icon = Icon.VIDEO
    override val contentWidth = 0.86f
    override val contentHeight = 0.50f

    protected val ctx: UiContext = engine.ui
    protected val videoSurface = VideoSurface()
    protected var player: MediaPlayer? = null
    protected var playing = false
    protected var progress = 0f
    protected var currentName = ""

    private val items = ArrayList<MediaItem>()
    protected val thumbs = HashMap<Long, Texture>()
    private val cards = ArrayList<Button3D>()
    private val controls = ArrayList<Button3D>()
    protected var selected: MediaItem? = null
    private var playButton: Button3D? = null
    protected var curved = false

    override fun onOpen() {
        items.clear()
        items.addAll(MediaQuery.videos(engine.context, 12))
        videoSurface.create()
        buildCards()
        buildControls()
    }

    private fun buildCards() {
        for ((index, item) in items.withIndex()) {
            val card = Button3D(ctx, item.name, 0.25f, 0.17f)
            card.textHeight = 0.013f
            card.radius = 0.012f
            card.onTap = { openVideo(item) }
            cards.add(card)
            Thread {
                MediaQuery.videoFrame(engine.context, item)?.let { bmp ->
                    pending.add(item.id to bmp)
                }
            }.apply { isDaemon = true }.start()
        }
    }

    private val pending = java.util.concurrent.ConcurrentLinkedQueue<Pair<Long, Bitmap>>()

    private fun buildControls() {
        val kit = engine.renderer.text
        val pb = Button3D(ctx, "", 0.065f, 0.065f)
        pb.icon = Icons.texture(kit, Icon.PLAY)
        pb.iconSize = 0.028f
        pb.radius = 0.0325f
        pb.onTap = { toggle() }
        playButton = pb
        val back = Button3D(ctx, "", 0.05f, 0.05f)
        back.icon = Icons.texture(kit, Icon.CHEVRON_LEFT)
        back.iconSize = 0.022f
        back.radius = 0.025f
        back.onTap = { seek(-10f) }
        val fwd = Button3D(ctx, "", 0.05f, 0.05f)
        fwd.icon = Icons.texture(kit, Icon.CHEVRON_RIGHT)
        fwd.iconSize = 0.022f
        fwd.radius = 0.025f
        fwd.onTap = { seek(10f) }
        val library = Button3D(ctx, "Biblioteca", 0.14f, 0.045f)
        library.textHeight = 0.016f
        library.radius = 0.022f
        library.onTap = { stopPlayback() }
        controls.add(back)
        controls.add(pb)
        controls.add(fwd)
        controls.add(library)
    }

    private fun seek(delta: Float) {
        val p = player ?: return
        val target = (p.currentPosition + delta * 1000).toInt().coerceAtLeast(0)
        p.seekTo(target)
    }

    private fun toggle() {
        val p = player ?: return
        if (p.isPlaying) {
            p.pause()
            playing = false
        } else {
            p.start()
            playing = true
        }
    }

    protected open fun openVideo(item: MediaItem) {
        selected = item
        currentName = item.name
        try {
            player?.release()
            val p = MediaPlayer().apply {
                setDataSource(engine.context, item.uri)
                setSurface(videoSurface.surfaceForPlayer)
                setOnCompletionListener { playing = false }
                setScreenOnWhilePlaying(true)
                prepare()
                start()
            }
            player = p
            playing = true
        } catch (t: Throwable) {
            currentName = "Falha ao reproduzir"
        }
    }

    protected fun stopPlayback() {
        player?.release()
        player = null
        selected = null
        playing = false
        progress = 0f
    }

    override fun update(dt: Float) {
        while (true) {
            val pair = pending.poll() ?: break
            thumbs[pair.first]?.release()
            thumbs[pair.first] = Texture().apply { createFrom(pair.second) }
            pair.second.recycle()
        }
        videoSurface.update()

        val theme = engine.theme.current
        val p = player
        if (p != null) {
            progress = (p.currentPosition.toFloat() / p.duration.toFloat().coerceAtLeast(1f))
                .coerceIn(0f, 1f)
        }
        playButton?.icon = Icons.texture(engine.renderer.text, if (playing) Icon.PAUSE else Icon.PLAY)

        if (selected != null) {
            controls[0].pos.set(-0.09f, -0.19f, 0f)
            controls[1].pos.set(0f, -0.19f, 0f)
            controls[2].pos.set(0.09f, -0.19f, 0f)
            controls[3].pos.set(0.28f, -0.19f, 0f)
            for (c in controls) {
                c.fillTop = theme.raisedTop
                c.fillBottom = theme.raisedBottom
                c.borderColor = theme.cardBorder
                c.borderWidth = 0.0012f
                c.update(dt)
                c.updateWorld(parentMatrix)
            }
        } else {
            for ((index, card) in cards.withIndex()) {
                val col = index % 3
                val row = index / 3
                card.pos.set((col - 1) * 0.27f, 0.10f - row * 0.19f, 0f)
                card.fillTop = theme.cardTop
                card.fillBottom = theme.cardBottom
                card.borderColor = theme.cardBorder
                card.borderWidth = 0.0012f
                card.image = thumbs[items.getOrNull(index)?.id]
                card.label = ""
                card.update(dt)
                card.updateWorld(parentMatrix)
            }
        }
    }

    override fun collectTargets(out: ArrayList<Widget>) {
        if (selected != null) out.addAll(controls) else out.addAll(cards)
    }

    override fun draw(r: VrRenderer) {
        val theme = r.theme
        val item = selected
        if (item == null) {
            if (cards.isEmpty()) {
                r.label("Nenhum vídeo encontrado • permita o acesso às mídias", 0.02f,
                    theme.textDim, 1, 1f, VrRenderer.ALIGN_CENTER)
            }
            for (card in cards) card.draw(r)
            return
        }

        r.push()
        r.translate(0f, 0.03f, 0.002f)
        if (curved) {
            drawCurved(r)
        } else {
            val w = 0.82f
            val h = w * 9f / 16f
            r.oes(videoSurface.texId, w, h, 1f)
        }
        r.pop()

        // progress
        r.push()
        r.translate(0f, -0.13f, 0.004f)
        val track = com.zentra.xr.xr.PanelStyle()
        track.surface(theme.raisedBottom, theme.raisedBottom, 0.003f)
        r.panel(0.7f, 0.006f, track, 0.8f)
        r.push()
        r.translate(-0.35f + 0.35f * progress, 0f, 0.002f)
        val fill = com.zentra.xr.xr.PanelStyle()
        fill.surface(theme.text, theme.text, 0.003f)
        r.panel(0.7f * progress, 0.006f, fill, 0.95f)
        r.pop()
        r.pop()

        for (c in controls) c.draw(r)

        r.push()
        r.translate(0f, -0.245f, 0f)
        r.label(currentName, 0.016f, theme.textDim, 1, 1f, VrRenderer.ALIGN_CENTER, 0.7f)
        r.pop()
    }

    protected fun drawCurved(r: VrRenderer) {
        val mesh = Geometry.curvedScreen(64f, 24, 10, 0.46f)
        r.push()
        r.translate(0f, 0.02f, -0.30f)
        r.scale(1.55f)
        r.oesMesh(mesh, videoSurface.texId, 1f)
        r.pop()
    }

    override fun onClose() {
        player?.release()
        player = null
        videoSurface.release()
        thumbs.values.forEach { it.release() }
        thumbs.clear()
    }

    override fun onBack(): Boolean {
        if (selected != null) {
            stopPlayback()
            return true
        }
        return false
    }
}

/** Same player, but projected on a big curved cinema screen in a dark room. */
class TheaterApp(engine: Engine) : VideoApp(engine) {

    override val title = "VR Theater"
    override val icon = Icon.THEATER

    init {
        curved = true
    }

    override fun draw(r: VrRenderer) {
        val item = selected != null
        // dark room: a large soft backdrop behind the screen
        r.push()
        r.translate(0f, 0f, -0.55f)
        val back = com.zentra.xr.xr.PanelStyle()
        back.surface(0xFF05060A.toInt(), 0xFF010203.toInt(), 0.4f)
        r.panel(2.6f, 1.7f, back, 0.92f)
        r.pop()

        // floor glow
        r.push()
        r.translate(0f, -0.34f, -0.25f)
        r.rotate(90f, 1f, 0f, 0f)
        val glow = com.zentra.xr.xr.PanelStyle()
        glow.surface(0x1AFFFFFF, 0x00000000.toInt(), 0.3f)
        r.panel(2.2f, 1.4f, glow, 0.35f)
        r.pop()

        super.draw(r)
        if (!item) {
            r.push()
            r.translate(0f, -0.20f, 0f)
            r.label("Escolha um vídeo para a sessão", 0.02f, r.theme.textDim, 1, 1f,
                VrRenderer.ALIGN_CENTER)
            r.pop()
        }
    }


}
