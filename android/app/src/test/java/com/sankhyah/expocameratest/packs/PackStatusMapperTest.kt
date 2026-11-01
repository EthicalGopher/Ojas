package com.sankhyah.expocameratest.packs

import com.google.android.play.core.assetpacks.model.AssetPackErrorCode
import com.google.android.play.core.assetpacks.model.AssetPackStatus
import org.junit.Assert.assertEquals
import org.junit.Test

class PackStatusMapperTest {
    @Test fun constantsMatchThePlayLibrary() {
        assertEquals(AssetPackStatus.UNKNOWN, PackStatusMapper.UNKNOWN)
        assertEquals(AssetPackStatus.PENDING, PackStatusMapper.PENDING)
        assertEquals(AssetPackStatus.DOWNLOADING, PackStatusMapper.DOWNLOADING)
        assertEquals(AssetPackStatus.TRANSFERRING, PackStatusMapper.TRANSFERRING)
        assertEquals(AssetPackStatus.COMPLETED, PackStatusMapper.COMPLETED)
        assertEquals(AssetPackStatus.FAILED, PackStatusMapper.FAILED)
        assertEquals(AssetPackStatus.CANCELED, PackStatusMapper.CANCELED)
        assertEquals(AssetPackStatus.WAITING_FOR_WIFI, PackStatusMapper.WAITING_FOR_WIFI)
        assertEquals(AssetPackStatus.NOT_INSTALLED, PackStatusMapper.NOT_INSTALLED)
        assertEquals(AssetPackStatus.REQUIRES_USER_CONFIRMATION, PackStatusMapper.REQUIRES_USER_CONFIRMATION)
        assertEquals(AssetPackErrorCode.NO_ERROR, PackStatusMapper.ERR_NONE)
        assertEquals(AssetPackErrorCode.APP_UNAVAILABLE, PackStatusMapper.ERR_APP_UNAVAILABLE)
        assertEquals(AssetPackErrorCode.PACK_UNAVAILABLE, PackStatusMapper.ERR_PACK_UNAVAILABLE)
        assertEquals(AssetPackErrorCode.API_NOT_AVAILABLE, PackStatusMapper.ERR_API_NOT_AVAILABLE)
        assertEquals(AssetPackErrorCode.NETWORK_ERROR, PackStatusMapper.ERR_NETWORK_ERROR)
        assertEquals(AssetPackErrorCode.INSUFFICIENT_STORAGE, PackStatusMapper.ERR_INSUFFICIENT_STORAGE)
        assertEquals(AssetPackErrorCode.APP_NOT_OWNED, PackStatusMapper.ERR_APP_NOT_OWNED)
        assertEquals(AssetPackErrorCode.UNRECOGNIZED_INSTALLATION, PackStatusMapper.ERR_UNRECOGNIZED_INSTALLATION)
    }

    @Test fun reasons() {
        assertEquals("", PackStatusMapper.reason(0))
        assertEquals("storage", PackStatusMapper.reason(-10))
        assertEquals("network", PackStatusMapper.reason(-6))
        assertEquals("play", PackStatusMapper.reason(-5))
        assertEquals("play", PackStatusMapper.reason(-1))
        assertEquals("play", PackStatusMapper.reason(-2))
        assertEquals("not_owned", PackStatusMapper.reason(-13))
        assertEquals("not_owned", PackStatusMapper.reason(-15))
        assertEquals("other", PackStatusMapper.reason(-100))
        assertEquals("other", PackStatusMapper.reason(-3))
    }

    @Test fun statuses() {
        assertEquals("unknown", PackStatusMapper.status(0, ""))
        assertEquals("pending", PackStatusMapper.status(1, ""))
        assertEquals("downloading", PackStatusMapper.status(2, ""))
        assertEquals("downloading", PackStatusMapper.status(3, ""))
        assertEquals("ready", PackStatusMapper.status(4, ""))
        assertEquals("failed", PackStatusMapper.status(5, "network"))
        assertEquals("failed", PackStatusMapper.status(5, "play"))
        assertEquals("unavailable", PackStatusMapper.status(5, "not_owned"))
        assertEquals("failed", PackStatusMapper.status(6, ""))
        assertEquals("waiting_wifi", PackStatusMapper.status(7, ""))
        assertEquals("pending", PackStatusMapper.status(8, ""))
        assertEquals("needs_confirmation", PackStatusMapper.status(9, ""))
        assertEquals("unknown", PackStatusMapper.status(42, ""))
    }

    @Test fun progress() {
        assertEquals(0.0, PackStatusMapper.progress(10, 0), 0.0)
        assertEquals(0.5, PackStatusMapper.progress(50, 100), 1e-9)
        assertEquals(1.0, PackStatusMapper.progress(150, 100), 0.0)
        assertEquals(0.0, PackStatusMapper.progress(-5, 100), 0.0)
    }
}
