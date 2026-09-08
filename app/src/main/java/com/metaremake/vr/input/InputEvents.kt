package com.metaremake.vr.input

/**
 * Abstract input vocabulary shared by every input source (hand tracking,
 * touchscreen, Cardboard button, Bluetooth controller, keys, accessibility).
 * Higher layers never care *which* device produced an event.
 */
enum class InputEventType {
    POINTER_MOVE,   // continuous cursor position
    POINTER_DOWN,   // press began
    POINTER_UP,     // press ended
    CLICK,          // discrete click
    DRAG,           // press + movement (deltas in deltaX/deltaY)
    SCROLL,         // continuous scroll (deltas)
    BACK,           // go back / escape
    SELECT,         // commit current selection
    RECENTER,       // re-aim forward
    TRIGGER,        // Cardboard trigger / controller trigger
    MENU,           // open/close menu
    TEXT            // typed text (virtual keyboard / accessibility)
}

data class InputEvent(
    val type: InputEventType,
    val source: String,          // "hand" | "touch" | "button" | "controller" | "key" | "accessibility"
    val x: Float = 0f,           // normalized 0..1 (VR canvas space, origin top-left)
    val y: Float = 0f,
    val z: Float = 0f,           // optional depth (normalized, smaller = closer)
    val deltaX: Float = 0f,
    val deltaY: Float = 0f,
    val keyCode: Int = 0,
    val text: String? = null,
    val timestampNs: Long = System.nanoTime()
)

/** Current pointer/cursor state, readable without draining the queue. */
class PointerState {
    @Volatile var x = 0.5f
    @Volatile var y = 0.5f
    @Volatile var z = 0f
    @Volatile var active = false
    @Volatile var down = false
    @Volatile var source = "none"

    fun snapshot() = PointerSnapshot(x, y, z, active, down, source)
}

data class PointerSnapshot(
    val x: Float,
    val y: Float,
    val z: Float,
    val active: Boolean,
    val down: Boolean,
    val source: String
)
