package com.sankhyah.expocameratest.packs

import org.junit.Assert.assertEquals
import org.junit.Test

class PackFaultTest {
    @Test fun releaseBuildsIgnoreTheFlag() {
        assertEquals(FaultMode.None, faultMode(isDebug = false, packFault = "pending"))
        assertEquals(FaultMode.None, faultMode(isDebug = false, packFault = "failed:storage"))
    }

    @Test fun debugBuildsHonourIt() {
        assertEquals(FaultMode.Pending, faultMode(true, "pending"))
        assertEquals(FaultMode.Failed("storage"), faultMode(true, "failed:storage"))
        assertEquals(FaultMode.Failed("not_owned"), faultMode(true, "failed:not_owned"))
    }

    @Test fun unknownValuesAreIgnored() {
        assertEquals(FaultMode.None, faultMode(true, ""))
        assertEquals(FaultMode.None, faultMode(true, "failed:bogus"))
        assertEquals(FaultMode.None, faultMode(true, "something"))
    }

    @Test fun labelsMatchWhatTheBannerShows() {
        assertEquals("", FaultMode.None.label())
        assertEquals("pending", FaultMode.Pending.label())
        assertEquals("failed:network", FaultMode.Failed("network").label())
    }
}
