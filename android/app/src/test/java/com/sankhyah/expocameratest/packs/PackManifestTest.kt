package com.sankhyah.expocameratest.packs

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.fail
import org.junit.Test

class PackManifestTest {
    private fun rejects(raw: String) {
        try {
            val out = PackManifest.sanitize(raw)
            fail("expected '$raw' to be rejected but got '$out'")
        } catch (expected: IllegalArgumentException) {
            // ok
        }
    }

    @Test fun sanitizeAddsWebPrefixAndStripsQuery() {
        assertEquals("web/tree_pose/a.wasm", PackManifest.sanitize("/tree_pose/a.wasm?v=1"))
        assertEquals("web/pose.js", PackManifest.sanitize("/web/pose.js"))
        assertEquals("web/pose.js", PackManifest.sanitize("pose.js#frag"))
        assertEquals("web/avatars/a b.glb", PackManifest.sanitize("/avatars/a%20b.glb"))
    }

    @Test fun sanitizeRejectsTraversalAndOddInput() {
        rejects("%2e%2e/secret")
        rejects("a/../b")
        rejects("a//b")
        rejects("a\\b")
        rejects("a%00b")
        rejects("%5c..")
        rejects("")
        rejects("/")
        rejects("%zz")
        rejects("abc%4")
        rejects("a/.")
        rejects("%2e/a")
        rejects("/tree_pose/")
    }

    @Test fun sanitizeDecodesExactlyOnce() {
        // %252e%252e decodes once to the literal text "%2e%2e", which is just an odd file name.
        assertEquals("web/%2e%2e", PackManifest.sanitize("%252e%252e"))
    }

    @Test fun packForPathMatchesOnlyPackFiles() {
        assertEquals("pose_heavy", PackManifest.packForPath("web/pose_landmark_heavy.tflite")?.name)
        assertEquals("tree_pose", PackManifest.packForPath("web/tree_pose/tree_pose_classifier.onnx")?.name)
        assertEquals("tree_pose", PackManifest.packForPath("web/tree_pose/ort.wasm.min.js")?.name)
        assertNull(PackManifest.packForPath("web/pose_landmark_heavy.tflite.bak"))
        assertNull(PackManifest.packForPath("web/tree_pose"))
        assertNull(PackManifest.packForPath("web/tree_pose_evil/x"))
        assertNull(PackManifest.packForPath("web/pose_landmark_full.tflite"))
        assertNull(PackManifest.packForPath("web/avatars/ojas_default.glb"))
    }

    @Test fun everyExpectedFileBelongsToItsOwnPack() {
        for (spec in PackManifest.ALL) {
            assertNotNull(spec.expectedFiles.firstOrNull())
            for (file in spec.expectedFiles) assertEquals(spec.name, PackManifest.packForPath(file)?.name)
        }
    }
}
