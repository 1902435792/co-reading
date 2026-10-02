package com.deepreader.app

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.os.SystemClock
import android.view.MotionEvent
import android.view.VelocityTracker
import android.view.ViewConfiguration
import android.view.ViewGroup
import android.view.Gravity
import android.widget.FrameLayout
import android.graphics.Rect
import android.os.Bundle
import android.view.ActionMode
import android.view.Menu
import android.view.MenuInflater
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.widget.PopupMenu
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import kotlin.math.abs

class MainActivity : TauriActivity() {
  private var webViewRef: WebView? = null

  // 手机看书时（起点式全屏）：藏起状态栏，顶部不再留白，由网页自己在摄像头下方留一行章节名。
  private var readerImmersive = false
  /** 手机首页也藏起系统状态栏（顶部只给摄像头让位，布局不变） */
  private var homeStatusHidden = false
  private var topInsetPx = 0

  // 仿真翻页（网页告诉我们什么时候可以用：分页 + 选了「仿真」+ 菜单和面板都收着）
  private var curlEnabled = false
  private var curlView: CurlView? = null
  /** 当前这一次翻页："right" 下一页 / "left" 上一页；null 表示没有在翻 */
  private var curlSide: String? = null
  private var curlDragging = false
  /** 网页已经把书翻过去了（上一页时要等它翻完再截新页） */
  private var curlTurned = false
  private var curlReleased: Boolean? = null
  private var downX = 0f
  private var downY = 0f
  private var downTime = 0L
  private var deciding = false
  private var velocity: VelocityTracker? = null
  private var curlStart = 0L
  /** 正在选字（拖选区手柄时不能当成翻页） */
  private var selectionActive = false
  /**
   * 平板：只卷书页那一块（WebView 内的像素坐标）。null = 整个 WebView（手机）。
   * 侧栏开着时，截图、卷页层、能起手翻页的地方都只限这一块，侧栏不受影响。
   */
  private var curlRegion: Rect? = null
  /** 这一次翻页的书页区域在窗口里的位置（起手时算好，拖动中不变） */
  private var curlWinTop = 0
  private var curlWidth = 1

  // 返回键 / 返回手势交给网页处理（关面板、回首页）；网页说没东西可关，就退到后台而不是结束 App。
  override val handleBackNavigation: Boolean = false

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    // 给状态栏 / 导航栏 / 刘海 / 键盘让出空间：否则界面画到系统栏底下，
    // 录屏等场景状态栏一出现，顶部按钮（主页、设置）就被挡住；键盘也会盖住输入框。
    val content = findViewById<View>(android.R.id.content)
    ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
      val bars = insets.getInsets(
        WindowInsetsCompat.Type.systemBars() or
          WindowInsetsCompat.Type.displayCutout() or
          WindowInsetsCompat.Type.ime()
      )
      // 看书时顶部不留白（状态栏临时出现也不重排书页）
      view.setPadding(bars.left, if (readerImmersive) 0 else bars.top, bars.right, bars.bottom)
      topInsetPx = insets.getInsetsIgnoringVisibility(
        WindowInsetsCompat.Type.statusBars() or WindowInsetsCompat.Type.displayCutout()
      ).top
      publishTopInset()
      WindowInsetsCompat.CONSUMED
    }
    onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
      override fun handleOnBackPressed() {
        val webView = webViewRef
        if (webView == null) {
          moveTaskToBack(true)
          return
        }
        webView.evaluateJavascript("(window.__deepreaderBack && window.__deepreaderBack()) ? 1 : 0") { result ->
          if (result != "1") moveTaskToBack(true)
        }
      }
    })
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    webViewRef = webView
    webView.addJavascriptInterface(NativeBridge(), "DeepReaderNative")
  }

  /** 把顶部要让出的高度（状态栏 / 摄像头）告诉网页；不在看书时为 0。 */
  private fun publishTopInset() {
    val css = if (readerImmersive) topInsetPx / resources.displayMetrics.density else 0f
    webViewRef?.evaluateJavascript(
      "document.documentElement.style.setProperty('--dr-top-inset','${css}px')", null
    )
  }

  private fun statusBars(visible: Boolean) {
    val controller = WindowCompat.getInsetsController(window, window.decorView)
    controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    if (visible) controller.show(WindowInsetsCompat.Type.statusBars())
    else controller.hide(WindowInsetsCompat.Type.statusBars())
  }

  // ---------------- 仿真翻页 ----------------

  // 截图用的三张图反复用，不每次新建（每张约 10MB，新建 + 回收会让翻页开头卡一下）
  private var bmpCur: Bitmap? = null   // 当前页
  private var bmpOther: Bitmap? = null // 往回翻时截的上一页
  private var bmpPrev: Bitmap? = null  // 缓存：刚翻过去的那一页（往回翻时直接用）
  private var prevKey: String? = null  // 缓存那一页的位置
  private var turnBefore: String? = null
  private var usedCache = false
  private var prefetchReady = false
  private var prefetchPending = false
  private var prefetchSeq = 0
  /** 开始拖了但预取还没回来：先记着，回来（或最多等 60ms）再开始卷 */
  private var pendingDragSide: String? = null
  private var lastX = 0f
  private var lastY = 0f
  private val mainHandler by lazy { android.os.Handler(android.os.Looper.getMainLooper()) }

  private fun sized(old: Bitmap?, w: Int, h: Int): Bitmap =
    if (old != null && !old.isRecycled && old.width == w && old.height == h) old
    else Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)

  /** 书页区域（WebView 内坐标，夹在 WebView 范围内）；没设就是整个 WebView */
  private fun regionIn(w: WebView): Rect {
    val full = Rect(0, 0, w.width, w.height)
    val r = curlRegion ?: return full
    val out = Rect(r)
    return if (out.intersect(full) && out.width() > 0 && out.height() > 0) out else full
  }

  /** 书页区域在窗口里的位置（触摸坐标就是窗口坐标） */
  private fun regionInWindow(): Rect? {
    val w = webViewRef ?: return null
    val loc = IntArray(2)
    w.getLocationInWindow(loc)
    val r = regionIn(w)
    r.offset(loc[0], loc[1])
    return r
  }

  /** 卷页层只盖住书页区域 */
  private fun layoutCurlView(v: CurlView) {
    val w = webViewRef
    val content = findViewById<View>(android.R.id.content)
    val lp = if (w == null || curlRegion == null) {
      FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
    } else {
      val r = regionIn(w)
      val wl = IntArray(2)
      val cl = IntArray(2)
      w.getLocationInWindow(wl)
      content.getLocationInWindow(cl)
      FrameLayout.LayoutParams(r.width(), r.height()).apply {
        gravity = Gravity.TOP or Gravity.START
        leftMargin = wl[0] - cl[0] - content.paddingLeft + r.left
        topMargin = wl[1] - cl[1] - content.paddingTop + r.top
      }
    }
    // 没变就不动（设一次会让整页重新排版，翻页开头会顿一下）
    val old = v.layoutParams as? FrameLayout.LayoutParams
    if (old != null && old.width == lp.width && old.height == lp.height && old.gravity == lp.gravity &&
      old.leftMargin == lp.leftMargin && old.topMargin == lp.topMargin
    ) return
    v.layoutParams = lp
  }

  /** 手指一按下就用 GPU 拷一张当前页（很快、不占主线程），真开始翻时直接用 */
  private fun prefetchCurrentPage() {
    val w = webViewRef ?: return
    if (w.width <= 0 || w.height <= 0 || android.os.Build.VERSION.SDK_INT < 26) return
    val rect = regionInWindow() ?: return
    val bmp = sized(bmpCur, rect.width(), rect.height()).also { bmpCur = it }
    val seq = ++prefetchSeq
    prefetchReady = false
    prefetchPending = true
    val t0 = SystemClock.uptimeMillis()
    try {
      android.view.PixelCopy.request(window, rect, bmp, { result ->
        if (seq == prefetchSeq) {
          prefetchPending = false
          prefetchReady = result == android.view.PixelCopy.SUCCESS
          android.util.Log.d("DRCurl", "prefetch ${SystemClock.uptimeMillis() - t0}ms ok=$prefetchReady")
          if (pendingDragSide != null) startPendingDrag()
        }
      }, mainHandler)
    } catch (e: Throwable) {
      prefetchReady = false
      prefetchPending = false
    }
  }

  /** 当前页截图：优先用按下时预取的，来不及就软件画一张 */
  private fun currentPageShot(): Bitmap? {
    val cur = bmpCur
    if (prefetchReady && cur != null) {
      prefetchReady = false
      return cur
    }
    prefetchSeq++ // 作废还没回来的预取
    prefetchPending = false
    return drawWebView(false)
  }

  private fun dragProgress(x: Float): Float {
    val w = curlWidth.coerceAtLeast(1).toFloat()
    val dx = x - downX
    return if (curlSide == "right") (-dx / w * 1.15f) else (1f - dx / w * 1.15f)
  }

  private fun applyDrag(x: Float, y: Float) {
    val v = curlView ?: return
    v.progress = dragProgress(x)
    // 手指往上/往下，页角也跟着抬起/压低
    val dy = y - downY
    val h = (if (v.height > 0) v.height else curlWidth).toFloat()
    v.dragLift = (if (v.fromBottom) -dy else dy).coerceIn(-h * 0.12f, h * 0.35f)
  }

  /** 预取回来了（或等不及了）：真正开始卷，并追上手指现在的位置 */
  private fun startPendingDrag() {
    val side = pendingDragSide ?: return
    pendingDragSide = null
    if (beginCurl(side, downY)) {
      if (curlDragging) applyDrag(lastX, lastY)
    } else {
      curlDragging = false
    }
  }

  /** 软件画一张 WebView（other=true 画到第二张图上） */
  private fun drawWebView(other: Boolean): Bitmap? {
    val w = webViewRef ?: return null
    if (w.width <= 0 || w.height <= 0) return null
    val t0 = SystemClock.uptimeMillis()
    val r = regionIn(w)
    return try {
      val bmp = if (other) sized(bmpOther, r.width(), r.height()).also { bmpOther = it }
      else sized(bmpCur, r.width(), r.height()).also { bmpCur = it }
      val c = Canvas(bmp)
      c.translate(-r.left.toFloat(), -r.top.toFloat())
      w.draw(c)
      android.util.Log.d("DRCurl", "softdraw ${SystemClock.uptimeMillis() - t0}ms other=$other")
      bmp
    } catch (e: Throwable) {
      null
    }
  }

  private fun ensureCurlView(): CurlView {
    curlView?.let { return it }
    val v = CurlView(this)
    v.visibility = View.GONE
    (findViewById<View>(android.R.id.content) as ViewGroup).addView(
      v, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
    )
    curlView = v
    return v
  }

  private fun endCurl() {
    curlView?.let {
      it.visibility = View.GONE
      it.clear()
    }
    curlSide = null
    curlDragging = false
    curlTurned = false
    curlReleased = null
    usedCache = false
    waitingEnd = null
    pendingDragSide = null
  }

  /** 开始一次翻页：截当前页、盖上，再让网页真的翻过去。 */
  private fun beginCurl(side: String, fromY: Float): Boolean {
    if (curlSide != null) return false
    val t0 = SystemClock.uptimeMillis()
    val shot = currentPageShot() ?: return false
    val v = ensureCurlView()
    layoutCurlView(v)
    curlWinTop = regionInWindow()?.top ?: 0
    curlWidth = shot.width
    v.fromBottom = fromY - curlWinTop > shot.height * 0.35f
    v.dragLift = 0f
    usedCache = false
    if (side == "right") {
      v.setPages(shot, null)
      v.progress = 0f
    } else {
      // 往回翻：刚翻过去的那页如果还在缓存里就直接用；没有就先用一张白纸跟着手指，截好再换上
      val cached = bmpPrev
      usedCache = cached != null && prevKey != null
      v.setPages(if (usedCache) cached else null, shot)
      v.pendingFront = !usedCache
      v.progress = 1f
    }
    v.visibility = View.VISIBLE
    v.bringToFront()
    curlSide = side
    curlStart = SystemClock.uptimeMillis()
    curlTurned = false
    curlReleased = null
    turnBefore = null
    android.util.Log.d("DRCurl", "begin $side ${SystemClock.uptimeMillis() - t0}ms cache=$usedCache")
    webViewRef?.evaluateJavascript(
      "window.__deepreaderCurlTurn ? window.__deepreaderCurlTurn('$side') : (window.DeepReaderNative && DeepReaderNative.curlTurned(false,'',''))",
      null
    )
    return true
  }

  /** 动画已经走完、在等网页翻页 / 截图 */
  private var waitingEnd: Boolean? = null

  /** 网页翻完了（turned=false 表示到头了翻不动）；before/after 是翻页前后的位置 */
  private fun onCurlTurned(turned: Boolean, before: String, after: String) {
    val v = curlView ?: return
    val side = curlSide ?: return
    android.util.Log.d("DRCurl", "turned $side ${SystemClock.uptimeMillis() - curlStart}ms")
    if (!turned) {
      // 到头了：把页放回去
      waitingEnd = null
      v.animateTo(if (side == "right") 0f else 1f, 200) { endCurl() }
      return
    }
    curlTurned = true
    turnBefore = before
    if (side == "left" && !(usedCache && after == prevKey)) {
      // 缓存不对 / 没有缓存：网页已经在底下换成上一页了，现在截下来
      v.post {
        if (curlSide != "left") return@post
        val prev = drawWebView(true)
        if (prev == null) {
          endCurl()
          return@post
        }
        usedCache = false
        v.setPages(prev, v.back)
        v.pendingFront = false
        afterReady()
      }
      return
    }
    afterReady()
  }

  /** 网页翻好（上一页也截好）之后：如果动画已经走完就收尾 */
  private fun afterReady() {
    val done = waitingEnd ?: return
    waitingEnd = null
    settleCurl(done)
  }

  /** 松手 / 点击：complete=true 翻过去，false 放回原处。动画马上开始，不等网页 */
  private fun finishCurl(complete: Boolean) {
    val v = curlView ?: return
    val side = curlSide ?: return
    curlReleased = complete
    val target = if (side == "right") (if (complete) 1f else 0f) else (if (complete) 0f else 1f)
    v.animateTo(target, 360) {
      val ready = curlTurned && !(side == "left" && v.front == null)
      if (ready) settleCurl(complete) else waitingEnd = complete
    }
  }

  private fun settleCurl(complete: Boolean) {
    val v = curlView ?: return
    val side = curlSide ?: return
    if (complete) {
      if (side == "right") {
        // 刚翻走的这页留作缓存：马上往回翻时不用再截
        val old = bmpPrev
        bmpPrev = v.front
        prevKey = turnBefore
        bmpCur = old
      } else {
        prevKey = null // 再往前一页是什么不知道
      }
      endCurl()
    } else {
      // 放回去了：书也翻回来，等一下再撤掉盖着的截图，免得闪
      val back = if (side == "right") "left" else "right"
      webViewRef?.evaluateJavascript("window.__deepreaderCurlTurn && window.__deepreaderCurlTurn('$back', true)", null)
      v.postDelayed({ endCurl() }, 160)
    }
  }

  override fun dispatchTouchEvent(ev: MotionEvent): Boolean {
    val v = curlView
    // 保险：一次翻页 2.5 秒还没结束就强制收掉，绝不让屏幕点不动
    if (curlSide != null && !curlDragging && SystemClock.uptimeMillis() - curlStart > 2500) endCurl()
    // 翻页动画进行中：吃掉触摸，免得误点
    if (curlSide != null && !curlDragging) return true
    if (!curlEnabled && !curlDragging) return super.dispatchTouchEvent(ev)
    when (ev.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        downX = ev.x
        downY = ev.y
        downTime = SystemClock.uptimeMillis()
        // 平板侧栏开着：只有按在书页区域里才可能是翻页，按在侧栏里完全交给网页
        val inPage = curlRegion == null || regionInWindow()?.contains(ev.x.toInt(), ev.y.toInt()) != false
        deciding = !selectionActive && inPage
        velocity?.recycle()
        velocity = VelocityTracker.obtain().also { it.addMovement(ev) }
        if (deciding) prefetchCurrentPage()
      }
      MotionEvent.ACTION_POINTER_DOWN -> deciding = false
      MotionEvent.ACTION_MOVE -> {
        velocity?.addMovement(ev)
        lastX = ev.x
        lastY = ev.y
        if (curlDragging) {
          if (curlSide != null) applyDrag(ev.x, ev.y)
          return true
        }
        if (deciding) {
          val dx = ev.x - downX
          val dy = ev.y - downY
          val slop = ViewConfiguration.get(this).scaledTouchSlop * 1.5f
          val quick = SystemClock.uptimeMillis() - downTime < 350 // 长按选字后再拖，不算翻页
          if (abs(dx) > slop && abs(dx) > abs(dy) * 1.3f && quick) {
            deciding = false
            val cancel = MotionEvent.obtain(ev).apply { action = MotionEvent.ACTION_CANCEL }
            super.dispatchTouchEvent(cancel)
            cancel.recycle()
            val side = if (dx < 0) "right" else "left"
            curlDragging = true
            if (prefetchPending) {
              // 按下时的截图还在路上（一般 20ms 左右）：等它，不在主线程上硬画
              pendingDragSide = side
              mainHandler.postDelayed({ if (pendingDragSide != null) startPendingDrag() }, 60)
              return true
            }
            if (!beginCurl(side, downY)) curlDragging = false
            return true
          } else if (abs(dy) > slop || !quick) {
            deciding = false
          }
        }
      }
      MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
        deciding = false
        if (curlDragging) {
          velocity?.addMovement(ev)
          if (pendingDragSide != null) startPendingDrag() // 手指都抬起了还没开始：现在开始
          if (curlSide == null) {
            curlDragging = false
            return true
          }
          velocity?.computeCurrentVelocity(1000)
          val vx = velocity?.xVelocity ?: 0f
          val p = v?.progress ?: 0f
          val complete = if (curlSide == "right") (p > 0.22f || vx < -900f) && vx < 600f
          else (p < 0.78f || vx > 900f) && vx > -600f
          curlDragging = false
          finishCurl(complete && ev.actionMasked == MotionEvent.ACTION_UP)
          return true
        }
      }
    }
    return super.dispatchTouchEvent(ev)
  }

  /** 网页调用：状态栏和仿真翻页的开关，不涉及任何数据。 */
  inner class NativeBridge {
    @JavascriptInterface
    fun setReaderImmersive(on: Boolean) {
      runOnUiThread {
        readerImmersive = on
        statusBars(!on && !homeStatusHidden)
        ViewCompat.requestApplyInsets(findViewById(android.R.id.content))
        publishTopInset()
      }
    }

    /** 摄像头 / 手势条那条留白的颜色跟着界面走（不然是一条白边） */
    @JavascriptInterface
    fun setEdgeColor(r: Int, g: Int, b: Int) {
      runOnUiThread {
        findViewById<View>(android.R.id.content).setBackgroundColor(android.graphics.Color.rgb(r, g, b))
      }
    }

    @JavascriptInterface
    fun setHomeStatusBarHidden(hidden: Boolean) {
      runOnUiThread {
        homeStatusHidden = hidden
        if (!readerImmersive) statusBars(!hidden)
      }
    }

    @JavascriptInterface
    fun setStatusBarVisible(visible: Boolean) {
      runOnUiThread { if (readerImmersive) statusBars(visible) }
    }

    /** 仿真翻页开关（分页 + 选了仿真 + 菜单面板都收着时才开） */
    @JavascriptInterface
    fun setCurlEnabled(on: Boolean) {
      runOnUiThread {
        curlEnabled = on
        // 菜单打开期间可能换了主题、字号、跳了章节：缓存的上一页作废
        if (!on) {
          prevKey = null
          prefetchReady = false
        }
      }
    }

    /**
     * 平板：书页区域（WebView 内的像素，网页已乘过 devicePixelRatio）。w 或 h <= 0 表示整个 WebView。
     * 侧栏开关、拖宽、转屏时网页会重新告诉我们。
     */
    @JavascriptInterface
    fun setCurlRegion(x: Int, y: Int, w: Int, h: Int) {
      runOnUiThread {
        val next = if (w > 0 && h > 0) Rect(x, y, x + w, y + h) else null
        if (next == curlRegion) return@runOnUiThread
        curlRegion = next
        // 区域变了：缓存的截图尺寸 / 位置都不对了
        prevKey = null
        prefetchReady = false
      }
    }

    /** 点左右翻页时用仿真效果："left" 上一页 / "right" 下一页 */
    @JavascriptInterface
    fun curlTurn(side: String) {
      runOnUiThread {
        if (side != "left" && side != "right") return@runOnUiThread
        // 点击翻页：从下角翻起
        if (beginCurl(side, Float.MAX_VALUE)) finishCurl(true)
      }
    }

    /** 网页翻完一页后回调 */
    @JavascriptInterface
    fun curlTurned(turned: Boolean, before: String, after: String) {
      runOnUiThread { onCurlTurned(turned, before, after) }
    }
  }

  /** 长按的是输入框：保留系统菜单（粘贴要用）。 */
  private fun isEditingText(): Boolean =
    webViewRef?.hitTestResult?.type == WebView.HitTestResult.EDIT_TEXT_TYPE

  // 选中书里的文字时完全不弹系统的「复制 / 分享 / 翻译 / 搜索」浮动菜单。
  // 旧做法是清空菜单项，但小米 HyperOS / MIUI 仍会弹自己的窗口；
  // 现在直接交给系统一个「静默」的菜单对象，不创建真正的浮动工具栏：
  // 选区和拖动手柄照常保留，由 App 自己的划线 / 评论菜单接手（里面有复制）。
  override fun onWindowStartingActionMode(callback: ActionMode.Callback?, type: Int): ActionMode? {
    if (callback == null || type != ActionMode.TYPE_FLOATING || isEditingText()) {
      return super.onWindowStartingActionMode(callback, type)
    }
    val menu = PopupMenu(this, webViewRef ?: window.decorView).menu
    val mode = SilentActionMode(this, callback, menu) { selectionActive = false }
    if (!callback.onCreateActionMode(mode, menu)) return null
    selectionActive = true
    callback.onPrepareActionMode(mode, menu)
    menu.clear()
    return mode
  }
}

/** 什么都不显示的浮动 ActionMode：只负责把生命周期回调转给 WebView。 */
private class SilentActionMode(
  private val context: Context,
  private val callback: ActionMode.Callback,
  private val menu: Menu,
  private val onFinished: () -> Unit = {},
) : ActionMode() {
  private var finished = false

  init {
    type = TYPE_FLOATING
  }

  override fun setTitle(title: CharSequence?) {}
  override fun setTitle(resId: Int) {}
  override fun setSubtitle(subtitle: CharSequence?) {}
  override fun setSubtitle(resId: Int) {}
  override fun setCustomView(view: View?) {}

  override fun invalidate() {
    callback.onPrepareActionMode(this, menu)
    menu.clear()
  }

  override fun invalidateContentRect() {}

  override fun finish() {
    if (finished) return
    finished = true
    onFinished()
    callback.onDestroyActionMode(this)
  }

  override fun getMenu(): Menu = menu
  override fun getTitle(): CharSequence? = null
  override fun getSubtitle(): CharSequence? = null
  override fun getCustomView(): View? = null
  override fun getMenuInflater(): MenuInflater = MenuInflater(context)
}
