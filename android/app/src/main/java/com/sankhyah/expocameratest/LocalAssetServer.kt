package com.sankhyah.expocameratest

import android.content.Context
import android.util.Log
import java.io.*
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.Executors
import com.sankhyah.expocameratest.packs.AssetRouting
import com.sankhyah.expocameratest.packs.PackManager
import com.sankhyah.expocameratest.packs.PackManifest
import com.sankhyah.expocameratest.packs.PackStore
import com.sankhyah.expocameratest.packs.Route

/**
 * LocalAssetServer: Lightweight, zero-dependency background HTTP server
 * Embedded on 127.0.0.1:8888 to serve APK internal assets (WASM, JS, .task)
 * to Android Chromium WebView under a secure origin (http://127.0.0.1:8888).
 *
 * This unlocks:
 * 1. WebAssembly streaming instantiation & SIMD acceleration
 * 2. navigator.mediaDevices.getUserMedia camera access in WebView
 * 3. 100% offline Guest mode pose tracking without CDN or internet connectivity
 */
object LocalAssetServer {
    private const val TAG = "LocalAssetServer"
    private const val PORT = 8888
    private var serverSocket: ServerSocket? = null
    private var isRunning = false
    private val threadPool = Executors.newCachedThreadPool()

    fun start(context: Context) {
        if (isRunning) return
        isRunning = true

        threadPool.execute {
            try {
                // Bind to localhost 127.0.0.1 on port 8888
                serverSocket = ServerSocket(PORT, 50, InetAddress.getByName("127.0.0.1"))
                Log.i(TAG, "LocalAssetServer started successfully on http://127.0.0.1:$PORT")

                while (isRunning && serverSocket != null && !serverSocket!!.isClosed) {
                    try {
                        val clientSocket = serverSocket!!.accept()
                        threadPool.execute {
                            handleClient(context, clientSocket)
                        }
                    } catch (e: Exception) {
                        if (!isRunning) break
                        Log.w(TAG, "Error accepting client connection: ${e.message}")
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to bind LocalAssetServer on port $PORT: ${e.message}")
            }
        }
    }

    fun stop() {
        isRunning = false
        try {
            serverSocket?.close()
            serverSocket = null
            Log.i(TAG, "LocalAssetServer stopped.")
        } catch (e: Exception) {
            Log.w(TAG, "Error closing server socket: ${e.message}")
        }
    }

    private const val MAX_REQUEST_LINE = 2048

    private fun handleClient(context: Context, socket: Socket) {
        var inputStream: InputStream? = null
        var outputStream: OutputStream? = null

        try {
            socket.soTimeout = 10000
            inputStream = socket.getInputStream()
            outputStream = socket.getOutputStream()
            val out = outputStream

            val reader = BufferedReader(InputStreamReader(inputStream))
            val requestLine = reader.readLine() ?: return

            if (requestLine.length > MAX_REQUEST_LINE) {
                sendText(out, "414 URI Too Long", "uri too long")
                return
            }
            val parts = requestLine.split(" ")
            if (parts.size < 2) return
            val method = parts[0]
            val rawTarget = parts[1]

            // CORS preflight: the pages fetch from http://127.0.0.1:8888 cross-origin.
            if (method == "OPTIONS") {
                val header = "HTTP/1.1 204 No Content\r\n" +
                        "Access-Control-Allow-Origin: *\r\n" +
                        "Access-Control-Allow-Methods: GET, HEAD, OPTIONS\r\n" +
                        "Access-Control-Allow-Headers: *\r\n" +
                        "Content-Length: 0\r\n" +
                        "Connection: close\r\n\r\n"
                out.write(header.toByteArray(Charsets.UTF_8))
                out.flush()
                return
            }
            if (method != "GET" && method != "HEAD") {
                sendText(out, "405 Method Not Allowed", "method not allowed")
                return
            }
            val head = method == "HEAD"

            // Health / ping check
            val pathOnly = rawTarget.substringBefore('?')
            if (pathOnly == "/ping" || pathOnly == "/health") {
                sendText(out, "200 OK", "OK", head = head)
                return
            }

            val relPath = try {
                PackManifest.sanitize(rawTarget)
            } catch (e: IllegalArgumentException) {
                sendText(out, "400 Bad Request", "bad path")
                return
            }

            val route = AssetRouting.decide(
                relPath,
                servable = { PackManager.isServable(it) },
                packFile = { PackStore.resolve(it) },
                apkOpen = { path ->
                    try { context.assets.open(path) } catch (e: IOException) { null }
                },
            )

            when (route) {
                is Route.ServeApk -> {
                    route.stream.use { stream ->
                        val mimeType = getMimeType(relPath)
                        val availableBytes = stream.available()
                        val headerBuilder = StringBuilder()
                        headerBuilder.append("HTTP/1.1 200 OK\r\n")
                        headerBuilder.append("Content-Type: $mimeType\r\n")
                        if (availableBytes > 0) {
                            headerBuilder.append("Content-Length: $availableBytes\r\n")
                        }
                        headerBuilder.append("Access-Control-Allow-Origin: *\r\n")
                        headerBuilder.append("Cross-Origin-Opener-Policy: same-origin\r\n")
                        headerBuilder.append("Cross-Origin-Embedder-Policy: require-corp\r\n")
                        headerBuilder.append("Cache-Control: public, max-age=31536000, immutable\r\n")
                        headerBuilder.append("Connection: close\r\n\r\n")
                        out.write(headerBuilder.toString().toByteArray(Charsets.UTF_8))
                        if (!head) copyStream(stream, out)
                        out.flush()
                    }
                }
                is Route.ServePack -> {
                    try {
                        FileInputStream(route.file).use { stream ->
                            val length = stream.channel.size()
                            val headerBuilder = StringBuilder()
                            headerBuilder.append("HTTP/1.1 200 OK\r\n")
                            headerBuilder.append("Content-Type: ${getMimeType(relPath)}\r\n")
                            headerBuilder.append("Content-Length: $length\r\n")
                            headerBuilder.append("Access-Control-Allow-Origin: *\r\n")
                            headerBuilder.append("Cross-Origin-Opener-Policy: same-origin\r\n")
                            headerBuilder.append("Cross-Origin-Embedder-Policy: require-corp\r\n")
                            // A changed pack in a new app version must never be masked by the WebView cache.
                            headerBuilder.append("Cache-Control: no-store\r\n")
                            headerBuilder.append("Connection: close\r\n\r\n")
                            out.write(headerBuilder.toString().toByteArray(Charsets.UTF_8))
                            if (!head) copyStream(stream, out)
                            out.flush()
                        }
                    } catch (e: FileNotFoundException) {
                        // The file vanished between the lookup and the open: treat it like a missing file.
                        PackManifest.packForPath(relPath)?.let { PackManager.onFileMissing(it.name) }
                        sendNotReady(out, PackManifest.packForPath(relPath)?.name ?: "unknown", head)
                    }
                }
                is Route.NotReady -> {
                    if (route.fileMissing) PackManager.onFileMissing(route.pack)
                    sendNotReady(out, route.pack, head)
                }
                Route.NotFound -> sendText(out, "404 Not Found", "404 Not Found: $relPath", head = head)
            }
        } catch (e: Exception) {
            Log.d(TAG, "Socket transmission exception: ${e.message}")
        } finally {
            try { outputStream?.close() } catch (e: Exception) {}
            try { inputStream?.close() } catch (e: Exception) {}
            try { socket.close() } catch (e: Exception) {}
        }
    }

    private fun copyStream(input: InputStream, out: OutputStream) {
        val buffer = ByteArray(8192)
        var bytesRead: Int
        while (input.read(buffer).also { bytesRead = it } != -1) {
            out.write(buffer, 0, bytesRead)
        }
    }

    /** A short text/plain answer with an exact Content-Length (also used for the 4xx errors and /ping). */
    private fun sendText(out: OutputStream, status: String, body: String, head: Boolean = false) {
        val bytes = body.toByteArray(Charsets.UTF_8)
        val header = "HTTP/1.1 $status\r\n" +
                "Content-Type: text/plain\r\n" +
                "Content-Length: ${bytes.size}\r\n" +
                "Access-Control-Allow-Origin: *\r\n" +
                "Connection: close\r\n\r\n"
        out.write(header.toByteArray(Charsets.UTF_8))
        if (!head) out.write(bytes)
        out.flush()
    }

    /** 503 for a pack that is not ready: never cached, and the body names the pack. */
    private fun sendNotReady(out: OutputStream, pack: String, head: Boolean) {
        val bytes = "pack_not_ready:$pack".toByteArray(Charsets.UTF_8)
        val header = "HTTP/1.1 503 Service Unavailable\r\n" +
                "Content-Type: text/plain\r\n" +
                "Content-Length: ${bytes.size}\r\n" +
                "Retry-After: 2\r\n" +
                "Cache-Control: no-store\r\n" +
                "Access-Control-Allow-Origin: *\r\n" +
                "Connection: close\r\n\r\n"
        out.write(header.toByteArray(Charsets.UTF_8))
        if (!head) out.write(bytes)
        out.flush()
    }

    private fun getMimeType(path: String): String {
        return when {
            path.endsWith(".wasm") -> "application/wasm"
            path.endsWith(".js") -> "application/javascript"
            path.endsWith(".mjs") -> "application/javascript"
            path.endsWith(".task") -> "application/octet-stream"
            path.endsWith(".binarypb") -> "application/octet-stream"
            path.endsWith(".tflite") -> "application/octet-stream"
            path.endsWith(".onnx") -> "application/octet-stream"
            path.endsWith(".vrm") || path.endsWith(".glb") -> "model/gltf-binary"
            path.endsWith(".html") -> "text/html"
            path.endsWith(".css") -> "text/css"
            path.endsWith(".json") -> "application/json"
            path.endsWith(".png") -> "image/png"
            path.endsWith(".jpg") || path.endsWith(".jpeg") -> "image/jpeg"
            path.endsWith(".svg") -> "image/svg+xml"
            else -> "application/octet-stream"
        }
    }
}
