package com.sankhyah.expocameratest.packs

import java.io.ByteArrayInputStream
import java.io.File
import java.io.InputStream
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AssetRoutingTest {
    private val heavy = "web/pose_landmark_heavy.tflite"
    private val tree = "web/tree_pose/tree_pose_classifier.onnx"
    private val other = "web/avatars/ojas_default.glb"
    private val file = File("/tmp/x")
    private fun stream(): InputStream = ByteArrayInputStream(ByteArray(0))

    @Test fun notServablePackIsNotReadyEvenIfTheApkHasTheFile() {
        val r = AssetRouting.decide(tree, servable = { false }, packFile = { file }, apkOpen = { stream() })
        assertEquals(Route.NotReady("tree_pose", fileMissing = false), r)
    }

    @Test fun readyPackServesFromThePack() {
        val r = AssetRouting.decide(heavy, servable = { true }, packFile = { file }, apkOpen = { stream() })
        assertEquals(Route.ServePack(file), r)
    }

    @Test fun apkBackedPackServesFromTheApk() {
        val r = AssetRouting.decide(tree, servable = { true }, packFile = { null }, apkOpen = { stream() })
        assertTrue(r is Route.ServeApk)
    }

    @Test fun servableButMissingFileIsFlaggedAsMissing() {
        val r = AssetRouting.decide(tree, servable = { true }, packFile = { null }, apkOpen = { null })
        assertEquals(Route.NotReady("tree_pose", fileMissing = true), r)
    }

    @Test fun nonPackPathsNeverConsultServable() {
        var asked = false
        val r = AssetRouting.decide(other, servable = { asked = true; false }, packFile = { null }, apkOpen = { stream() })
        assertTrue(r is Route.ServeApk)
        assertEquals(false, asked)
    }

    @Test fun unknownPathIsNotFound() {
        val r = AssetRouting.decide("web/nope.js", servable = { true }, packFile = { null }, apkOpen = { null })
        assertEquals(Route.NotFound, r)
    }

    @Test fun faultModeMakesPacksNotServableEvenWhenFilesExist() {
        // the dev fault is expressed as servable = false for every pack
        val r = AssetRouting.decide(tree, servable = { false }, packFile = { file }, apkOpen = { stream() })
        assertTrue(r is Route.NotReady)
    }
}
