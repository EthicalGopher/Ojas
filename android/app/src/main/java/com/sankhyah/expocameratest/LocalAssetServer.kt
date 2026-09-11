package com.sankhyah.expocameratest

import android.content.Context
import android.util.Log
import java.io.*
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.Executors

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

    private fun handleClient(context: Context, socket: Socket) {
        var inputStream: InputStream? = null
        var outputStream: OutputStream? = null

        try {
            socket.soTimeout = 10000
            inputStream = socket.getInputStream()
            outputStream = socket.getOutputStream()

            val reader = BufferedReader(InputStreamReader(inputStream))
            val requestLine = reader.readLine() ?: return

            val parts = requestLine.split(" ")
            if (parts.size < 2) return

            val method = parts[0]
            var rawPath = parts[1]

            // Strip query parameters if present
            if (rawPath.contains("?")) {
                rawPath = rawPath.substring(0, rawPath.indexOf("?"))
            }

            // Health / Ping check
            if (rawPath == "/ping" || rawPath == "/health") {
                val okBody = "OK".toByteArray(Charsets.UTF_8)
                val header = "HTTP/1.1 200 OK\r\n" +
                        "Content-Type: text/plain\r\n" +
                        "Content-Length: ${okBody.size}\r\n" +
                        "Access-Control-Allow-Origin: *\r\n" +
                        "Connection: close\r\n\r\n"
                outputStream.write(header.toByteArray(Charsets.UTF_8))
                outputStream.write(okBody)
                outputStream.flush()
                return
            }

            // Sanitize asset path (prevent path traversal)
            val cleanPath = rawPath.trimStart('/').replace("..", "")
            val assetPath = if (cleanPath.startsWith("web/")) cleanPath else "web/$cleanPath"

            try {
                val assetManager = context.assets
                val fileStream = assetManager.open(assetPath)
                val mimeType = getMimeType(assetPath)
                val availableBytes = fileStream.available()

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

                outputStream.write(headerBuilder.toString().toByteArray(Charsets.UTF_8))

                val buffer = ByteArray(8192)
                var bytesRead: Int
                while (fileStream.read(buffer).also { bytesRead = it } != -1) {
                    outputStream.write(buffer, 0, bytesRead)
                }
                outputStream.flush()
                fileStream.close()
            } catch (e: FileNotFoundException) {
                val notFoundBody = "404 Not Found: $assetPath".toByteArray(Charsets.UTF_8)
                val header = "HTTP/1.1 404 Not Found\r\n" +
                        "Content-Type: text/plain\r\n" +
                        "Content-Length: ${notFoundBody.size}\r\n" +
                        "Access-Control-Allow-Origin: *\r\n" +
                        "Connection: close\r\n\r\n"
                outputStream.write(header.toByteArray(Charsets.UTF_8))
                outputStream.write(notFoundBody)
                outputStream.flush()
            }
        } catch (e: Exception) {
            Log.d(TAG, "Socket transmission exception: ${e.message}")
        } finally {
            try { outputStream?.close() } catch (e: Exception) {}
            try { inputStream?.close() } catch (e: Exception) {}
            try { socket.close() } catch (e: Exception) {}
        }
    }

    private fun getMimeType(path: String): String {
        return when {
            path.endsWith(".wasm") -> "application/wasm"
            path.endsWith(".js") -> "application/javascript"
            path.endsWith(".mjs") -> "application/javascript"
            path.endsWith(".task") -> "application/octet-stream"
            path.endsWith(".binarypb") -> "application/octet-stream"
            path.endsWith(".tflite") -> "application/octet-stream"
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
