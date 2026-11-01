package com.sankhyah.expocameratest.packs

import android.app.Activity
import android.content.Context
import android.os.SystemClock
import android.util.Log
import com.google.android.play.core.assetpacks.AssetPackException
import com.google.android.play.core.assetpacks.AssetPackManager
import com.google.android.play.core.assetpacks.AssetPackManagerFactory
import com.google.android.play.core.assetpacks.AssetPackState
import com.google.android.play.core.assetpacks.AssetPackStateUpdateListener
import com.google.android.play.core.assetpacks.AssetPackStates
import com.google.android.play.core.assetpacks.model.AssetPackStorageMethod
import com.sankhyah.expocameratest.BuildConfig
import java.io.File
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArraySet
import java.util.concurrent.atomic.AtomicLong

/** What JavaScript sees for one pack. [status] is one of the strings in PackStatusMapper. */
data class PackStateSnapshot(
    val status: String,
    val progress: Double,
    val downloadedBytes: Long,
    val totalBytes: Long,
    val errorCode: Int,
    val reason: String,
)

/**
 * Tracks the Play Asset Delivery packs (see PackManifest). It is the only writer of PackStore.
 *
 *  - APK builds that bundle the packs as ordinary assets (BuildConfig.PACKS_AS_ASSETS): every pack is ready.
 *  - Bundle builds: Play state is read once at start (and every update after), a finished pack's folder is
 *    recorded in PackStore *before* JavaScript hears it is ready, and a pack that stops being complete is
 *    removed from PackStore again.
 *  - Debug fault modes (see PackFault.kt) simulate pending / failed packs without Play.
 */
object PackManager {
    private const val TAG = "PackManager"
    private const val FILE_MISSING_COOLDOWN_MS = 30_000L
    private const val REFETCH_BACKOFF_MS = 30_000L

    private val buffer = ConcurrentHashMap<String, PackStateSnapshot>()
    private val rawStatus = ConcurrentHashMap<String, Int>()
    /** Bumped by every Play update event, so an older initial read can never overwrite a newer event. */
    private val eventVersion = ConcurrentHashMap<String, AtomicLong>()
    private val listeners = CopyOnWriteArraySet<(String, PackStateSnapshot) -> Unit>()
    private val lastFileMissingAt = ConcurrentHashMap<String, Long>()
    private val lastRefetchAt = ConcurrentHashMap<String, Long>()
    private val installTimePacks: Set<String> =
        BuildConfig.INSTALL_TIME_PACKS.split(',').map { it.trim() }.filter { it.isNotEmpty() }.toSet()

    @Volatile private var manager: AssetPackManager? = null
    @Volatile private var started = false
    @Volatile private var fault: FaultMode = FaultMode.None
    @Volatile private var autoFetched = false

    @Synchronized
    fun start(context: Context) {
        if (started) return
        started = true
        fault = faultMode(BuildConfig.DEBUG, BuildConfig.PACK_FAULT)
        if (fault != FaultMode.None) {
            Log.w(TAG, "DEV FAULT ACTIVE (${fault.label()}): pack states are simulated, Play is not asked")
            publishFault()
            return
        }
        if (BuildConfig.PACKS_AS_ASSETS) {
            for (name in PackManifest.NAMES) {
                PackStore.markApkBacked(name)
                publish(name, PackStateSnapshot("ready", 1.0, 0L, 0L, 0, ""))
            }
            return
        }

        val m = AssetPackManagerFactory.getInstance(context.applicationContext)
        manager = m
        m.registerListener(object : AssetPackStateUpdateListener {
            override fun onStateUpdate(state: AssetPackState) = onEvent(state)
        })
        val versionsBefore = PackManifest.NAMES.associateWith { versionOf(it) }
        m.getPackStates(PackManifest.NAMES)
            .addOnSuccessListener { states -> onInitialRead(states, versionsBefore) }
            .addOnFailureListener { e ->
                Log.w(TAG, "getPackStates failed: ${e.message}")
                onInitialReadFailed(versionsBefore)
            }
    }

    // ---- reading -------------------------------------------------------------------------------------------

    /** Never blocks; a pack with no entry yet is `unknown`. */
    fun states(): Map<String, PackStateSnapshot> =
        PackManifest.NAMES.associateWith { buffer[it] ?: UNKNOWN_SNAPSHOT }

    fun devFault(): String = fault.label()

    /** Whether the asset server may answer for this pack's files right now. */
    fun isServable(name: String): Boolean {
        if (fault != FaultMode.None) return false
        if (BuildConfig.PACKS_AS_ASSETS) return true
        return PackStore.isReady(name) || PackStore.isApkBacked(name)
    }

    fun addListener(l: (String, PackStateSnapshot) -> Unit) {
        listeners.add(l)
    }

    fun removeListener(l: (String, PackStateSnapshot) -> Unit) {
        listeners.remove(l)
    }

    // ---- actions -------------------------------------------------------------------------------------------

    fun fetch(name: String) {
        val m = manager ?: return
        m.fetch(listOf(name))
            .addOnSuccessListener { states -> states.packStates().values.forEach { onEvent(it) } }
            .addOnFailureListener { e -> onFetchFailed(name, e) }
    }

    fun showConfirmation(activity: Activity) {
        manager?.showConfirmationDialog(activity)
    }

    /**
     * A request found no file although the pack counts as ready (evicted or damaged). Rate-limited per pack.
     * JavaScript is told first (so the gate unmounts the page), then the store entry is cleared and the pack
     * is fetched again; if Play still says the folder is there but the files are not, the pack is `failed`.
     */
    fun onFileMissing(name: String) {
        val now = SystemClock.elapsedRealtime()
        val last = lastFileMissingAt[name]
        if (last != null && now - last < FILE_MISSING_COOLDOWN_MS) return
        lastFileMissingAt[name] = now

        publish(name, PackStateSnapshot("pending", 0.0, 0L, 0L, 0, ""))
        PackStore.clear(name)
        val m = manager ?: return
        m.fetch(listOf(name)).addOnCompleteListener { recheckAfterFetch(name) }
    }

    // ---- Play callbacks -----------------------------------------------------------------------------------

    private fun onEvent(state: AssetPackState) {
        eventVersion.computeIfAbsent(state.name()) { AtomicLong() }.incrementAndGet()
        applyState(state.name(), state.status(), state.errorCode(), state.bytesDownloaded(), state.totalBytesToDownload())
    }

    private fun onInitialRead(states: AssetPackStates, versionsBefore: Map<String, Long>) {
        for (name in PackManifest.NAMES) {
            val st = states.packStates()[name] ?: continue
            if (versionOf(name) != versionsBefore[name]) continue // a newer event already arrived
            applyState(name, st.status(), st.errorCode(), st.bytesDownloaded(), st.totalBytesToDownload())
        }
        autoFetchOnce()
    }

    private fun onInitialReadFailed(versionsBefore: Map<String, Long>) {
        for (name in PackManifest.NAMES) {
            if (versionOf(name) != versionsBefore[name]) continue
            rawStatus[name] = PackStatusMapper.FAILED
            publish(name, PackStateSnapshot("failed", 0.0, 0L, 0L, PackStatusMapper.ERR_API_NOT_AVAILABLE, "play"))
        }
    }

    private fun onFetchFailed(name: String, e: Exception) {
        val code = (e as? AssetPackException)?.errorCode ?: PackStatusMapper.ERR_API_NOT_AVAILABLE
        Log.w(TAG, "fetch($name) failed: code=$code ${e.message}")
        applyState(name, PackStatusMapper.FAILED, code, 0L, 0L)
    }

    /** Once per process, ask Play to start packs it has not started (never for waiting or confirming ones). */
    private fun autoFetchOnce() {
        if (autoFetched) return
        autoFetched = true
        val retry = setOf(
            PackStatusMapper.UNKNOWN,
            PackStatusMapper.FAILED,
            PackStatusMapper.CANCELED,
            PackStatusMapper.NOT_INSTALLED,
        )
        for (spec in PackManifest.ALL) {
            if (spec.autoFetch && (rawStatus[spec.name] ?: PackStatusMapper.UNKNOWN) in retry) fetch(spec.name)
        }
    }

    // ---- state -------------------------------------------------------------------------------------------

    private fun applyState(name: String, raw: Int, errorCode: Int, downloaded: Long, total: Long) {
        rawStatus[name] = raw
        val reason = PackStatusMapper.reason(errorCode)
        var status = PackStatusMapper.status(raw, reason)
        if (raw == PackStatusMapper.COMPLETED) {
            status = resolveCompleted(name)
        } else {
            PackStore.clear(name)
        }
        val progress = if (status == "ready") 1.0 else PackStatusMapper.progress(downloaded, total)
        publish(name, PackStateSnapshot(status, progress, downloaded, total, errorCode, reason))
    }

    /**
     * Play says the pack is complete. Record where its files are *before* anyone is told it is ready.
     * A pack without a usable folder (and not install-time) is `pending` and refetched with a backoff.
     */
    private fun resolveCompleted(name: String): String {
        val m = manager ?: return "ready"
        val loc = m.getPackLocation(name)
        if (loc != null && loc.packStorageMethod() == AssetPackStorageMethod.APK_ASSETS) {
            PackStore.markApkBacked(name)
            return "ready"
        }
        if (loc == null) {
            if (name in installTimePacks) {
                PackStore.markApkBacked(name)
                return "ready"
            }
            Log.w(TAG, "$name is COMPLETED but has no location; treating it as not ready")
            scheduleRefetch(name)
            return "pending"
        }
        val dir = loc.assetsPath()?.let { File(it) }
        val spec = PackManifest.byName(name)
        if (dir == null || !dir.isDirectory || (spec != null && !isIntact(dir, spec))) {
            Log.w(TAG, "$name is COMPLETED but its folder (${dir?.path}) is missing or incomplete")
            scheduleRefetch(name)
            return "pending"
        }
        Log.i(TAG, "$name ready at ${dir.path}")
        PackStore.setReady(name, dir)
        return "ready"
    }

    private fun isIntact(dir: File, spec: PackSpec): Boolean = spec.expectedFiles.all { File(dir, it).isFile }

    private fun recheckAfterFetch(name: String) {
        val m = manager ?: return
        val dir = m.getPackLocation(name)?.assetsPath()?.let { File(it) }
        val spec = PackManifest.byName(name)
        if (dir == null || !dir.isDirectory) return // Play is downloading again; its events will follow
        if (spec != null && isIntact(dir, spec)) {
            PackStore.setReady(name, dir)
            publish(name, PackStateSnapshot("ready", 1.0, 0L, 0L, 0, ""))
        } else if (rawStatus[name] == PackStatusMapper.COMPLETED) {
            Log.w(TAG, "$name: Play reports it complete but files are missing")
            publish(name, PackStateSnapshot("failed", 0.0, 0L, 0L, 0, "other"))
        }
    }

    private fun scheduleRefetch(name: String) {
        val now = SystemClock.elapsedRealtime()
        val last = lastRefetchAt[name]
        if (last != null && now - last < REFETCH_BACKOFF_MS) return
        lastRefetchAt[name] = now
        fetch(name)
    }

    private fun publishFault() {
        val f = fault
        for (name in PackManifest.NAMES) {
            val snap = when (f) {
                is FaultMode.Failed -> {
                    val status = if (f.reason == "not_owned") "unavailable" else "failed"
                    PackStateSnapshot(status, 0.0, 0L, 0L, -1, f.reason)
                }
                else -> PackStateSnapshot("pending", 0.0, 0L, 0L, 0, "")
            }
            publish(name, snap)
        }
    }

    private fun publish(name: String, snapshot: PackStateSnapshot) {
        buffer[name] = snapshot
        for (l in listeners) {
            try {
                l(name, snapshot)
            } catch (e: Exception) {
                Log.w(TAG, "listener failed: ${e.message}")
            }
        }
    }

    private fun versionOf(name: String): Long = eventVersion[name]?.get() ?: 0L

    private val UNKNOWN_SNAPSHOT = PackStateSnapshot("unknown", 0.0, 0L, 0L, 0, "")
}
