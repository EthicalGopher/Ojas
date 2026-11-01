package com.sankhyah.expocameratest.packs

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * JavaScript's view of the Play asset packs. `getStates()` is the source of truth (it never blocks and
 * returns the buffered states); the `OjasAssetPackState` events are only a faster way to hear changes,
 * because they can be missed before the React context exists. The module never writes PackStore.
 */
@ReactModule(name = AssetPackModule.NAME)
class AssetPackModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    companion object {
        const val NAME = "OjasAssetPacks"
        const val EVENT = "OjasAssetPackState"
    }

    private val listener: (String, PackStateSnapshot) -> Unit = { name, snap ->
        if (reactContext.hasActiveReactInstance()) {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(EVENT, toMap(name, snap))
        }
    }

    override fun getName(): String = NAME

    override fun getConstants(): Map<String, Any> = mapOf("devFault" to PackManager.devFault())

    override fun initialize() {
        super.initialize()
        PackManager.addListener(listener)
    }

    override fun invalidate() {
        PackManager.removeListener(listener)
        super.invalidate()
    }

    @ReactMethod
    fun getStates(promise: Promise) {
        val out = Arguments.createMap()
        for ((name, snap) in PackManager.states()) out.putMap(name, toMap(name, snap))
        promise.resolve(out)
    }

    @ReactMethod
    fun fetch(name: String, promise: Promise) {
        if (PackManifest.byName(name) == null) {
            promise.reject("unknown_pack", "unknown pack: $name")
            return
        }
        PackManager.fetch(name)
        promise.resolve(null)
    }

    @ReactMethod
    fun showConfirmation(promise: Promise) {
        val activity = reactContext.currentActivity
        if (activity == null) {
            promise.reject("no_activity", "no foreground activity")
            return
        }
        PackManager.showConfirmation(activity)
        promise.resolve(null)
    }

    // Required by NativeEventEmitter.
    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}

    private fun toMap(name: String, s: PackStateSnapshot): WritableMap {
        val m = Arguments.createMap()
        m.putString("name", name)
        m.putString("status", s.status)
        m.putDouble("progress", s.progress)
        m.putDouble("downloadedBytes", s.downloadedBytes.toDouble())
        m.putDouble("totalBytes", s.totalBytes.toDouble())
        m.putInt("errorCode", s.errorCode)
        m.putString("reason", s.reason)
        return m
    }
}
