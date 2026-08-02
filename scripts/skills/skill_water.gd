class_name SkillWater
extends Skill
##
## 💧 水流 —— 【水龍·咆哮】
##
## 機制：向前召喚巨大藍色水龍咆哮推進，把沿途所有敵人強行推向螢幕邊緣，
##       並打斷敵方正在施放的招式。
##
## 特效（純 GDScript）：
##   1. 動態水龍頭部：draw_colored_polygon() 畫出幾何頭部；
##      軀幹用多條正弦波（sin(time)）構成的曲線 + Fx.ribbon() 膨脹成滾動水流。
##   2. 水花飛濺：龍頭掛 CPUParticles2D，emission_shape 為球形，
##      噴射 Color(0.2, 0.6, 1.0, 0.8) 的水藍色小圓滴。
##

const SPEED := 700.0
const LIFE := 1.15
const DAMAGE := 7.0
const HIT_INTERVAL := 0.22


func _on_setup() -> void:
	id = "water"
	cd_max = 2.0
	color = Game.element_color(id)


func _use() -> void:
	user.set_pose("cast", 0.5)
	user.control_lock = 0.22
	user.velocity.x = -signf(float(user.facing)) * 120.0   # 後座力

	var d := Dragon.new()
	d.global_position = user.global_position + Vector2(signf(float(user.facing)) * 40.0, -46.0)
	d.dir = signf(float(user.facing))
	d.skill = self
	d.col = color
	d.life = LIFE
	d.speed = SPEED
	arena.fx_front.add_child(d)

	Fx.shockwave(arena.fx_back, d.global_position, 110.0, Color(0.5, 0.85, 1.0, 0.8), 0.3)
	# 水之呼吸：出招瞬間的浪頭捲曲與集中線
	Fx.curl(arena.fx_front, d.global_position + Vector2(-d.dir * 30.0, -18.0),
		Color(0.75, 0.92, 1.0), 46.0, d.dir, 0.5)
	Fx.speed_lines(arena.fx_back, d.global_position, Color(0.55, 0.85, 1.0), 150.0, 16, 0.3)
	start_cooldown()
	shake(5.0, 0.3)


## 由 Dragon 呼叫：推擠 + 打斷
func apply_push(head: Vector2, dir: float, hit_log: Dictionary) -> void:
	# 龍身是一條沿行進方向的帶狀範圍
	var band_x: float = 150.0 if dir > 0.0 else 0.0
	var band := Rect2(head - Vector2(band_x, 46.0), Vector2(150.0, 92.0))
	for e in enemies():
		# enemies() 回傳未定型的 Array，元素是 Variant，因此不能用 := 推導
		var r: Rect2 = e.body_rect().grow(10.0)
		if not r.intersects(band):
			continue
		# 推擠：直接覆寫速度，強制推向前方
		e.velocity.x = dir * 620.0
		if e.is_on_floor():
			e.velocity.y = -180.0
		e.interrupt()                       # 打斷敵方招式
		e.stun_time = maxf(e.stun_time, 0.12)

		var key: int = e.get_instance_id()
		var last: float = hit_log.get(key, -99.0)
		var now := float(Time.get_ticks_msec()) * 0.001
		if now - last >= HIT_INTERVAL:
			hit_log[key] = now
			e.take_damage(DAMAGE, Vector2.ZERO, {"color": color, "silent": false})


# ================================================================== 特效節點

## 水龍：頭部幾何多邊形 + 正弦波軀幹 + 水花粒子
class Dragon extends Node2D:
	var dir := 1.0
	var col := Color(0.25, 0.65, 1.0)
	var skill = null            # 施放者的 SkillWater（不加型別註記以避免自我參照）
	var t := 0.0
	var life := 1.15
	var speed := 700.0
	var _hit_log := {}
	var _spray: CPUParticles2D
	var _curl_t := 0.0

	func _ready() -> void:
		z_index = 18
		# 水花：球形發射區的水藍色小圓滴
		_spray = Fx.particles(self, Vector2.ZERO, {
			"amount": 70, "lifetime": 0.55, "one_shot": false, "explosiveness": 0.0,
			"direction": Vector2(-dir, -0.4).normalized(), "spread": 70.0,
			"vmin": 60.0, "vmax": 260.0, "gravity": Vector2(0, 700),
			"smin": 0.12, "smax": 0.42, "radius": 30.0,
			"shape": CPUParticles2D.EMISSION_SHAPE_SPHERE, "auto_free": false,
			"colors": [Color(0.85, 0.95, 1.0, 0.9), Color(0.2, 0.6, 1.0, 0.8), Color(0.15, 0.4, 0.9, 0.0)],
		})

	func _process(delta: float) -> void:
		t += delta
		if t >= life:
			_spray.emitting = false
			Fx.autofree(self, 0.7)
			set_process(false)
			return

		position.x += dir * speed * delta
		position.y += sin(t * 9.0) * 42.0 * delta

		# 浮世繪浪頭：沿著龍身不斷捲起白色浪花螺旋
		_curl_t += delta
		if _curl_t >= 0.075:
			_curl_t = 0.0
			var back := randf_range(30.0, 300.0)
			var pos := global_position + Vector2(-dir * back, sin(t * 11.0 - back * 0.026) * 20.0 - 22.0)
			Fx.curl(get_parent(), pos, Color(0.85, 0.95, 1.0), randf_range(16.0, 34.0),
				dir * (1.0 if randf() < 0.5 else -1.0), 0.45)

		if skill and is_instance_valid(skill):
			skill.apply_push(global_position, dir, _hit_log)

		queue_redraw()

	func _body_line() -> PackedVector2Array:
		# 軀幹中心線：往後延伸並疊加正弦擺動
		var pts := PackedVector2Array()
		for i in 22:
			var back := float(i) * 21.0
			var wobble := sin(t * 11.0 - float(i) * 0.55) * (12.0 + float(i) * 1.6)
			pts.append(Vector2(-dir * back, wobble))
		return pts

	func _draw() -> void:
		var fade: float = clampf(1.0 - t / life, 0.0, 1.0)
		var alpha: float = clampf(minf(t * 6.0, 1.0), 0.0, 1.0) * (0.35 + fade * 0.65)

		var line := _body_line()
		var widths := PackedFloat32Array()
		for i in line.size():
			widths.append(lerpf(30.0, 3.0, float(i) / float(line.size() - 1)))

		# 外層水體
		draw_colored_polygon(Fx.ribbon(line, widths), Color(0.16, 0.5, 0.95, alpha * 0.75))
		# 內層亮芯
		var inner := PackedFloat32Array()
		for w in widths:
			inner.append(w * 0.5)
		draw_colored_polygon(Fx.ribbon(line, inner), Color(0.6, 0.88, 1.0, alpha * 0.7))
		# 表面高光細線
		var hi := PackedVector2Array()
		for i in line.size():
			hi.append(line[i] + Vector2(0, -widths[i] * 0.55))
		draw_polyline(hi, Color(1, 1, 1, alpha * 0.5), 2.0, true)

		_draw_head(alpha)

	func _draw_head(alpha: float) -> void:
		var d := dir
		var jaw := sin(t * 16.0) * 6.0 + 8.0
		# 頭部主體（幾何多邊形）
		var head := PackedVector2Array([
			Vector2(48.0 * d, -6.0),
			Vector2(30.0 * d, -30.0),
			Vector2(-4.0 * d, -34.0),
			Vector2(-26.0 * d, -18.0),
			Vector2(-26.0 * d, 18.0),
			Vector2(-4.0 * d, 34.0),
			Vector2(30.0 * d, 30.0),
			Vector2(52.0 * d, 8.0),
		])
		draw_colored_polygon(head, Color(0.2, 0.55, 0.98, alpha * 0.92))
		draw_polyline(head + PackedVector2Array([head[0]]), Color(0.75, 0.93, 1.0, alpha), 2.5, true)

		# 上下顎
		var upper := PackedVector2Array([
			Vector2(46.0 * d, -6.0), Vector2(86.0 * d, -14.0 - jaw * 0.5), Vector2(44.0 * d, 2.0),
		])
		var lower := PackedVector2Array([
			Vector2(46.0 * d, 8.0), Vector2(82.0 * d, 18.0 + jaw), Vector2(44.0 * d, 0.0),
		])
		draw_colored_polygon(upper, Color(0.35, 0.72, 1.0, alpha * 0.9))
		draw_colored_polygon(lower, Color(0.35, 0.72, 1.0, alpha * 0.9))

		# 龍角與鬃毛
		for i in 3:
			var bx := -6.0 - float(i) * 12.0
			var horn := PackedVector2Array([
				Vector2(bx * d, -28.0),
				Vector2((bx - 8.0) * d, -52.0 - sin(t * 12.0 + float(i)) * 6.0),
				Vector2((bx - 16.0) * d, -26.0),
			])
			draw_colored_polygon(horn, Color(0.55, 0.85, 1.0, alpha * 0.7))

		# 眼睛
		draw_circle(Vector2(22.0 * d, -14.0), 5.5, Color(1, 1, 1, alpha))
		draw_circle(Vector2(24.0 * d, -14.0), 2.6, Color(0.05, 0.1, 0.3, alpha))
