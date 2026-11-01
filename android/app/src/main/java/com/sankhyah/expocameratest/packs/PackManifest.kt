package com.sankhyah.expocameratest.packs

/**
 * The Play Asset Delivery packs this app knows about and which request paths belong to them.
 * Pure Kotlin (no Android classes) so it runs in plain JVM unit tests.
 *
 * A pack's files mirror the base asset layout, so a path such as `web/tree_pose/tree_pose_classifier.onnx`
 * is the same whether it comes from a Play pack, the APK assets, or a debug build that bundles the pack.
 */
data class PackSpec(
    val name: String,
    /** A prefix ending in "/" matches every path under it; any other prefix must equal the path. */
    val pathPrefixes: List<String>,
    /** Files that must exist in a delivered pack before it counts as intact. */
    val expectedFiles: List<String>,
    /** Fetch automatically at app start when Play has not started the download. */
    val autoFetch: Boolean,
)

object PackManifest {
    val ALL: List<PackSpec> = listOf(
        PackSpec(
            name = "pose_heavy",
            pathPrefixes = listOf("web/pose_landmark_heavy.tflite"),
            expectedFiles = listOf("web/pose_landmark_heavy.tflite"),
            autoFetch = true,
        ),
        PackSpec(
            name = "tree_pose",
            pathPrefixes = listOf("web/tree_pose/"),
            expectedFiles = listOf(
                "web/tree_pose/tree_pose_classifier.onnx",
                "web/tree_pose/ort-wasm-simd-threaded.wasm",
                "web/tree_pose/ort.wasm.min.js",
            ),
            autoFetch = true,
        ),
    )

    val NAMES: List<String> = ALL.map { it.name }

    fun byName(name: String): PackSpec? = ALL.firstOrNull { it.name == name }

    fun packForPath(relPath: String): PackSpec? =
        ALL.firstOrNull { spec ->
            spec.pathPrefixes.any { prefix ->
                if (prefix.endsWith("/")) relPath.startsWith(prefix) else relPath == prefix
            }
        }

    /**
     * Turns a raw request target (path plus optional query/fragment) into an asset path under `web/`.
     * Throws IllegalArgumentException for anything that is not a plain, relative file path.
     *
     * Steps: cut at the first `?` or `#`; percent-decode exactly once (a double-encoded `%252e` stays the
     * literal text `%2e`); reject NUL and backslash; drop one leading `/`; reject an empty path, empty
     * segments and `.` / `..` segments; prefix `web/` unless already present.
     */
    fun sanitize(rawTarget: String): String {
        val cut = rawTarget.indexOfFirst { it == '?' || it == '#' }
        val pathPart = if (cut >= 0) rawTarget.substring(0, cut) else rawTarget
        val decoded = percentDecodeOnce(pathPart)
        require(decoded.indexOf('\u0000') < 0) { "NUL in path" }
        require(decoded.indexOf('\\') < 0) { "backslash in path" }
        val trimmed = if (decoded.startsWith("/")) decoded.substring(1) else decoded
        require(trimmed.isNotEmpty()) { "empty path" }
        val segments = trimmed.split('/')
        for (segment in segments) {
            require(segment.isNotEmpty()) { "empty segment" }
            require(segment != "." && segment != "..") { "dot segment" }
        }
        return if (trimmed.startsWith("web/")) trimmed else "web/$trimmed"
    }

    private fun percentDecodeOnce(s: String): String {
        if (s.indexOf('%') < 0) return s
        val bytes = java.io.ByteArrayOutputStream(s.length)
        var i = 0
        while (i < s.length) {
            val c = s[i]
            if (c == '%') {
                require(i + 2 < s.length) { "bad escape" }
                val hi = Character.digit(s[i + 1], 16)
                val lo = Character.digit(s[i + 2], 16)
                require(hi >= 0 && lo >= 0) { "bad escape" }
                bytes.write((hi shl 4) or lo)
                i += 3
            } else {
                val chunk = c.toString().toByteArray(Charsets.UTF_8)
                if (Character.isHighSurrogate(c) && i + 1 < s.length) {
                    bytes.write(s.substring(i, i + 2).toByteArray(Charsets.UTF_8))
                    i += 2
                } else {
                    bytes.write(chunk)
                    i += 1
                }
            }
        }
        return String(bytes.toByteArray(), Charsets.UTF_8)
    }
}
