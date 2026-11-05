package com.libertystreetfood.zyroscanner

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.print.PrintAttributes
import android.print.PrintManager
import android.webkit.JavascriptInterface
import android.webkit.RenderProcessGoneDetail
import android.webkit.SslErrorHandler
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.view.Gravity
import android.view.View
import android.widget.Toast
import android.widget.TextView

class MainActivity : Activity() {
    private lateinit var webView: WebView
    private lateinit var root: FrameLayout
    private lateinit var offlineMessage: TextView
    private val printViews = mutableListOf<WebView>()
    private val host = "zyro-78855.web.app"
    private val scannerUrl = "https://$host/management/?mode=scanner"

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = Color.rgb(2, 8, 23)
        window.navigationBarColor = Color.rgb(2, 8, 23)

        root = FrameLayout(this)
        webView = WebView(this)
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            useWideViewPort = true
            loadWithOverviewMode = false
            textZoom = 100
            javaScriptCanOpenWindowsAutomatically = false
            setSupportMultipleWindows(true)
            allowFileAccess = false
            allowContentAccess = false
            mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
            cacheMode = android.webkit.WebSettings.LOAD_DEFAULT
        }
        webView.addJavascriptInterface(ScannerBridge(this), "zyroScanner")
        webView.webViewClient = scannerWebViewClient()
        webView.webChromeClient = object : WebChromeClient() {
            override fun onCreateWindow(
                view: WebView,
                isDialog: Boolean,
                isUserGesture: Boolean,
                resultMsg: android.os.Message,
            ): Boolean {
                view.hitTestResult?.extra?.let(::openExternal)
                return false
            }
        }
        root.addView(webView, FrameLayout.LayoutParams(-1, -1))
        offlineMessage = TextView(this).apply {
            text = "Cloud nicht erreichbar.\nInternetverbindung prüfen und hier tippen."
            textSize = 18f
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            setPadding(32, 32, 32, 32)
            setBackgroundColor(Color.rgb(2, 8, 23))
            visibility = View.GONE
            setOnClickListener {
                visibility = View.GONE
                webView.loadUrl(scannerUrl)
            }
        }
        root.addView(offlineMessage, FrameLayout.LayoutParams(-1, -1))
        setContentView(root)
        webView.loadUrl(scannerUrl)
    }

    private fun scannerWebViewClient() = object : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val uri = request.url
            if (uri.scheme == "https" && uri.host == host) return false
            openExternal(uri.toString())
            return true
        }

        override fun onPageStarted(view: WebView, url: String, favicon: android.graphics.Bitmap?) {
            offlineMessage.visibility = View.GONE
        }

        override fun onReceivedError(
            view: WebView,
            request: WebResourceRequest,
            error: WebResourceError,
        ) {
            if (request.isForMainFrame) offlineMessage.visibility = View.VISIBLE
        }

        override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: android.net.http.SslError) {
            handler.cancel()
        }

        override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
            view.loadUrl(scannerUrl)
            return true
        }
    }

    private fun openExternal(value: String): Boolean {
        val uri = runCatching { Uri.parse(value) }.getOrNull() ?: return false
        if (uri.scheme != "https" || uri.host.isNullOrBlank()) return false
        return runCatching {
            startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW, uri))
            true
        }.getOrDefault(false)
    }

    private fun printLabel(html: String) {
        runOnUiThread {
            if (html.length > 200_000 || !isTrustedAppPage(webView.url)) {
                Toast.makeText(this, "Etikett konnte nicht gedruckt werden.", Toast.LENGTH_LONG).show()
                return@runOnUiThread
            }
            try {
                startLabelPrint(html)
            } catch (error: Exception) {
                Toast.makeText(this, "Druckfehler: ${error.message}", Toast.LENGTH_LONG).show()
            }
        }
    }

    private fun startLabelPrint(html: String) {
        run {
            val printView = WebView(this)
            printViews.add(printView)
            printView.alpha = 0f
            root.addView(printView, FrameLayout.LayoutParams(1, 1))
            printView.settings.javaScriptEnabled = false
            printView.settings.allowFileAccess = false
            printView.settings.allowContentAccess = false
            printView.webViewClient = object : WebViewClient() {
                override fun onPageFinished(view: WebView, url: String) {
                    val printManager = getSystemService(Context.PRINT_SERVICE) as PrintManager
                    val title = "ZYRO-Versandetikett-${System.currentTimeMillis()}"
                    val attributes = PrintAttributes.Builder()
                        .setMediaSize(PrintAttributes.MediaSize.ISO_A6)
                        .setColorMode(PrintAttributes.COLOR_MODE_MONOCHROME)
                        .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                        .build()
                    try {
                        printManager.print(title, view.createPrintDocumentAdapter(title), attributes)
                    } catch (error: Exception) {
                        Toast.makeText(this@MainActivity, "Druckfehler: ${error.message}", Toast.LENGTH_LONG).show()
                    }
                }
            }
            printView.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null)
        }
    }

    private fun isTrustedAppPage(value: String?): Boolean {
        val uri = runCatching { Uri.parse(value) }.getOrNull() ?: return false
        return uri.scheme == "https" && uri.host == host && uri.path?.startsWith("/management") == true
    }

    override fun onDestroy() {
        printViews.forEach { it.destroy() }
        printViews.clear()
        if (::webView.isInitialized) webView.destroy()
        super.onDestroy()
    }

    @Deprecated("Deprecated in Android API")
    override fun onBackPressed() {
        if (::webView.isInitialized && webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }

    class ScannerBridge(private val activity: MainActivity) {
        @JavascriptInterface
        fun printLabel(html: String) {
            activity.printLabel(html)
        }
    }
}
