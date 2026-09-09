package com.zentra.xr.screens

import com.zentra.xr.apps.BrowserApp
import com.zentra.xr.apps.ClockApp
import com.zentra.xr.apps.DemoApp
import com.zentra.xr.apps.GalleryApp
import com.zentra.xr.apps.ModelViewerApp
import com.zentra.xr.apps.MusicApp
import com.zentra.xr.apps.SettingsApp
import com.zentra.xr.apps.TheaterApp
import com.zentra.xr.apps.VideoApp
import com.zentra.xr.games.BlocksGame
import com.zentra.xr.games.SpaceGame
import com.zentra.xr.games.TargetGame
import com.zentra.xr.ui.Icon
import com.zentra.xr.xr.Engine

/** Everything that can be launched from the Zentra XR hub. */
class AppEntry(
    val id: String,
    val title: String,
    val subtitle: String,
    val icon: Icon,
    val game: Boolean = false,
    val factory: (Engine) -> com.zentra.xr.apps.XrApp
)

object AppRegistry {

    val games = listOf(
        AppEntry("game.target", "VR Target", "Toque nos alvos", Icon.TARGET, true) { TargetGame(it) },
        AppEntry("game.space", "VR Space", "Voo espacial 3DoF", Icon.SPACE, true) { SpaceGame(it) },
        AppEntry("game.blocks", "VR Blocks", "Construa com as mãos", Icon.BLOCKS, true) { BlocksGame(it) }
    )

    val apps = listOf(
        AppEntry("app.browser", "VR Browser", "Navegador espacial", Icon.BROWSER) { BrowserApp(it) },
        AppEntry("app.gallery", "VR Gallery", "Suas fotos em 3D", Icon.GALLERY) { GalleryApp(it) },
        AppEntry("app.video", "VR Video Player", "Vídeos imersivos", Icon.VIDEO) { VideoApp(it) },
        AppEntry("app.theater", "VR Theater", "Cinema particular", Icon.THEATER) { TheaterApp(it) },
        AppEntry("app.music", "VR Music Player", "Música espacial", Icon.MUSIC) { MusicApp(it) },
        AppEntry("app.viewer", "VR 3D Viewer", "Modelos 3D", Icon.VIEWER) { ModelViewerApp(it) },
        AppEntry("app.clock", "VR Clock", "Tempo e fusos", Icon.CLOCK) { ClockApp(it) },
        AppEntry("app.demo", "VR Demo", "Showcase do sistema", Icon.DEMO) { DemoApp(it) },
        AppEntry("app.settings", "Settings", "Configurações", Icon.SETTINGS) { SettingsApp(it) }
    )

    fun all(): List<AppEntry> = apps + games

    fun find(id: String): AppEntry? = all().firstOrNull { it.id == id }

    /** Curated shortcuts shown on the Home tab. */
    val featured = listOf(
        "app.browser", "game.target", "app.music", "app.video", "app.gallery", "app.clock"
    )
}
