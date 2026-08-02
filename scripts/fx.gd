class_name Fx
extends RefCounted
##
## 純 GDScript 特效工具箱。
## 這裡集中所有「用程式生成」的貼圖、粒子與幾何形狀，讓 9 種元素招式共用。
## 專案中沒有任何 png / 圖片資源，粒子貼圖全部由 Image 逐像素產生。
##

static var _tex_dot: ImageTexture
static var _tex_square: ImageTexture
static var _tex_shard: ImageTexture


# ------------------------------------------------------------------ 程式生成貼圖
## 柔邊圓點（火焰、能量、水花通用）
static func tex_dot() -> Texture2D:
	if _tex_dot == null:
		var size := 24
		var img := Image.create(size, size, false, Image.FORMAT_RGBA8)
		var c := (size - 1) * 0.5
		for y in size:
			for x in size:
				var d := Vector2(x - c, y - c).length() / c
				var a: float = clampf(1.0 - d, 0.0, 1.0)
				img.set_pixel(x, y, Color(1, 1, 1, a * a))
		_tex_dot = ImageTexture.create_from_image(img)
	return _tex_dot


## 硬邊方塊（冰屑、金屬碎片）
static func tex_square() -> Texture2D:
	if _tex_square == null:
		var img := Image.create(6, 6, false, Image.FORMAT_RGBA8)
		img.fill(Color(1, 1, 1, 1))
		_tex_square = ImageTexture.create_from_image(img)
	return _tex_square


## 細長條（風刃氣流、劍氣）
static func tex_shard() -> Texture2D:
	if _tex_shard == null:
		var w := 24
		var h := 4
		var img := Image.create(w, h, false, Image.FORMAT_RGBA8)
		for y in h:
			for x in w:
				var fx := absf(x - (w - 1) * 0.5) / ((w - 1) * 0.5)
				var fy := absf(y - (h - 1) * 0.5) / ((h - 1) * 0.5)
				img.set_pixel(x, y, Color(1, 1, 1, clampf((1.0 - fx) * (1.0 - fy * 0.6), 0.0, 1.0)))
		_tex_shard = ImageTexture.create_from_image(img)
	return _tex_shard


# ------------------------------------------------------------------ 漸層
## 以顏色陣列建立等距 Gradient（給 CPUParticles2D 的 color_ramp 用）
static func ramp(colors: Array) -> Gradient:
	var g := Gradient.new()
	if colors.size() < 2:
		return g
	g.set_offset(0, 0.0)
	g.set_color(0, colors[0])
	g.set_offset(1, 1.0)
	g.set_color(1, colors[colors.size() - 1])
	for i in range(1, colors.size() - 1):
		g.add_point(float(i) / float(colors.size() - 1), colors[i])
	return g


# ------------------------------------------------------------------ 粒子
## 建立一組 CPUParticles2D。cfg 為選填字典，未指定者使用預設值。
static func particles(parent: Node, pos: Vector2, cfg: Dictionary = {}) -> CPUParticles2D:
	var p := CPUParticles2D.new()
	p.position = pos
	p.amount = int(cfg.get("amount", 24))
	p.lifetime = float(cfg.get("lifetime", 0.6))
	p.one_shot = bool(cfg.get("one_shot", true))
	p.explosiveness = float(cfg.get("explosiveness", 0.9))
	p.randomness = float(cfg.get("randomness", 0.5))
	p.lifetime_randomness = float(cfg.get("life_random", 0.3))
	p.direction = cfg.get("direction", Vector2(0, -1))
	p.spread = float(cfg.get("spread", 45.0))
	p.initial_velocity_min = float(cfg.get("vmin", 40.0))
	p.initial_velocity_max = float(cfg.get("vmax", 160.0))
	p.gravity = cfg.get("gravity", Vector2(0, 420))
	p.scale_amount_min = float(cfg.get("smin", 0.25))
	p.scale_amount_max = float(cfg.get("smax", 0.7))
	p.damping_min = float(cfg.get("damp_min", 0.0))
	p.damping_max = float(cfg.get("damp_max", 0.0))
	p.radial_accel_min = float(cfg.get("radial_min", 0.0))
	p.radial_accel_max = float(cfg.get("radial_max", 0.0))
	p.tangential_accel_min = float(cfg.get("tangential_min", 0.0))
	p.tangential_accel_max = float(cfg.get("tangential_max", 0.0))
	p.angular_velocity_min = float(cfg.get("spin_min", 0.0))
	p.angular_velocity_max = float(cfg.get("spin_max", 0.0))
	p.texture = cfg.get("texture", tex_dot())
	p.emission_shape = int(cfg.get("shape", CPUParticles2D.EMISSION_SHAPE_POINT))
	p.emission_sphere_radius = float(cfg.get("radius", 8.0))
	if cfg.has("rect_extents"):
		p.emission_shape = CPUParticles2D.EMISSION_SHAPE_RECTANGLE
		p.emission_rect_extents = cfg["rect_extents"]
	if cfg.has("ramp"):
		p.color_ramp = cfg["ramp"]
	elif cfg.has("colors"):
		p.color_ramp = ramp(cfg["colors"])
	if bool(cfg.get("additive", false)):
		var mat := CanvasItemMaterial.new()
		mat.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
		p.material = mat
	p.emitting = true
	parent.add_child(p)
	if p.one_shot and bool(cfg.get("auto_free", true)):
		autofree(p, p.lifetime * (1.0 + p.lifetime_randomness) + 0.3)
	return p


## 在指定秒數後自動 queue_free 一個節點（純程式，不需要場景中的 Timer）。
static func autofree(node: Node, delay: float) -> void:
	var t := Timer.new()
	t.one_shot = true
	t.wait_time = maxf(0.05, delay)
	node.add_child(t)
	t.timeout.connect(node.queue_free)
	t.start()


# ------------------------------------------------------------------ 幾何工具
## 產生鋸齒狀折線（閃電、地表裂縫）
static func jagged(a: Vector2, b: Vector2, segments: int, amplitude: float, rng: RandomNumberGenerator = null) -> PackedVector2Array:
	var pts := PackedVector2Array()
	var normal := (b - a).normalized().orthogonal()
	for i in range(segments + 1):
		var t := float(i) / float(segments)
		var base := a.lerp(b, t)
		var edge := sin(t * PI)  # 頭尾收斂到端點
		var off := 0.0
		if i > 0 and i < segments:
			off = (rng.randf_range(-1.0, 1.0) if rng else randf_range(-1.0, 1.0)) * amplitude * edge
		pts.append(base + normal * off)
	return pts


## 橢圓輪廓頂點（Godot 沒有 draw_ellipse，用多邊形代替）
static func ellipse(center: Vector2, rx: float, ry: float, segments: int = 32) -> PackedVector2Array:
	var pts := PackedVector2Array()
	for i in segments:
		var a := TAU * float(i) / float(segments)
		pts.append(center + Vector2(cos(a) * rx, sin(a) * ry))
	return pts


## 把一條中心線加上「粗細變化」後，膨脹成封閉多邊形（水龍軀幹、光束外框）
static func ribbon(center_line: PackedVector2Array, widths: PackedFloat32Array) -> PackedVector2Array:
	var n := center_line.size()
	if n < 2:
		return PackedVector2Array()
	var left := PackedVector2Array()
	var right := PackedVector2Array()
	for i in n:
		var fwd: Vector2
		if i == 0:
			fwd = center_line[1] - center_line[0]
		elif i == n - 1:
			fwd = center_line[n - 1] - center_line[n - 2]
		else:
			fwd = center_line[i + 1] - center_line[i - 1]
		var nrm := fwd.normalized().orthogonal()
		var w: float = widths[i] if i < widths.size() else widths[widths.size() - 1]
		left.append(center_line[i] + nrm * w)
		right.append(center_line[i] - nrm * w)
	var poly := PackedVector2Array()
	poly.append_array(left)
	for i in range(n - 1, -1, -1):
		poly.append(right[i])
	return poly


## 沿圓弧生成的「新月刃」多邊形：兩端收尖、中段最厚（風刃、劍氣、勾拳軌跡）
static func crescent(center: Vector2, radius: float, a0: float, a1: float,
		peak_width: float, steps: int = 18) -> PackedVector2Array:
	var line := PackedVector2Array()
	var widths := PackedFloat32Array()
	for i in range(steps + 1):
		var u := float(i) / float(steps)
		var ang: float = lerpf(a0, a1, u)
		line.append(center + Vector2(cos(ang), sin(ang)) * radius)
		widths.append(peak_width * pow(sin(u * PI), 0.55))
	return ribbon(line, widths)


## 正多角星（冰晶、爆點閃光）
static func star(center: Vector2, points: int, outer: float, inner: float, rot: float = 0.0) -> PackedVector2Array:
	var pts := PackedVector2Array()
	for i in points * 2:
		var a := rot + PI * float(i) / float(points)
		var r: float = outer if i % 2 == 0 else inner
		pts.append(center + Vector2(cos(a), sin(a)) * r)
	return pts


# ------------------------------------------------------------------ 鬼滅風「呼吸法」筆觸
## 一道毛筆質感的新月斬擊：濃色描邊 + 主體 + 內側亮芯，並在筆鋒處加上飛白。
## 這是《鬼滅之刃》呼吸法最具識別度的視覺語言，全部招式共用。
static func brush_slash(ci: CanvasItem, center: Vector2, radius: float, a0: float, a1: float,
		width: float, col: Color, alpha := 1.0, ink := true) -> void:
	var body := crescent(center, radius, a0, a1, width)
	if body.size() < 3:
		return
	if ink:
		# 描邊：把刃身放大一圈畫深色，模擬濃墨輪廓
		var outline := crescent(center, radius, a0, a1, width * 1.28)
		draw_poly(ci, outline, Color(col.r * 0.25, col.g * 0.22, col.b * 0.3, alpha * 0.85))
	draw_poly(ci, body, Color(col.r, col.g, col.b, alpha))
	# 內側亮芯（偏白但保留主色調性）
	var core_col := col.lightened(0.55)
	draw_poly(ci, crescent(center, radius, a0 + 0.06, a1 - 0.06, width * 0.42),
		Color(core_col.r, core_col.g, core_col.b, alpha * 0.95))
	# 飛白：沿刃身外緣拉幾條細線，做出筆刷分岔
	var strands := 3
	for s in strands:
		var rr := radius + width * (0.45 + 0.22 * float(s))
		var pts := PackedVector2Array()
		for i in 13:
			var u := float(i) / 12.0
			var ang: float = lerpf(a0 + 0.1, a1 - 0.1, u)
			pts.append(center + Vector2(cos(ang), sin(ang)) * (rr + sin(u * 9.0 + float(s)) * 2.0))
		ci.draw_polyline(pts, Color(core_col.r, core_col.g, core_col.b, alpha * 0.3), 1.6, true)


static func draw_poly(ci: CanvasItem, poly: PackedVector2Array, col: Color) -> void:
	if poly.size() >= 3:
		ci.draw_colored_polygon(poly, col)


# ------------------------------------------------------------------ 通用一次性特效節點

## 漫畫集中線：命中瞬間由中心向外炸開的放射線條，強化打擊感（鬼滅／寶可夢常見演出）
class SpeedLines extends Node2D:
	var life := 0.26
	var t := 0.0
	var col := Color(1, 1, 1)
	var count := 18
	var r0 := 26.0
	var r1 := 140.0
	var _seed: Array[float] = []

	func _ready() -> void:
		var mat := CanvasItemMaterial.new()
		mat.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
		material = mat
		z_index = 23
		for i in count:
			_seed.append(randf())

	func _process(delta: float) -> void:
		t += delta
		if t >= life:
			queue_free()
			return
		queue_redraw()

	func _draw() -> void:
		var k: float = clampf(t / life, 0.0, 1.0)
		var a := (1.0 - k) * col.a
		for i in count:
			var ang := TAU * float(i) / float(count) + _seed[i] * 0.25
			var d := Vector2(cos(ang), sin(ang))
			var inner: float = lerpf(r0, r1 * 0.75, ease(k, 0.4)) * (0.7 + _seed[i] * 0.6)
			var outer: float = inner + lerpf(46.0, 10.0, k) * (0.5 + _seed[i])
			var w: float = lerpf(5.0, 1.0, k) * (0.6 + _seed[i] * 0.8)
			draw_line(d * inner, d * outer, Color(col.r, col.g, col.b, a), w, true)


## 浮世繪浪頭：捲曲的浪花螺旋（水系專用，也可當作風的渦流）
class Curl extends Node2D:
	var life := 0.55
	var t := 0.0
	var col := Color(0.8, 0.95, 1.0)
	var size := 34.0
	var spin := 1.0

	func _ready() -> void:
		var mat := CanvasItemMaterial.new()
		mat.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
		material = mat
		z_index = 20

	func _process(delta: float) -> void:
		t += delta
		if t >= life:
			queue_free()
			return
		queue_redraw()

	func _draw() -> void:
		var k: float = clampf(t / life, 0.0, 1.0)
		var a := (1.0 - k) * 0.9
		var s: float = size * (0.55 + k * 0.7)
		# 由外向內收束的阿基米德螺線，末端收尖 → 浪頭捲曲
		var pts := PackedVector2Array()
		var widths := PackedFloat32Array()
		var turns := 1.55
		var n := 30
		for i in range(n + 1):
			var u := float(i) / float(n)
			var ang := spin * (u * TAU * turns) + t * 2.0
			var r: float = s * (1.0 - u * 0.86)
			pts.append(Vector2(cos(ang), sin(ang)) * r)
			widths.append(lerpf(s * 0.26, 0.8, u))
		Fx.draw_poly(self, Fx.ribbon(pts, widths), Color(col.r, col.g, col.b, a))
		Fx.draw_poly(self, Fx.ribbon(pts, _scaled(widths, 0.4)),
			Color(1, 1, 1, a * 0.75))

	func _scaled(src: PackedFloat32Array, f: float) -> PackedFloat32Array:
		var out := PackedFloat32Array()
		for v in src:
			out.append(v * f)
		return out

## 擴散衝擊波環（火焰熱浪、爆炸）
class Shockwave extends Node2D:
	var life := 0.35
	var t := 0.0
	var r0 := 10.0
	var r1 := 120.0
	var thickness := 8.0
	var col := Color(1, 0.8, 0.3)
	var squash := 1.0  # <1 = 壓扁成橢圓（貼地衝擊波）

	func _ready() -> void:
		var mat := CanvasItemMaterial.new()
		mat.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
		material = mat

	func _process(delta: float) -> void:
		t += delta
		if t >= life:
			queue_free()
			return
		queue_redraw()

	func _draw() -> void:
		var k: float = clampf(t / life, 0.0, 1.0)
		var r: float = lerpf(r0, r1, ease(k, 0.35))
		var a: float = (1.0 - k) * col.a
		draw_set_transform(Vector2.ZERO, 0.0, Vector2(1.0, squash))
		draw_arc(Vector2.ZERO, r, 0, TAU, 48, Color(col.r, col.g, col.b, a), thickness * (1.0 - k * 0.6), true)
		# 內圈用主色提亮，而非純白；純白在 ADD 混色下會把整個特效洗成銀色
		var inner_col := col.lightened(0.45)
		draw_arc(Vector2.ZERO, r * 0.72, 0, TAU, 40, Color(inner_col.r, inner_col.g, inner_col.b, a * 0.4),
			thickness * 0.35, true)
		draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


## 命中閃光（打擊感）
class HitSpark extends Node2D:
	var life := 0.18
	var t := 0.0
	var size := 26.0
	var col := Color(1, 1, 1)

	func _ready() -> void:
		var mat := CanvasItemMaterial.new()
		mat.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
		material = mat
		rotation = randf() * TAU

	func _process(delta: float) -> void:
		t += delta
		if t >= life:
			queue_free()
			return
		queue_redraw()

	func _draw() -> void:
		var k := t / life
		var s: float = size * (0.6 + k * 0.9)
		var a := 1.0 - k
		# 四角星（在此就地展開，避免內部類別回頭參照自己所在檔案的 class_name）
		var pts := PackedVector2Array()
		for i in 8:
			var ang := PI * float(i) / 4.0
			var r: float = s if i % 2 == 0 else s * 0.18
			pts.append(Vector2(cos(ang), sin(ang)) * r)
		draw_colored_polygon(pts, Color(col.r, col.g, col.b, a))
		draw_circle(Vector2.ZERO, s * 0.22, Color(1, 1, 1, a))


## 飄浮傷害數字
class DamageText extends Node2D:
	var life := 0.7
	var t := 0.0
	var text := "0"
	var col := Color(1, 1, 1)
	var vel := Vector2(0, -60)

	func _process(delta: float) -> void:
		t += delta
		position += vel * delta
		vel.y += 90.0 * delta
		if t >= life:
			queue_free()
			return
		queue_redraw()

	func _draw() -> void:
		var f: Font = Game.ui_font
		if f == null:
			return
		var a: float = clampf(1.0 - (t / life) * 1.4, 0.0, 1.0)
		var sz := 18
		var w := f.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, sz).x
		draw_string(f, Vector2(-w * 0.5 + 1, 1), text, HORIZONTAL_ALIGNMENT_LEFT, -1, sz, Color(0, 0, 0, a * 0.6))
		draw_string(f, Vector2(-w * 0.5, 0), text, HORIZONTAL_ALIGNMENT_LEFT, -1, sz, Color(col.r, col.g, col.b, a))


# ------------------------------------------------------------------ 氣場爆發
## 取材自概念圖：能量從腳下地面炸開向上竄升，外圍浮現巨獸虛影包覆角色。
## 大招起手時播放，色調由元素決定。
class AuraBurst extends Node2D:
	var col := Color(0.4, 0.8, 1.0)
	var life := 0.85
	var t := 0.0
	var height := 250.0
	var follow: Node2D
	var beast := true              # 是否浮現巨獸頭部虛影
	var _tongues: Array = []       # [水平位置, 高度倍率, 相位, 寬度]
	var _debris: Array = []        # [位置, 速度, 旋轉]

	func _ready() -> void:
		z_index = 14
		var mat := CanvasItemMaterial.new()
		mat.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
		material = mat
		for i in 16:
			_tongues.append([
				randf_range(-70.0, 70.0),
				randf_range(0.45, 1.0),
				randf_range(0.0, TAU),
				randf_range(9.0, 26.0),
			])
		for i in 14:
			_debris.append([
				Vector2(randf_range(-80.0, 80.0), 0.0),
				Vector2(randf_range(-160.0, 160.0), randf_range(-420.0, -160.0)),
				randf_range(-6.0, 6.0),
			])

	func _process(delta: float) -> void:
		t += delta
		if follow and is_instance_valid(follow):
			global_position = follow.global_position
		for d in _debris:
			d[1].y += 1100.0 * delta
			d[0] += d[1] * delta
		if t >= life:
			queue_free()
			return
		queue_redraw()

	func _draw() -> void:
		var k: float = clampf(t / life, 0.0, 1.0)
		var rise: float = ease(clampf(t / 0.3, 0.0, 1.0), 0.4)
		var fade: float = clampf((1.0 - k) / 0.45, 0.0, 1.0)
		var a := fade

		# 地面裂開的暗色破片
		for d in _debris:
			var p: Vector2 = d[0]
			if p.y > 4.0:
				continue
			var s := 5.0 + absf(d[2])
			draw_colored_polygon(PackedVector2Array([
				p + Vector2(-s, 0).rotated(d[2] * t),
				p + Vector2(s * 0.6, -s * 0.8).rotated(d[2] * t),
				p + Vector2(s * 0.4, s * 0.5).rotated(d[2] * t),
			]), Color(0.1, 0.1, 0.14, a * 0.85))

		# 貼地的爆發環
		draw_set_transform(Vector2.ZERO, 0.0, Vector2(1.0, 0.3))
		draw_arc(Vector2.ZERO, 130.0 * rise, 0, TAU, 44,
			Color(col.r, col.g, col.b, a * 0.7), 5.0, true)
		draw_circle(Vector2.ZERO, 105.0 * rise, Color(col.r, col.g, col.b, a * 0.13))
		draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)

		# 由地面竄升的能量火舌（概念圖的核心元素）
		for tg in _tongues:
			var x: float = tg[0]
			var h: float = height * tg[1] * rise
			# 高度太小時中心線幾乎退化成一個點，ribbon 會自我相交 → 直接跳過這一幀
			if h < 30.0:
				continue
			var ph: float = tg[2]
			var w: float = minf(tg[3], h * 0.16)
			var pts := PackedVector2Array()
			var widths := PackedFloat32Array()
			var n := 10
			for i in range(n + 1):
				var u := float(i) / float(n)
				# 擺幅必須明顯小於相鄰取樣點的垂直間距，否則帶狀多邊形會自我交叉
				var wob := sin(ph + u * 5.0 - t * 11.0) * minf(4.0 + u * 12.0, h / float(n) * 0.7)
				pts.append(Vector2(x + wob, -h * u))
				widths.append(w * (1.0 - u) * (1.0 - u) + 1.0)
			Fx.draw_poly(self, Fx.ribbon(pts, widths), Color(col.r, col.g, col.b, a * 0.4))
			var inner := PackedFloat32Array()
			for wv in widths:
				inner.append(wv * 0.4)
			# 內芯保留元素色調，避免 ADD 疊加後整片爆白
			var core := col.lightened(0.3)
			Fx.draw_poly(self, Fx.ribbon(pts, inner), Color(core.r, core.g, core.b, a * 0.5))

		if beast:
			_draw_beast(rise, a)

	## 背後浮現的巨獸頭部虛影
	func _draw_beast(rise: float, a: float) -> void:
		var s := 1.9 * rise
		var y := -height * 0.72
		var breathe := sin(t * 5.0) * 6.0
		var head := PackedVector2Array([
			Vector2(56, -6) * s, Vector2(34, -40) * s, Vector2(-8, -46) * s,
			Vector2(-40, -22) * s, Vector2(-40, 22) * s, Vector2(-8, 46) * s,
			Vector2(34, 40) * s, Vector2(60, 10) * s,
		])
		var off := Vector2(0, y + breathe)
		var moved := PackedVector2Array()
		for p in head:
			moved.append(p + off)
		Fx.draw_poly(self, moved, Color(col.r, col.g, col.b, a * 0.16))
		var edge := col.lightened(0.4)
		draw_polyline(moved + PackedVector2Array([moved[0]]),
			Color(edge.r, edge.g, edge.b, a * 0.9), 3.4, true)
		# 上下顎
		var jaw := 16.0 + sin(t * 9.0) * 8.0
		Fx.draw_poly(self, PackedVector2Array([
			Vector2(54, -8) * s + off, Vector2(112, -18 - jaw * 0.6) * s + off,
			Vector2(52, 2) * s + off,
		]), Color(col.r, col.g, col.b, a * 0.45))
		Fx.draw_poly(self, PackedVector2Array([
			Vector2(54, 10) * s + off, Vector2(106, 22 + jaw) * s + off,
			Vector2(52, 2) * s + off,
		]), Color(col.r, col.g, col.b, a * 0.45))
		# 犄角與眼
		for i in 3:
			var bx := -12.0 - float(i) * 13.0
			Fx.draw_poly(self, PackedVector2Array([
				Vector2(bx, -40) * s + off,
				Vector2(bx - 9, -72 - sin(t * 12.0 + float(i)) * 7.0) * s + off,
				Vector2(bx - 20, -36) * s + off,
			]), Color(col.r, col.g, col.b, a * 0.4))
		draw_circle(Vector2(26, -20) * s + off, 7.0 * s, Color(1, 1, 1, a * 0.9))


static func aura_burst(parent: Node, follow: Node2D, col: Color,
		height := 250.0, life := 0.85, beast := true) -> void:
	var b := AuraBurst.new()
	b.col = col
	b.follow = follow
	b.height = height
	b.life = life
	b.beast = beast
	parent.add_child(b)
	if follow and is_instance_valid(follow):
		b.global_position = follow.global_position


# ------------------------------------------------------------------ 便利函式
static func shockwave(parent: Node, pos: Vector2, r1: float, col: Color, life := 0.35, squash := 1.0) -> void:
	var s := Shockwave.new()
	s.position = pos
	s.r1 = r1
	s.col = col
	s.life = life
	s.squash = squash
	parent.add_child(s)


## 重擊白閃：命中瞬間的十字強光 + 快速外擴環，配合頓幀使用
class ImpactFlash extends Node2D:
	var col := Color.WHITE
	var power := 1.0
	var life := 0.22
	var t := 0.0

	func _ready() -> void:
		var mat := CanvasItemMaterial.new()
		mat.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
		material = mat
		z_index = 30
		rotation = randf_range(-0.25, 0.25)

	func _process(delta: float) -> void:
		t += delta
		if t >= life:
			queue_free()
			return
		queue_redraw()

	func _draw() -> void:
		var k: float = clampf(t / life, 0.0, 1.0)
		var a := (1.0 - k) * (1.0 - k)
		var s: float = (60.0 + 90.0 * power) * (0.5 + k * 1.1)
		# 十字強光
		draw_line(Vector2(-s, 0), Vector2(s, 0), Color(1, 1, 1, a * 0.9), 6.0 * (1.0 - k), true)
		draw_line(Vector2(0, -s * 0.45), Vector2(0, s * 0.45),
			Color(1, 1, 1, a * 0.7), 4.0 * (1.0 - k), true)
		# 元素色外擴環
		draw_arc(Vector2.ZERO, s * 0.55, 0, TAU, 32,
			Color(col.r, col.g, col.b, a * 0.75), 5.0 * (1.0 - k), true)
		draw_circle(Vector2.ZERO, 14.0 * (1.0 - k) * power, Color(1, 1, 1, a))


static func impact_flash(parent: Node, pos: Vector2, col: Color, damage: float) -> void:
	var f := ImpactFlash.new()
	f.position = pos
	f.col = col
	f.power = clampf(damage / 30.0, 0.6, 2.2)
	parent.add_child(f)


static func spark(parent: Node, pos: Vector2, col: Color, size := 26.0) -> void:
	var s := HitSpark.new()
	s.position = pos
	s.col = col
	s.size = size
	parent.add_child(s)


static func speed_lines(parent: Node, pos: Vector2, col: Color, r1 := 140.0, count := 18, life := 0.26) -> void:
	var s := SpeedLines.new()
	s.position = pos
	s.col = col
	s.r1 = r1
	s.count = count
	s.life = life
	parent.add_child(s)


static func curl(parent: Node, pos: Vector2, col: Color, size := 34.0, spin := 1.0, life := 0.55) -> void:
	var c := Curl.new()
	c.position = pos
	c.col = col
	c.size = size
	c.spin = spin
	c.life = life
	parent.add_child(c)


static func damage_text(parent: Node, pos: Vector2, amount: float, col: Color) -> void:
	var d := DamageText.new()
	d.position = pos + Vector2(randf_range(-8, 8), 0)
	d.text = str(int(round(amount)))
	d.col = col
	d.vel = Vector2(randf_range(-30, 30), -70)
	parent.add_child(d)
