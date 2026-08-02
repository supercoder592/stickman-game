class_name SkillWind
extends Skill
##
## 🍃 疾風 —— 【風之呼吸·一型·塵旋風】
##
## 機制：向前揮出高速旋轉的風刃切過地面，沿途敵人被微微牽引，並承受多段微小切削傷害。
##
## 美術方向：《鬼滅之刃》風之呼吸。核心是「多道粗筆刷新月斬擊」而非細線 ——
## 用 Fx.brush_slash() 畫出濃墨描邊 + 主體 + 亮芯 + 飛白的毛筆質感刀刃，
## 四道刃身以不同相位高速自轉，外圍再加螺旋渦流與地面塵捲。
##
## 純 GDScript 特效組成：
##   1. 風刃：Fx.crescent() 沿圓弧生成兩端收尖的新月多邊形（draw_colored_polygon）。
##   2. 渦流：阿基米德螺線 draw_polyline，隨時間反向旋轉。
##   3. 氣流殘影：極細長的綠色線段（draw_line）沿軌跡向後拋射。
##   4. 塵土：CPUParticles2D 以細長條貼圖模擬被割裂的空氣與捲起的沙塵。
##

const SPEED := 520.0
const LIFE := 1.3
const TICK_DAMAGE := 5.0
const TICK_INTERVAL := 0.12
const PULL := 260.0
const RADIUS := 74.0


func _on_setup() -> void:
	id = "wind"
	cd_max = 1.5
	color = Game.element_color(id)


func _use() -> void:
	user.set_pose("cast", 0.35)
	user.control_lock = 0.15

	var b := Blade.new()
	b.dir = signf(float(user.facing))
	b.skill = self
	b.col = color
	b.life = LIFE
	b.speed = SPEED
	b.radius = RADIUS
	b.global_position = user.global_position + Vector2(b.dir * 40.0, -34.0)
	arena.fx_front.add_child(b)

	# 起手：一道朝前的大範圍筆刷斬擊 + 集中線
	var slash := LaunchSlash.new()
	slash.dir = b.dir
	slash.col = color
	slash.global_position = user.global_position + Vector2(b.dir * 30.0, -46.0)
	arena.fx_front.add_child(slash)
	Fx.speed_lines(arena.fx_back, user.global_position + Vector2(b.dir * 40.0, -44.0),
		Color(0.75, 1.0, 0.8), 130.0, 14, 0.3)

	Fx.particles(arena.fx_back, user.global_position + Vector2(0, -30), {
		"amount": 26, "lifetime": 0.45, "vmin": 180.0, "vmax": 460.0, "spread": 22.0,
		"direction": Vector2(b.dir, -0.15), "gravity": Vector2(0, 90),
		"smin": 0.25, "smax": 0.8, "texture": Fx.tex_shard(),
		"spin_min": -3.0, "spin_max": 3.0, "additive": true,
		"colors": [Color(0.9, 1.0, 0.92, 0.9), Color(0.4, 0.95, 0.5, 0)],
	})

	start_cooldown()
	shake(4.0, 0.18)


## 由 Blade 呼叫：牽引 + 多段切削
func slice(at: Vector2, dir: float, hit_log: Dictionary) -> void:
	var now := float(Time.get_ticks_msec()) * 0.001
	for e in enemies_in_circle(at, RADIUS * 0.85):
		# 微微牽引：往風刃中心拉
		var to_blade: Vector2 = at - e.center()
		e.velocity += to_blade.normalized() * PULL * 0.016
		if e.is_on_floor() and absf(to_blade.y) > 10.0:
			e.velocity.y = minf(e.velocity.y, -120.0)

		var key: int = e.get_instance_id()
		if now - float(hit_log.get(key, -99.0)) < TICK_INTERVAL:
			continue
		hit_log[key] = now
		e.take_damage(TICK_DAMAGE, Vector2(dir * 60.0, -40.0), {"color": color})

		# 每一段切削都留下一道小筆刷斬痕
		var cut := CutMark.new()
		cut.col = color
		cut.angle = randf_range(-0.9, 0.9)
		cut.global_position = e.center() + Vector2(randf_range(-12, 12), randf_range(-14, 14))
		arena.fx_front.add_child(cut)
		Fx.particles(arena.fx_front, e.center(), {
			"amount": 7, "lifetime": 0.28, "vmin": 120.0, "vmax": 300.0, "spread": 180.0,
			"direction": Vector2(dir, 0), "gravity": Vector2.ZERO, "smin": 0.15, "smax": 0.4,
			"texture": Fx.tex_shard(), "additive": true,
			"colors": [Color(0.95, 1.0, 0.95, 1.0), Color(0.4, 1.0, 0.5, 0)],
		})


# ================================================================== 特效節點

## 旋轉風刃本體：四道毛筆新月刃 + 螺旋渦流 + 塵捲
class Blade extends Node2D:
	var dir := 1.0
	var col := Color(0.55, 1.0, 0.6)
	var skill = null            # 施放者的 SkillWind（不加型別註記以避免自我參照）
	var t := 0.0
	var life := 1.3
	var speed := 520.0
	var radius := 74.0
	var spin := 0.0
	var _hit_log := {}
	var _streaks: Array = []          # [位置, 角度, 長度, 剩餘壽命]
	var _streak_t := 0.0
	var _dust: CPUParticles2D
	var _base_y := 0.0

	func _ready() -> void:
		z_index = 19
		_base_y = position.y
		var mat := CanvasItemMaterial.new()
		mat.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
		material = mat
		# 地面捲起的沙塵
		_dust = Fx.particles(self, Vector2(0, 30), {
			"amount": 64, "lifetime": 0.6, "one_shot": false, "explosiveness": 0.0,
			"direction": Vector2(-dir, -0.7).normalized(), "spread": 45.0,
			"vmin": 90.0, "vmax": 320.0, "gravity": Vector2(0, 280),
			"smin": 0.18, "smax": 0.6, "radius": 26.0,
			"shape": CPUParticles2D.EMISSION_SHAPE_SPHERE,
			"texture": Fx.tex_shard(), "auto_free": false, "additive": true,
			"spin_min": -6.0, "spin_max": 6.0,
			"colors": [Color(0.92, 1.0, 0.92, 0.85), Color(0.5, 0.95, 0.55, 0.4), Color(0.3, 0.7, 0.35, 0)],
		})

	func _process(delta: float) -> void:
		t += delta
		if t >= life:
			_dust.emitting = false
			Fx.autofree(self, 0.6)
			set_process(false)
			return

		spin += delta * 16.0                        # 高速自轉
		position.x += dir * speed * delta
		position.y = _base_y + sin(t * 14.0) * 6.0

		# 產生氣流殘影線段
		_streak_t += delta
		if _streak_t >= 0.025:
			_streak_t = 0.0
			for i in 3:
				_streaks.append([
					global_position + Vector2(randf_range(-30, 30), randf_range(-42, 38)),
					randf_range(-0.3, 0.3),
					randf_range(46.0, 130.0),
					0.32,
				])

		var alive := []
		for s in _streaks:
			s[3] -= delta
			s[0] += Vector2(-dir * 300.0, 0) * delta
			if s[3] > 0.0:
				alive.append(s)
		_streaks = alive

		if skill and is_instance_valid(skill):
			skill.slice(global_position, dir, _hit_log)

		queue_redraw()

	func _draw() -> void:
		var fade: float = clampf(1.0 - t / life, 0.0, 1.0)
		var appear: float = clampf(t * 9.0, 0.0, 1.0)
		var a := fade * appear
		var r := radius

		# 氣流殘影（世界座標 → 轉回本地）
		for s in _streaks:
			var lp: Vector2 = s[0] - global_position
			var d: Vector2 = Vector2(cos(s[1]) * -dir, sin(s[1])) * s[2]
			var sa: float = (s[3] / 0.32) * a
			draw_line(lp, lp + d, Color(0.65, 1.0, 0.7, sa * 0.5), 1.8, true)

		# 外圈快速細環
		draw_arc(Vector2.ZERO, r * 1.16, spin * 0.6, spin * 0.6 + TAU * 0.82, 40,
			Color(0.7, 1.0, 0.75, a * 0.35), 2.4, true)

		# 四道毛筆新月刃（本體）
		for i in 4:
			var base := spin + TAU * float(i) / 4.0
			var span := 1.15 + sin(t * 9.0 + float(i)) * 0.12
			Fx.brush_slash(self, Vector2.ZERO, r - float(i % 2) * 12.0,
				base, base + span, 11.0 - float(i % 2) * 3.0, col, a * 0.95)

		# 反向旋轉的螺旋渦流
		for layer in 2:
			var pts := PackedVector2Array()
			var n := 26
			var sgn: float = 1.0 if layer == 0 else -1.0
			for k in range(n + 1):
				var u := float(k) / float(n)
				var ang := -spin * 0.8 * sgn + u * TAU * 1.35 + float(layer) * 2.1
				pts.append(Vector2(cos(ang), sin(ang)) * (r * 0.95 * (1.0 - u * 0.72)))
			draw_polyline(pts, Color(0.85, 1.0, 0.88, a * 0.4), 2.2, true)

		# 中心風眼
		var eye := 13.0 + sin(t * 30.0) * 2.5
		draw_circle(Vector2.ZERO, eye * 1.8, Color(col.r, col.g, col.b, a * 0.18))
		draw_circle(Vector2.ZERO, eye, Color(0.9, 1.0, 0.92, a * 0.5))


## 起手的大範圍筆刷斬擊
class LaunchSlash extends Node2D:
	var dir := 1.0
	var col := Color(0.55, 1.0, 0.6)
	var life := 0.3
	var t := 0.0

	func _ready() -> void:
		var mat := CanvasItemMaterial.new()
		mat.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
		material = mat
		z_index = 22

	func _process(delta: float) -> void:
		t += delta
		if t >= life:
			queue_free()
			return
		queue_redraw()

	func _draw() -> void:
		var k: float = clampf(t / life, 0.0, 1.0)
		var a := 1.0 - k
		# 三道長度不一的斬擊，向前扇形展開
		for i in 3:
			var r: float = (86.0 + float(i) * 34.0) * (0.75 + k * 0.5)
			var mid := -0.15 + (float(i) - 1.0) * 0.42
			var half := 0.72 - float(i) * 0.1
			var a0 := mid - half
			var a1 := mid + half
			if dir < 0.0:
				a0 = PI - (mid - half)
				a1 = PI - (mid + half)
			Fx.brush_slash(self, Vector2(-dir * r * 0.55, 0), r, a0, a1,
				15.0 - float(i) * 3.0, col, a * 0.9)


## 命中時殘留的小斬痕
class CutMark extends Node2D:
	var col := Color(0.55, 1.0, 0.6)
	var angle := 0.0
	var life := 0.22
	var t := 0.0

	func _ready() -> void:
		var mat := CanvasItemMaterial.new()
		mat.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
		material = mat
		z_index = 24
		rotation = angle

	func _process(delta: float) -> void:
		t += delta
		if t >= life:
			queue_free()
			return
		queue_redraw()

	func _draw() -> void:
		var k: float = clampf(t / life, 0.0, 1.0)
		var a := 1.0 - k
		var r: float = 34.0 * (0.8 + k * 0.6)
		Fx.brush_slash(self, Vector2(-r * 0.5, 0), r, -0.85, 0.85, 7.0, col, a, false)
