package com.deepreader.app

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PointF
import android.graphics.Shader
import android.view.View
import android.view.animation.DecelerateInterpolator
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.hypot
import kotlin.math.sin

/**
 * 仿真翻页：盖在书上的一层，把「翻走的那一页」的截图像纸一样从角上折过去。
 * progress = 0 页面平放；progress = 1 整页翻走。
 * 下一页：front = 当前页截图，下面露出的是真实的书（已经翻到下一页）。
 * 上一页：back = 当前页截图（垫底），front = 上一页截图，从左边折回来盖上（progress 从 1 走到 0）。
 */
class CurlView(context: Context) : View(context) {
  var front: Bitmap? = null
  var back: Bitmap? = null
  /** 从下角（true）还是上角（false）翻起 */
  var fromBottom = true
  var progress = 0f
    set(value) {
      field = value.coerceIn(0f, 1f)
      invalidate()
    }
  /** 拖动时手指上下移动让页角额外抬起的高度（px） */
  var dragLift = 0f
    set(value) {
      field = value
      invalidate()
    }
  /** 往回翻时上一页还没截好：先画一张白纸 */
  var pendingFront = false

  private val paint = Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG)
  private val shade = Paint(Paint.ANTI_ALIAS_FLAG)
  private val keep = Path()
  private val cut = Path()
  private val flap = Path()
  private val mirror = Matrix()
  private var animator: ValueAnimator? = null
  private var paperColor = Color.WHITE
  private var paperBack = Color.argb(225, 255, 255, 255)

  fun setPages(front: Bitmap?, back: Bitmap?) {
    this.front = front
    this.back = back
    // 纸背面的颜色：取截图角上的底色
    val src = front ?: back
    if (src != null && src.width > 4 && src.height > 4) paperColor = src.getPixel(src.width - 3, src.height / 2)
    paperBack = Color.argb(225, Color.red(paperColor), Color.green(paperColor), Color.blue(paperColor))
    invalidate()
  }

  fun animateTo(target: Float, durationMs: Long, end: () -> Unit) {
    animator?.cancel()
    val start = progress
    val lift0 = dragLift
    val dist = abs(target - start)
    animator = ValueAnimator.ofFloat(start, target).apply {
      duration = (durationMs * dist.coerceIn(0.25f, 1f)).toLong().coerceAtLeast(90)
      interpolator = DecelerateInterpolator(1.4f)
      addUpdateListener {
        dragLift = lift0 * (1f - it.animatedFraction)
        progress = it.animatedValue as Float
      }
      addListener(object : android.animation.AnimatorListenerAdapter() {
        private var cancelled = false
        override fun onAnimationCancel(animation: android.animation.Animator) {
          cancelled = true
        }

        override fun onAnimationEnd(animation: android.animation.Animator) {
          if (!cancelled) end()
        }
      })
      start()
    }
  }

  fun cancelAnimation() {
    animator?.cancel()
    animator = null
  }

  fun clear() {
    cancelAnimation()
    front = null
    back = null
    pendingFront = false
    dragLift = 0f
    progress = 0f
  }

  /** 用半平面 dot(v - m, n) <= 0（keepSide=true）或 > 0 去裁一个矩形，得到多边形 */
  private fun clipRect(w: Float, h: Float, m: PointF, n: PointF, keepSide: Boolean, out: Path): Boolean {
    val pts = arrayOf(PointF(0f, 0f), PointF(w, 0f), PointF(w, h), PointF(0f, h))
    val res = ArrayList<PointF>(6)
    fun side(p: PointF): Float {
      val d = (p.x - m.x) * n.x + (p.y - m.y) * n.y
      return if (keepSide) -d else d
    }
    for (i in pts.indices) {
      val a = pts[i]
      val b = pts[(i + 1) % pts.size]
      val sa = side(a)
      val sb = side(b)
      if (sa >= 0) res.add(a)
      if ((sa >= 0) != (sb >= 0)) {
        val t = sa / (sa - sb)
        res.add(PointF(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t))
      }
    }
    out.reset()
    if (res.size < 3) return false
    out.moveTo(res[0].x, res[0].y)
    for (i in 1 until res.size) out.lineTo(res[i].x, res[i].y)
    out.close()
    return true
  }

  override fun onDraw(canvas: Canvas) {
    val w = width.toFloat()
    val h = height.toFloat()
    back?.let { canvas.drawBitmap(it, 0f, 0f, paint) }
    val page = front
    if (page == null && !pendingFront) return
    val p = progress
    if (p <= 0.001f) {
      if (page != null) canvas.drawBitmap(page, 0f, 0f, paint) else canvas.drawColor(paperColor)
      return
    }
    if (p >= 0.999f) return

    // 角点 C，翻页点 P：P 从角上出发往左走两页宽，路上略微抬起一点
    val cx = w
    val cy = if (fromBottom) h else 0f
    val lift = (sin(PI * p) * h * 0.10).toFloat() + dragLift * (1f - p * 0.5f)
    val px = cx - 2f * w * p
    val py = if (fromBottom) cy - lift else cy + lift
    val m = PointF((px + cx) / 2f, (py + cy) / 2f)
    var nx = cx - px
    var ny = cy - py
    val len = hypot(nx, ny).coerceAtLeast(0.001f)
    nx /= len
    ny /= len
    val n = PointF(nx, ny)

    // 1. 还平放着的那部分
    if (clipRect(w, h, m, n, true, keep)) {
      canvas.save()
      canvas.clipPath(keep)
      if (page != null) canvas.drawBitmap(page, 0f, 0f, paint) else canvas.drawColor(paperColor)
      canvas.restore()
    }
    if (!clipRect(w, h, m, n, false, cut)) return

    // 2. 露出来的下一页上，靠折线处的阴影
    val shadowW = 0.06f * w + 30f
    canvas.save()
    canvas.clipPath(cut)
    shade.shader = LinearGradient(
      m.x, m.y, m.x + nx * shadowW, m.y + ny * shadowW,
      Color.argb(70, 0, 0, 0), Color.TRANSPARENT, Shader.TileMode.CLAMP,
    )
    canvas.drawRect(0f, 0f, w, h, shade)
    canvas.restore()

    // 3. 折过来的纸背：把被折走的部分沿折线镜像
    val dx = -ny
    val dy = nx
    val r00 = 2 * dx * dx - 1
    val r01 = 2 * dx * dy
    val r11 = 2 * dy * dy - 1
    val tx = m.x - (r00 * m.x + r01 * m.y)
    val ty = m.y - (r01 * m.x + r11 * m.y)
    mirror.setValues(floatArrayOf(r00, r01, tx, r01, r11, ty, 0f, 0f, 1f))
    cut.transform(mirror, flap)
    canvas.save()
    canvas.clipRect(0f, 0f, w, h)
    canvas.clipPath(flap)
    if (page != null) {
      canvas.save()
      canvas.concat(mirror)
      canvas.drawBitmap(page, 0f, 0f, paint)
      canvas.restore()
    }
    // 纸背：大部分是纸色，隐约透出反过来的字
    canvas.drawColor(if (page != null) paperBack else paperColor)
    // 折痕处暗一点，越往外越亮
    shade.shader = LinearGradient(
      m.x, m.y, m.x - nx * shadowW * 1.6f, m.y - ny * shadowW * 1.6f,
      Color.argb(60, 0, 0, 0), Color.argb(0, 0, 0, 0), Shader.TileMode.CLAMP,
    )
    canvas.drawRect(0f, 0f, w, h, shade)
    canvas.restore()
  }
}
