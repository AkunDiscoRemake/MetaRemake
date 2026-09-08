package com.metaremake.vr.input

import java.util.ArrayDeque

/**
 * Unified input hub. Every source (hand tracking, touchscreen, Cardboard
 * button, Bluetooth controller, keys, accessibility) pushes [InputEvent]s here;
 * the JS runtime drains the queue and treats all sources identically. The hub
 * also maintains a lock-free [PointerState] snapshot for low-latency native
 * reads (cursor rendering, hit-testing).
 */
class InputHub(private val capacity: Int = 256) {

    private val queue = ArrayDeque<InputEvent>(capacity)
    val pointer = PointerState()

    @Volatile
    var handEnabled = true

    @Volatile
    var touchEnabled = true

    @Volatile
    var buttonEnabled = true

    @Volatile
    var controllerEnabled = true

    fun dispatch(event: InputEvent) {
        when (event.type) {
            InputEventType.POINTER_MOVE -> {
                pointer.x = event.x; pointer.y = event.y; pointer.z = event.z
                pointer.active = true; pointer.source = event.source
            }
            InputEventType.POINTER_DOWN -> {
                pointer.down = true; pointer.x = event.x; pointer.y = event.y
                pointer.active = true; pointer.source = event.source
            }
            InputEventType.POINTER_UP -> {
                pointer.down = false; pointer.x = event.x; pointer.y = event.y
                pointer.source = event.source
            }
            else -> Unit
        }
        if (!accepts(event.source)) return
        synchronized(queue) {
            if (queue.size >= capacity) queue.pollFirst()
            queue.addLast(event)
        }
    }

    private fun accepts(source: String): Boolean = when (source) {
        "hand" -> handEnabled
        "touch" -> touchEnabled
        "button" -> buttonEnabled
        "controller" -> controllerEnabled
        else -> true
    }

    /** Drain up to [max] events; returns them in FIFO order. */
    fun poll(max: Int = 128): List<InputEvent> {
        val out = ArrayList<InputEvent>(minOf(max, 64))
        synchronized(queue) {
            while (out.size < max && queue.isNotEmpty()) out.add(queue.pollFirst())
        }
        return out
    }

    fun clear() = synchronized(queue) { queue.clear() }

    fun pointerSnapshot() = pointer.snapshot()
}
