package com.sankhyah.expocameratest.packs

import java.io.File
import java.nio.file.Files
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class PackStoreTest {
    private lateinit var base: File
    private lateinit var root: File   // plays the pack's assets directory

    @Before fun setUp() {
        base = Files.createTempDirectory("packstore").toFile().canonicalFile
        root = File(base, "assets").also { File(it, "web/tree_pose").mkdirs() }
        File(root, "web/tree_pose/tree_pose_classifier.onnx").writeText("onnx")
        File(base, "secret.txt").writeText("secret")
        PackStore.clear("tree_pose")
        PackStore.clear("pose_heavy")
    }

    @After fun tearDown() {
        PackStore.clear("tree_pose")
        base.deleteRecursively()
    }

    @Test fun notReadyResolvesNothing() {
        assertNull(PackStore.resolve("web/tree_pose/tree_pose_classifier.onnx"))
        assertFalse(PackStore.isReady("tree_pose"))
    }

    @Test fun readyPackResolvesItsFiles() {
        PackStore.setReady("tree_pose", root)
        val file = PackStore.resolve("web/tree_pose/tree_pose_classifier.onnx")
        assertNotNull(file)
        assertEquals("onnx", file!!.readText())
        assertTrue(PackStore.isReady("tree_pose"))
    }

    @Test fun clearMakesItNotReadyAgain() {
        PackStore.setReady("tree_pose", root)
        PackStore.clear("tree_pose")
        assertNull(PackStore.resolve("web/tree_pose/tree_pose_classifier.onnx"))
    }

    @Test fun pathsOutsideAnyPackResolveToNull() {
        PackStore.setReady("tree_pose", root)
        assertNull(PackStore.resolve("web/avatars/ojas_default.glb"))
    }

    @Test fun dotDotCannotEscapeTheRoot() {
        PackStore.setReady("tree_pose", root)
        assertNull(PackStore.resolve("web/tree_pose/../../../secret.txt"))
    }

    @Test fun symlinkOutOfTheRootIsRefused() {
        PackStore.setReady("tree_pose", root)
        val link = File(root, "web/tree_pose/link.onnx")
        Files.createSymbolicLink(link.toPath(), File(base, "secret.txt").toPath())
        assertNull(PackStore.resolve("web/tree_pose/link.onnx"))
    }

    @Test fun siblingFolderWithASimilarNameIsRefused() {
        // root is ".../assets"; ".../assets_evil" starts with the same text but is outside it.
        val evil = File(base, "assets_evil/web/tree_pose").also { it.mkdirs() }
        File(evil, "f").writeText("evil")
        PackStore.setReady("tree_pose", root)
        assertNull(PackStore.resolve("web/tree_pose/../../../assets_evil/web/tree_pose/f"))
    }

    @Test fun directoriesAndMissingFilesResolveToNull() {
        PackStore.setReady("tree_pose", root)
        File(root, "web/tree_pose/sub").mkdirs()
        assertNull(PackStore.resolve("web/tree_pose/sub"))
        assertNull(PackStore.resolve("web/tree_pose/missing.onnx"))
    }

    @Test fun apkBackedFlagIsTrackedAndCleared() {
        PackStore.markApkBacked("tree_pose")
        assertTrue(PackStore.isApkBacked("tree_pose"))
        PackStore.clear("tree_pose")
        assertFalse(PackStore.isApkBacked("tree_pose"))
    }
}
