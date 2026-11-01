package com.sankhyah.expocameratest.packs

import java.io.File
import java.io.InputStream

/** What the asset server should do for one request. */
sealed class Route {
    /** Serve a file from a delivered Play pack. */
    data class ServePack(val file: File) : Route()

    /** Serve an asset from the APK; the caller closes [stream]. */
    class ServeApk(val stream: InputStream) : Route()

    /**
     * Answer 503. [fileMissing] is true when the pack counts as ready but the file is not there (an evicted
     * or damaged pack), so the caller should ask PackManager to re-check and refetch.
     */
    data class NotReady(val pack: String, val fileMissing: Boolean) : Route()

    object NotFound : Route()
}

/** The lookup order for a sanitised path. Pure JVM, so it is unit-testable. */
object AssetRouting {
    /**
     * 1. a pack path whose pack is not servable -> NotReady
     * 2. a file in a ready pack                  -> ServePack
     * 3. an APK asset (opened once)              -> ServeApk
     * 4. a pack path, servable, file missing     -> NotReady(fileMissing = true)
     * 5. anything else                           -> NotFound
     */
    fun decide(
        relPath: String,
        servable: (String) -> Boolean,
        packFile: (String) -> File?,
        apkOpen: (String) -> InputStream?,
    ): Route {
        val pack = PackManifest.packForPath(relPath)
        if (pack != null && !servable(pack.name)) return Route.NotReady(pack.name, fileMissing = false)

        val file = packFile(relPath)
        if (file != null) return Route.ServePack(file)

        val stream = apkOpen(relPath)
        if (stream != null) return Route.ServeApk(stream)

        return if (pack != null) Route.NotReady(pack.name, fileMissing = true) else Route.NotFound
    }
}
