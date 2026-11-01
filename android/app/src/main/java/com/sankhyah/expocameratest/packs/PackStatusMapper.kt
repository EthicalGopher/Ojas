package com.sankhyah.expocameratest.packs

/**
 * Maps Play's integer pack status and error code to the strings the JavaScript side uses. Pure JVM; the
 * integer values match com.google.android.play.core.assetpacks (asset-delivery 2.3.0) and a unit test
 * compares them with the library's own constants.
 */
object PackStatusMapper {
    const val UNKNOWN = 0
    const val PENDING = 1
    const val DOWNLOADING = 2
    const val TRANSFERRING = 3
    const val COMPLETED = 4
    const val FAILED = 5
    const val CANCELED = 6
    const val WAITING_FOR_WIFI = 7
    const val NOT_INSTALLED = 8
    const val REQUIRES_USER_CONFIRMATION = 9

    const val ERR_NONE = 0
    const val ERR_APP_UNAVAILABLE = -1
    const val ERR_PACK_UNAVAILABLE = -2
    const val ERR_API_NOT_AVAILABLE = -5
    const val ERR_NETWORK_ERROR = -6
    const val ERR_INSUFFICIENT_STORAGE = -10
    const val ERR_APP_NOT_OWNED = -13
    const val ERR_UNRECOGNIZED_INSTALLATION = -15

    /** '' (no error), 'storage', 'network', 'play', 'not_owned' or 'other'. */
    fun reason(errorCode: Int): String = when (errorCode) {
        ERR_NONE -> ""
        ERR_INSUFFICIENT_STORAGE -> "storage"
        ERR_NETWORK_ERROR -> "network"
        ERR_API_NOT_AVAILABLE, ERR_APP_UNAVAILABLE, ERR_PACK_UNAVAILABLE -> "play"
        ERR_APP_NOT_OWNED, ERR_UNRECOGNIZED_INSTALLATION -> "not_owned"
        else -> "other"
    }

    /**
     * unknown | pending | downloading | ready | failed | waiting_wifi | needs_confirmation | unavailable.
     * `unavailable` is terminal and only for a failure whose reason is `not_owned` (the app was not installed
     * from Play). NOT_INSTALLED is normal for a moment after install, so it is `pending`.
     */
    fun status(playStatus: Int, reason: String): String = when (playStatus) {
        PENDING -> "pending"
        DOWNLOADING, TRANSFERRING -> "downloading"
        COMPLETED -> "ready"
        FAILED -> if (reason == "not_owned") "unavailable" else "failed"
        CANCELED -> "failed"
        NOT_INSTALLED -> "pending"
        WAITING_FOR_WIFI -> "waiting_wifi"
        REQUIRES_USER_CONFIRMATION -> "needs_confirmation"
        else -> "unknown"
    }

    /** bytesDownloaded / totalBytesToDownload clamped to 0..1, or 0 when the total is unknown. */
    fun progress(bytesDownloaded: Long, totalBytes: Long): Double {
        if (totalBytes <= 0L) return 0.0
        return (bytesDownloaded.toDouble() / totalBytes.toDouble()).coerceIn(0.0, 1.0)
    }
}
