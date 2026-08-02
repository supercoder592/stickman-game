class_name SkillDragon
extends Skill
##
## 🐉 龍之力 —— 【龍之怒·極限咆哮】（售價 3000 金幣，高階高代價）
##
## 機制：蓄力 1 秒（期間全霸體），隨後向前發射貫穿全螢幕的巨大龍形能量光束，
##       造成毀滅性多段傷害。
##
## 特效（純 GDScript）：
##   1. 光束與震屏：繪製巨大矩形光柱，中央純白、外圍多層半透明藍紫色光暈；
##      釋放時透過程式改變 Camera2D.offset = Vector2(randf_range(-5,5), randf_range(-5,5)) 震屏。
##   2. 能量聚集粒子：蓄力時 CPUParticles2D 的 emission_sphere_radius 設大、
##      radial_accel 設為負值，讓全屏粒子向心收縮吸入火柴人體內。
##

const CHARGE_TIME := 1.0
const BEAM_TIME := 0.55
const TICK_INTERVAL := 0.07
const TICK_DAMAGE := 16.0
const BEAM_HALF_HEIGHT := 58.0

var _phase := 0                 # 0 = 待機, 1 = 蓄力, 2 = 發射
var _t := 0.0
var _charge_fx = null          # ChargeOrb（內部類別，不加型別註記避免前向參照）
var _gather: CPUParticles2D
var _beam = null               # Beam（同上）
var _tick_t := 0.0
var _dir := 1.0


func _on_setup() -> void:
	id = "dragon"
	cd_max = 6.0
	color = Game.element_color(id)


func can_use() -> bool:
	return super() and _phase == 0


func _use() -> void:
	_phase = 1
	_t = 0.0
	_dir = signf(float(user.facing))
	user.set_pose("charge", CHARGE_TIME + 0.1)
	user.control_lock = CHARGE_TIME
	user.super_armor = CHARGE_TIME + BEAM_TIME + 0.2      # 全霸體
	user.velocity.x = 0.0

	# 向心收縮的能量聚集粒子（radial_accel 為負 → 吸入體內）
	_gather = Fx.particles(arena.fx_back, Vector2.ZERO, {
		"amount": 160, "lifetime": 0.75, "one_shot": false, "explosiveness": 0.0,
		"vmin": 0.0, "vmax": 30.0, "gravity": Vector2.ZERO,
		"radius": 460.0, "shape": CPUParticles2D.EMISSION_SHAPE_SPHERE,
		"radial_min": -900.0, "radial_max": -1500.0,
		"tangential_min": 60.0, "tangential_max": 220.0,
		"smin": 0.1, "smax": 0.5, "additive": true, "auto_free": false,
		"colors": [Color(0.5, 0.35, 1.0, 0.0), Color(0.65, 0.5, 1.0, 0.9), Color(1, 1, 1, 1)],
	})
	_gather.global_position = user.center()

	_charge_fx = ChargeOrb.new()
	_charge_fx.col = color
	arena.fx_front.add_child(_charge_fx)
	_charge_fx.global_position = user.center() + Vector2(_dir * 26.0, 0)

	start_cooldown()


func _tick(delta: float) -> void:
	match _phase:
		1:
			_t += delta
			if _gather and is_instance_valid(_gather):
				_gather.global_position = user.center()
			if _charge_fx and is_instance_valid(_charge_fx):
				_charge_fx.global_position = user.center() + Vector2(_dir * 26.0, 0)
				_charge_fx.charge = clampf(_t / CHARGE_TIME, 0.0, 1.0)
			shake(1.5 + _t * 4.0, 0.06)
			if _t >= CHARGE_TIME:
				_fire()
		2:
			_t += delta
			_tick_t += delta
			if _beam and is_instance_valid(_beam):
				_beam.global_position = user.center() + Vector2(_dir * 34.0, 0)
			if _tick_t >= TICK_INTERVAL:
				_tick_t = 0.0
				_damage_tick()
			shake(9.0, 0.1)
			if _t >= BEAM_TIME:
				_phase = 0
				user.control_lock = 0.15


func _fire() -> void:
	_phase = 2
	_t = 0.0
	_tick_t = 0.0
	user.set_pose("cast", BEAM_TIME + 0.15)
	user.control_lock = BEAM_TIME
	user.velocity.x = -_dir * 220.0                  # 巨大後座力

	if _gather and is_instance_valid(_gather):
		_gather.emitting = false
		Fx.autofree(_gather, 1.0)
		_gather = null
	if _charge_fx and is_instance_valid(_charge_fx):
		_charge_fx.burst()
		_charge_fx = null

	var length: float = arena.WORLD_RIGHT - arena.WORLD_LEFT
	_beam = Beam.new()
	_beam.dir = _dir
	_beam.length = length
	_beam.col = color
	_beam.life = BEAM_TIME
	_beam.half_height = BEAM_HALF_HEIGHT
	arena.fx_front.add_child(_beam)
	_beam.global_position = user.center() + Vector2(_dir * 34.0, 0)

	Fx.shockwave(arena.fx_front, user.center() + Vector2(_dir * 40.0, 0), 220.0,
		Color(0.75, 0.65, 1.0, 0.95), 0.4)
	Fx.speed_lines(arena.fx_back, user.center() + Vector2(_dir * 60.0, 0),
		Color(0.8, 0.72, 1.0), 300.0, 30, 0.45)
	shake(26.0, 0.5)
	_damage_tick()


func _damage_tick() -> void:
	var c := user.center()
	var x0: float = c.x
	var x1: float = c.x + _dir * (arena.WORLD_RIGHT - arena.WORLD_LEFT)
	var left: float = minf(x0, x1)
	var right: float = maxf(x0, x1)
	var band := Rect2(Vector2(left, c.y - BEAM_HALF_HEIGHT), Vector2(right - left, BEAM_HALF_HEIGHT * 2.0))
	for e in enemies_in_rect(band):
		e.take_damage(TICK_DAMAGE, Vector2(_dir * 260.0, -110.0), {
			"color": color, "ignore_armor": true,
		})


func _dispose() -> void:
	if _gather and is_instance_valid(_gather):
		_gather.queue_free()
	if _charge_fx and is_instance_valid(_charge_fx):
		_charge_fx.queue_free()
	if _beam and is_instance_valid(_beam):
		_beam.queue_free()


# ================================================================== 特效節點

## 蓄力光球
class ChargeOrb extends Node2D:
	var col := Color(0.6, 0.45, 1.0)
	var charge := 0.0
	var t := 0.0
	var _rings: Array[float] = []

	func _ready() -> void:
		z_index = 25
		var mat := CanvasItemMaterial.new()
		mat.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
		material = mat
		for i in 4:
			_rings.append(randf() * TAU)

	func _process(delta: float) -> void:
		t += delta
		queue_redraw()

	func burst() -> void:
		Fx.particles(get_parent(), position, {
			"amount": 50, "lifetime": 0.5, "vmin": 250.0, "vmax": 700.0, "spread": 180.0,
			"direction": Vector2(1, 0), "gravity": Vector2.ZERO,
			"smin": 0.15, "smax": 0.6, "additive": true,
			"colors": [Color(1, 1, 1, 1), Color(0.6, 0.45, 1.0, 0.6), Color(0.3, 0.15, 0.7, 0)],
		})
		queue_free()

	func _draw() -> void:
		var r: float = 8.0 + charge * 42.0
		var flicker := 1.0 + sin(t * 40.0) * 0.06
		draw_circle(Vector2.ZERO, r * 1.9 * flicker, Color(col.r, col.g, col.b, 0.16 * charge))
		draw_circle(Vector2.ZERO, r * 1.3 * flicker, Color(col.r, col.g, col.b, 0.3 * charge))
		draw_circle(Vector2.ZERO, r * flicker, Color(0.85, 0.8, 1.0, 0.8 * charge))
		draw_circle(Vector2.ZERO, r * 0.5, Color(1, 1, 1, charge))
		# 收縮中的能量環
		for i in _rings.size():
			var k: float = fposmod(t * 1.5 + float(i) * 0.25, 1.0)
			var rr: float = lerpf(150.0, r, k)
			draw_arc(Vector2.ZERO, rr, _rings[i] + t * 2.0, _rings[i] + t * 2.0 + PI * 1.4, 26,
				Color(0.7, 0.6, 1.0, (1.0 - k) * 0.5 * charge), 2.5, true)


## 龍形能量光束：純白核心 + 多層藍紫光暈 + 龍首與能量鱗片
class Beam extends Node2D:
	var dir := 1.0
	var length := 1600.0
	var col := Color(0.6, 0.45, 1.0)
	var life := 0.55
	var half_height := 58.0
	var t := 0.0

	func _ready() -> void:
		z_index = 26
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
		# 開頭快速張開、結尾收束
		var open: float = clampf(t / 0.08, 0.0, 1.0)
		var close: float = clampf((1.0 - k) / 0.35, 0.0, 1.0)
		var h: float = half_height * open * close
		if h < 0.5:
			return                    # 厚度趨近 0 時多邊形退化，直接跳過這一幀
		var L := length * dir

		# 多層光暈（外 → 內）
		var layers := [
			[1.55, Color(0.35, 0.2, 0.85, 0.22)],
			[1.15, Color(0.5, 0.35, 1.0, 0.34)],
			[0.78, Color(0.72, 0.6, 1.0, 0.55)],
			[0.42, Color(0.92, 0.88, 1.0, 0.85)],
			[0.16, Color(1.0, 1.0, 1.0, 1.0)],
		]
		for layer in layers:
			var m: float = layer[0]
			var c: Color = layer[1]
			# 邊緣加上正弦起伏，模擬能量流動
			var top := PackedVector2Array()
			var bot := PackedVector2Array()
			var n := 44
			for i in range(n + 1):
				var u := float(i) / float(n)
				var x := L * u
				var wob := sin(u * 26.0 - t * 30.0) * h * m * 0.12
				var taper := 0.55 + 0.45 * sin(minf(u * 6.0, PI * 0.5))
				top.append(Vector2(x, -h * m * taper + wob))
				bot.append(Vector2(x, h * m * taper + wob))
			var poly := PackedVector2Array()
			poly.append_array(top)
			for i in range(bot.size() - 1, -1, -1):
				poly.append(bot[i])
			draw_colored_polygon(poly, c)

		# 盤繞光束的雙股龍形螺旋（烈空坐的纏繞能量）
		for helix in 2:
			var pts := PackedVector2Array()
			var widths := PackedFloat32Array()
			var n2 := 60
			var phase := PI * float(helix) + t * 26.0
			for i in range(n2 + 1):
				var u := float(i) / float(n2)
				var ang := u * 13.0 + phase
				var amp := h * 1.35 * (0.35 + 0.65 * sin(minf(u * 5.0, PI * 0.5)))
				pts.append(Vector2(L * u, sin(ang) * amp))
				widths.append(lerpf(9.0, 2.0, u) * close)
			Fx.draw_poly(self, Fx.ribbon(pts, widths), Color(0.85, 0.78, 1.0, 0.55 * close))

		# 龍首（發射口）
		_draw_dragon_head(h)

		# 沿光束奔流的能量鱗片
		for i in 16:
			var u2: float = fposmod(float(i) / 16.0 + t * 1.8, 1.0)
			var x2 := L * u2
			var sy := sin(u2 * 20.0 - t * 24.0) * h * 0.55
			var s: float = 10.0 + sin(float(i) * 2.1) * 5.0
			draw_colored_polygon(Fx.star(Vector2(x2, sy), 4, s, s * 0.25, t * 6.0),
				Color(1, 1, 1, 0.5 * close))

	func _draw_dragon_head(h: float) -> void:
		var d := dir
		var s := h / half_height
		if s <= 0.01:
			return
		var jaw := 18.0 + sin(t * 26.0) * 7.0
		var head := PackedVector2Array([
			Vector2(70 * d, -10) * s, Vector2(40 * d, -46) * s, Vector2(-10 * d, -52) * s,
			Vector2(-42 * d, -26) * s, Vector2(-42 * d, 26) * s, Vector2(-10 * d, 52) * s,
			Vector2(40 * d, 46) * s, Vector2(74 * d, 12) * s,
		])
		draw_colored_polygon(head, Color(0.55, 0.4, 1.0, 0.75))
		draw_polyline(head + PackedVector2Array([head[0]]), Color(0.95, 0.9, 1.0, 0.9), 2.5, true)
		var upper := PackedVector2Array([
			Vector2(66 * d, -12) * s, Vector2(128 * d, (-20 - jaw * 0.6)) * s, Vector2(64 * d, 0) * s,
		])
		var lower := PackedVector2Array([
			Vector2(66 * d, 12) * s, Vector2(122 * d, (24 + jaw)) * s, Vector2(64 * d, 2) * s,
		])
		draw_colored_polygon(upper, Color(0.72, 0.6, 1.0, 0.8))
		draw_colored_polygon(lower, Color(0.72, 0.6, 1.0, 0.8))
		for i in 3:
			var bx := -14.0 - float(i) * 14.0
			draw_colored_polygon(PackedVector2Array([
				Vector2(bx * d, -44) * s,
				Vector2((bx - 10) * d, (-78 - sin(t * 14.0 + float(i)) * 8.0)) * s,
				Vector2((bx - 22) * d, -40) * s,
			]), Color(0.8, 0.7, 1.0, 0.6))
		draw_circle(Vector2(30 * d, -22) * s, 8.0 * s, Color(1, 1, 1, 0.95))
		draw_circle(Vector2(33 * d, -22) * s, 3.6 * s, Color(0.25, 0.1, 0.5, 0.95))
