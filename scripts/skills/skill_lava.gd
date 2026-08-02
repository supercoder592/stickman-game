class_name SkillLava
extends Skill
##
## 🌋 熔岩 —— 【熔岩·地裂噴發】（售價 1200 金幣）
##
## 機制：向前方地表撕開一道裂縫並噴發熾熱岩漿，地面留下持續 3 秒的岩漿帶，
##       踏上的敵人持續灼燒與減速。
##
## 特效（純 GDScript）：
##   1. 裂縫與岩漿：繪製鋸齒狀黑色地表裂痕（Fx.jagged），
##      裂痕內部填充亮橙色與暗紅色相間的波浪線條（隨時間流動）。
##   2. 岩漿濺射：CPUParticles2D 的 initial_velocity 拉高（向上拋物線），
##      並以 scale_amount_min/max 讓粒子大小不一，模擬帶質感的熔岩塊。
##

const LENGTH := 430.0
const ERUPT_DELAY := 0.14
const DAMAGE := 32.0
const STRIP_LIFE := 3.0
const STRIP_DPS := 12.0

var _pending := -1.0
var _origin := Vector2.ZERO
var _dir := 1.0


func _on_setup() -> void:
	id = "lava"
	cd_max = 3.2
	color = Game.element_color(id)


func _use() -> void:
	user.set_pose("slam", 0.5)
	user.control_lock = 0.28
	user.velocity.x = 0.0
	_dir = signf(float(user.facing))
	_origin = Vector2(user.global_position.x, arena.ground_y_at(user.global_position.x))
	_pending = 0.0

	# 先出現裂縫
	var crack := Crack.new()
	crack.global_position = _origin
	crack.dir = _dir
	crack.length = LENGTH
	crack.life = STRIP_LIFE + 1.2
	arena.fx_back.add_child(crack)

	Fx.shockwave(arena.fx_back, _origin, 100.0, Color(1.0, 0.5, 0.1, 0.9), 0.3, 0.3)
	start_cooldown()
	shake(7.0, 0.25)


func _tick(delta: float) -> void:
	if _pending < 0.0:
		return
	_pending += delta
	if _pending < ERUPT_DELAY:
		return
	_pending = -1.0
	_erupt()


func _erupt() -> void:
	var x0: float = _origin.x
	var x1: float = clampf(_origin.x + _dir * LENGTH, arena.WORLD_LEFT + 10.0, arena.WORLD_RIGHT - 10.0)
	var left: float = minf(x0, x1)
	var right: float = maxf(x0, x1)
	var band := Rect2(Vector2(left, _origin.y - 120.0), Vector2(right - left, 130.0))

	for e in enemies_in_rect(band):
		e.take_damage(DAMAGE, Vector2(_dir * 180.0, -640.0), {
			"color": color, "burn": [3.0, STRIP_DPS], "stun": 0.2,
		})
		Fx.speed_lines(arena.fx_back, e.center(), Color(1.0, 0.55, 0.15), 130.0, 16, 0.26)

	# 沿裂縫多點噴發
	var steps := 7
	for i in range(steps):
		var x: float = lerpf(x0, x1, float(i) / float(steps - 1))
		var p := Vector2(x, arena.ground_y_at(x))
		# 大塊熔岩：高初速拋物線、大小不一
		Fx.particles(arena.fx_front, p, {
			"amount": 16, "lifetime": 0.95, "explosiveness": 0.9,
			"direction": Vector2(randf_range(-0.25, 0.25), -1).normalized(), "spread": 22.0,
			"vmin": 420.0, "vmax": 900.0, "gravity": Vector2(0, 1500),
			"smin": 0.18, "smax": 1.0, "life_random": 0.5,
			"spin_min": -5.0, "spin_max": 5.0, "texture": Fx.tex_square(),
			"colors": [Color(1, 0.95, 0.6, 1), Color(1, 0.45, 0.05, 1),
				Color(0.55, 0.08, 0.02, 0.9), Color(0.15, 0.05, 0.05, 0)],
		})
		# 火光煙氣
		Fx.particles(arena.fx_back, p, {
			"amount": 12, "lifetime": 1.0, "vmin": 60.0, "vmax": 200.0, "spread": 40.0,
			"direction": Vector2(0, -1), "gravity": Vector2(0, -60),
			"smin": 0.4, "smax": 1.1, "additive": true,
			"colors": [Color(1, 0.6, 0.15, 0.7), Color(0.6, 0.15, 0.05, 0)],
		})

	# 殘留岩漿帶
	var strip := LavaStrip.new()
	strip.global_position = Vector2(left, _origin.y)
	strip.width = right - left
	strip.skill = self
	strip.life = STRIP_LIFE
	arena.fx_back.add_child(strip)

	shake(13.0, 0.35)


## 由 LavaStrip 呼叫：站在岩漿上灼燒 + 減速
func burn_tick(area: Rect2) -> void:
	for e in enemies():
		if not e.body_rect().intersects(area):
			continue
		e.take_damage(STRIP_DPS * 0.25, Vector2.ZERO, {
			"color": color, "burn": [1.2, STRIP_DPS], "slow": [0.4, 0.45], "silent": true,
		})


# ================================================================== 特效節點

## 地表裂縫：鋸齒黑縫 + 內部流動的橙紅波浪
class Crack extends Node2D:
	var dir := 1.0
	var length := 400.0
	var life := 4.2
	var t := 0.0
	var _edge_top: PackedVector2Array
	var _edge_bot: PackedVector2Array
	var _rng := RandomNumberGenerator.new()

	func _ready() -> void:
		z_index = 1
		var a := Vector2.ZERO
		var b := Vector2(dir * length, 0)
		# 只抽一條鋸齒中心線，再往上下各撐開一個正值半厚度。
		# （若上下緣各自亂數，振幅大於間距時兩線會交叉 → 多邊形自我相交，
		#   draw_colored_polygon 會 triangulation failed。）
		var mid := Fx.jagged(a, b, 16, 13.0, _rng)
		_edge_top = PackedVector2Array()
		_edge_bot = PackedVector2Array()
		for i in mid.size():
			var half := 4.0 + absf(sin(float(i) * 1.7)) * 5.0
			_edge_top.append(mid[i] - Vector2(0.0, half))
			_edge_bot.append(mid[i] + Vector2(0.0, half))
		scale.x = 0.02
		var tw := create_tween()
		tw.set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_EXPO)
		tw.tween_property(self, "scale:x", 1.0, 0.12)

	func _process(delta: float) -> void:
		t += delta
		if t >= life:
			queue_free()
			return
		queue_redraw()

	func _draw() -> void:
		var fade: float = clampf(1.0 - (t / life) * (t / life), 0.0, 1.0)
		# 裂縫黑洞
		var poly := PackedVector2Array()
		poly.append_array(_edge_top)
		for i in range(_edge_bot.size() - 1, -1, -1):
			poly.append(_edge_bot[i])
		draw_colored_polygon(poly, Color(0.05, 0.02, 0.03, 0.95 * fade))

		# 內部亮橙／暗紅相間的流動波浪線
		for layer in 4:
			var pts := PackedVector2Array()
			var n := 34
			for i in range(n + 1):
				var u := float(i) / float(n)
				var x := dir * length * u
				var y := sin(u * 16.0 - t * (3.0 + float(layer)) + float(layer) * 1.6) * (3.0 + float(layer) * 1.4)
				pts.append(Vector2(x, y))
			var c := Color(1.0, 0.55, 0.08, 0.85 * fade)
			if layer % 2 == 1:
				c = Color(0.72, 0.12, 0.03, 0.8 * fade)
			draw_polyline(pts, c, 4.0 - float(layer) * 0.6, true)

		# 邊緣灼熱輪廓（三層由外而內收窄，做出岩石被燒紅的漸層）
		draw_polyline(_edge_top, Color(0.85, 0.18, 0.02, 0.55 * fade), 5.0, true)
		draw_polyline(_edge_bot, Color(0.85, 0.18, 0.02, 0.55 * fade), 5.0, true)
		draw_polyline(_edge_top, Color(1.0, 0.5, 0.12, 0.8 * fade), 2.2, true)
		draw_polyline(_edge_bot, Color(1.0, 0.5, 0.12, 0.8 * fade), 2.2, true)
		draw_polyline(_edge_top, Color(1.0, 0.85, 0.4, 0.5 * fade), 1.0, true)
		draw_polyline(_edge_bot, Color(1.0, 0.85, 0.4, 0.5 * fade), 1.0, true)


## 殘留岩漿帶：貼地發光 + 持續冒泡
class LavaStrip extends Node2D:
	var width := 400.0
	var skill = null            # 施放者的 SkillLava（不加型別註記以避免自我參照）
	var life := 3.0
	var t := 0.0
	var _tick := 0.0
	var _embers: CPUParticles2D

	func _ready() -> void:
		z_index = 3
		var mat := CanvasItemMaterial.new()
		mat.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
		material = mat
		_embers = Fx.particles(self, Vector2(width * 0.5, -4), {
			"amount": 46, "lifetime": 1.1, "one_shot": false, "explosiveness": 0.0,
			"direction": Vector2(0, -1), "spread": 25.0,
			"vmin": 40.0, "vmax": 150.0, "gravity": Vector2(0, -30),
			"smin": 0.1, "smax": 0.35, "auto_free": false, "additive": true,
			"rect_extents": Vector2(width * 0.5, 4.0),
			"colors": [Color(1, 0.9, 0.5, 0.9), Color(1, 0.35, 0.05, 0.5), Color(0.4, 0.05, 0, 0)],
		})

	func _process(delta: float) -> void:
		t += delta
		if t >= life:
			_embers.emitting = false
			Fx.autofree(self, 1.3)
			set_process(false)
			return
		_tick += delta
		if _tick >= 0.25:
			_tick = 0.0
			if skill and is_instance_valid(skill):
				skill.burn_tick(Rect2(global_position + Vector2(0, -46), Vector2(width, 52)))
		queue_redraw()

	func _draw() -> void:
		var fade: float = clampf(1.0 - t / life, 0.0, 1.0)
		var a: float = 0.35 + fade * 0.55
		# 熔岩表面：兩層正弦邊界
		var top := PackedVector2Array()
		var bot := PackedVector2Array()
		var n := 40
		for i in range(n + 1):
			var u := float(i) / float(n)
			var x := width * u
			top.append(Vector2(x, -7.0 - sin(u * 22.0 - t * 5.0) * 3.5))
			bot.append(Vector2(x, 5.0))
		var poly := PackedVector2Array()
		poly.append_array(top)
		for i in range(bot.size() - 1, -1, -1):
			poly.append(bot[i])
		draw_colored_polygon(poly, Color(0.85, 0.22, 0.03, a * 0.85))

		# 亮芯流動
		var core := PackedVector2Array()
		for i in range(n + 1):
			var u := float(i) / float(n)
			core.append(Vector2(width * u, -2.0 + sin(u * 30.0 - t * 8.0) * 2.0))
		draw_polyline(core, Color(1.0, 0.85, 0.35, a), 3.5, true)
		draw_polyline(top, Color(1.0, 0.6, 0.15, a * 0.8), 2.0, true)
