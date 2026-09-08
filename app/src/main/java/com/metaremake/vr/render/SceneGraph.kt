package com.metaremake.vr.render

import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap

/** Node kinds understood by the native renderer. */
enum class NodeType { PANEL, BOX, SPHERE, QUAD, TEXT }

/**
 * Immutable scene node. The JS runtime is the source of truth for the scene;
 * it pushes nodes as JSON and the native renderer draws them. Each field maps
 * directly to the JSON schema defined in js/scene.
 */
data class SceneNode(
    val id: String,
    val type: NodeType,
    val pos: FloatArray = floatArrayOf(0f, 0f, -2f),
    val rot: FloatArray = floatArrayOf(0f, 0f, 0f),
    val scale: FloatArray = floatArrayOf(1f, 1f, 1f),
    val size: FloatArray = floatArrayOf(1f, 1f, 0.02f), // panel/quad: w,h; box: w,h,d; sphere: radius in [0]
    val color: FloatArray = floatArrayOf(0.9f, 0.9f, 0.9f, 1f),
    val texture: String? = null,      // null | "camera" | "capture" | asset name
    val text: String? = null,
    val fontSize: Float = 0.06f,
    val visible: Boolean = true,
    val pickable: Boolean = false,
    val headLocked: Boolean = false,
    val opacity: Float = 1f
)

/**
 * Thread-safe scene store. Rendering happens on the GL thread; the JS runtime
 * mutates the graph from its own thread. Nodes are immutable, so a snapshot is
 * simply a list of references.
 */
class SceneGraph {

    private val nodes = ConcurrentHashMap<String, SceneNode>()

    fun upsert(json: JSONObject) {
        val node = parse(json) ?: return
        nodes[node.id] = node
    }

    fun upsertAll(jsonArray: JSONArray) {
        for (i in 0 until jsonArray.length()) {
            val obj = jsonArray.optJSONObject(i) ?: continue
            val node = parse(obj) ?: continue
            nodes[node.id] = node
        }
    }

    fun remove(ids: JSONArray) {
        for (i in 0 until ids.length()) nodes.remove(ids.optString(i))
    }

    fun removeAll() = nodes.clear()

    fun get(id: String): SceneNode? = nodes[id]

    fun snapshot(): List<SceneNode> = ArrayList(nodes.values)

    fun count(): Int = nodes.size

    private fun parse(o: JSONObject): SceneNode? {
        val id = o.optString("id") ?: return null
        val type = when (o.optString("type", "panel").lowercase()) {
            "box" -> NodeType.BOX
            "sphere" -> NodeType.SPHERE
            "quad" -> NodeType.QUAD
            "text" -> NodeType.TEXT
            else -> NodeType.PANEL
        }
        val pos = floatArray3(o.optJSONArray("pos"), 0f, 0f, -2f)
        val rot = floatArray3(o.optJSONArray("rot"), 0f, 0f, 0f)
        val scale = floatArray3(o.optJSONArray("scale"), 1f, 1f, 1f)
        val size = floatArray3(o.optJSONArray("size"), 1f, 1f, 0.02f)
        val color = floatArray4(o.optJSONArray("color"), 0.9f, 0.9f, 0.9f, 1f)
        return SceneNode(
            id = id,
            type = type,
            pos = pos,
            rot = rot,
            scale = scale,
            size = size,
            color = color,
            texture = o.optString("texture").takeIf { it.isNotBlank() },
            text = o.optString("text").takeIf { it.isNotBlank() },
            fontSize = o.optDouble("fontSize", 0.06).toFloat(),
            visible = o.optBoolean("visible", true),
            pickable = o.optBoolean("pickable", false),
            headLocked = o.optBoolean("headLocked", false),
            opacity = o.optDouble("opacity", 1.0).toFloat()
        )
    }

    private fun floatArray3(arr: JSONArray?, d0: Float, d1: Float, d2: Float): FloatArray {
        val out = floatArrayOf(d0, d1, d2)
        if (arr != null) {
            if (arr.length() > 0) out[0] = arr.optDouble(0, d0.toDouble()).toFloat()
            if (arr.length() > 1) out[1] = arr.optDouble(1, d1.toDouble()).toFloat()
            if (arr.length() > 2) out[2] = arr.optDouble(2, d2.toDouble()).toFloat()
        }
        return out
    }

    private fun floatArray4(arr: JSONArray?, d0: Float, d1: Float, d2: Float, d3: Float): FloatArray {
        val out = floatArrayOf(d0, d1, d2, d3)
        if (arr != null) {
            if (arr.length() > 0) out[0] = arr.optDouble(0, d0.toDouble()).toFloat()
            if (arr.length() > 1) out[1] = arr.optDouble(1, d1.toDouble()).toFloat()
            if (arr.length() > 2) out[2] = arr.optDouble(2, d2.toDouble()).toFloat()
            if (arr.length() > 3) out[3] = arr.optDouble(3, d3.toDouble()).toFloat()
        }
        return out
    }
}
