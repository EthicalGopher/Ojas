package com.sankhyah.expocameratest.packs

import java.io.File
import java.util.concurrent.ConcurrentHashMap

/**
 * Where each ready Play pack lives on disk. In memory only (rebuilt from Play at every start) and written
 * only by PackManager. Read from the asset server's worker threads, hence the concurrent maps.
 * Pure JVM (no Android classes).
 */
object PackStore {
    private val roots = ConcurrentHashMap<String, File>()
    private val apkBacked: MutableSet<String> = ConcurrentHashMap.newKeySet()

    /** [assetsRoot] is the pack's assets directory (Play's `assetsPath()`); it must already exist. */
    fun setReady(name: String, assetsRoot: File) {
        roots[name] = assetsRoot
    }

    /** The pack's files are ordinary APK assets (install-time delivery, or a build that bundles the packs). */
    fun markApkBacked(name: String) {
        apkBacked.add(name)
    }

    fun clear(name: String) {
        roots.remove(name)
        apkBacked.remove(name)
    }

    fun isReady(name: String): Boolean = roots.containsKey(name)

    fun isApkBacked(name: String): Boolean = apkBacked.contains(name)

    /**
     * The file for [relPath] (for example `web/tree_pose/tree_pose_classifier.onnx`) inside a ready pack, or
     * null when the path belongs to no pack, the pack is not ready, or the file is missing, a directory, or
     * resolves outside the pack root (`..`, a symlink out of it, a sibling folder with a similar name).
     */
    fun resolve(relPath: String): File? {
        val pack = PackManifest.packForPath(relPath) ?: return null
        val root = roots[pack.name] ?: return null
        return try {
            val rootCanonical = root.canonicalFile
            val file = File(rootCanonical, relPath).canonicalFile
            if (file.path.startsWith(rootCanonical.path + File.separator) && file.isFile) file else null
        } catch (e: java.io.IOException) {
            null
        }
    }
}
