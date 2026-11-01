package com.sankhyah.expocameratest.packs

/**
 * Dev-only fault injection for the pack states, set with `-PpackFault=pending` or `-PpackFault=failed:<reason>`
 * on a debug build. Release builds always get PACK_FAULT = "" and, because [isDebug] is false there, always
 * resolve to [FaultMode.None]. Pure JVM so a unit test can prove that.
 */
sealed class FaultMode {
    object None : FaultMode()
    object Pending : FaultMode()
    data class Failed(val reason: String) : FaultMode()

    /** The value shown in the dev banner; empty when there is no fault. */
    fun label(): String = when (this) {
        None -> ""
        Pending -> "pending"
        is Failed -> "failed:$reason"
    }
}

private val FAULT_REASONS = setOf("storage", "network", "play", "not_owned", "other")

fun faultMode(isDebug: Boolean, packFault: String): FaultMode {
    if (!isDebug) return FaultMode.None
    if (packFault == "pending") return FaultMode.Pending
    if (packFault.startsWith("failed:")) {
        val reason = packFault.removePrefix("failed:")
        if (reason in FAULT_REASONS) return FaultMode.Failed(reason)
    }
    return FaultMode.None
}
