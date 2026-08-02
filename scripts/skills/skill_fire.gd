class_name SkillFire
extends Skill
##
## 🔥 熾焰 —— 【熾焰·烈焰勾拳】
##
## 機制：帶有霸體的上勾拳，將前方敵人擊飛至空中並附加「灼燒」（每秒扣血）。
##
## 特效（純 GDScript）：
##   1. 火焰粒子：CPUParticles2D，direction = Vector2(0, -1) 向上噴發，
##      color_ramp 由亮黃 → 紅 → 透明。
##   2. 熱浪波動：程式動態生成漸變放大的圓（draw_arc / draw_circle），
##      opacity 快速降低，模擬爆炸空氣衝擊波。
##

const WINDUP := 0.12
const DAMAGE := 30.0
const BURN_SECONDS := 4.0
const BURN_DPS := 9.0

var _t := -1.0
var _fired := false


func _on_setup() -> void:
	id = "fire"
	cd_max = 1.1
	color = Game.element_color(id)


func can_use() -> bool:
	return super() and _t < 0.0


func _use() -> void:
	_t = 0.0
	_fired = false
	user.set_pose("punch_up", 0.42)
	user.super_armor = 0.45              # 霸體
	user.control_lock = 0.3
	user.velocity.x = signf(float(user.facing)) * 150.0
	start_cooldown()

	# 拳頭上的蓄勢火焰
	Fx.particles(arena.fx_back, front(26.0, -52.0), {
		"amount": 20, "lifetime": 0.3, "vmin": 20.0, "vmax": 70.0,
		"direction": Vector2(0, -1), "spread": 60.0, "gravity": Vector2(0, -80),
		"smin": 0.15, "smax": 0.4, "additive": true,
		"colors": [Color(1, 0.95, 0.5, 0.9), Color(1, 0.35, 0.05, 0)],
	})


func _tick(delta: float) -> void:
	if _t < 0.0:
		return
	_t += delta
	if not _fired and _t >= WINDUP:
		_fired = true
		_impact()
	if _t > 0.5:
		_t = -1.0


func _impact() -> void:
	var f := signf(float(user.facing))
	var origin := user.global_position + Vector2(f * 34.0, -46.0)
	var rect_x: float = -45.0 if f < 0.0 else -5.0
	var hit_rect := Rect2(origin + Vector2(rect_x, -52.0), Vector2(50.0, 104.0))

	var hits := enemies_in_rect(hit_rect)
	for e in hits:
		e.take_damage(DAMAGE, Vector2(f * 260.0, -780.0), {
			"color": color,
			"burn": [BURN_SECONDS, BURN_DPS],
			"stun": 0.15,
		})

	# --- 1. 向上噴發的火焰柱 ---
	Fx.particles(arena.fx_front, origin, {
		"amount": 64, "lifetime": 0.65, "explosiveness": 0.85,
		"direction": Vector2(0, -1), "spread": 28.0,
		"vmin": 240.0, "vmax": 620.0, "gravity": Vector2(0, 260),
		"smin": 0.25, "smax": 0.85, "life_random": 0.45,
		"damp_min": 60.0, "damp_max": 160.0, "additive": true,
		"colors": [
			Color(1.0, 0.92, 0.48, 1.0),
			Color(1.0, 0.66, 0.12, 0.95),
			Color(0.95, 0.18, 0.05, 0.6),
			Color(0.35, 0.05, 0.02, 0.0),
		],
	})
	# 濺開的火星
	Fx.particles(arena.fx_front, origin, {
		"amount": 26, "lifetime": 0.8, "vmin": 120.0, "vmax": 420.0, "spread": 75.0,
		"direction": Vector2(f, -1.4).normalized(), "gravity": Vector2(0, 900),
		"smin": 0.1, "smax": 0.28, "texture": Fx.tex_square(), "additive": true,
		"colors": [Color(1, 0.9, 0.5, 1), Color(1, 0.3, 0.05, 0)],
	})

	# --- 2. 熱浪衝擊波 ---
	Fx.shockwave(arena.fx_back, origin, 130.0, Color(1.0, 0.5, 0.12, 0.9), 0.32)
	Fx.shockwave(arena.fx_back, origin, 82.0, Color(1.0, 0.75, 0.25, 0.7), 0.2)

	var flame := UppercutFlame.new()
	flame.global_position = origin
	flame.dir = f
	flame.col = color
	arena.fx_front.add_child(flame)

	# --- 3. 炎之呼吸：命中時的集中線與火花 ---
	if hits.size() > 0:
		Fx.speed_lines(arena.fx_back, origin, Color(1.0, 0.62, 0.2), 165.0, 20, 0.3)
		for e in hits:
			Fx.curl(arena.fx_front, e.center(), Color(1.0, 0.55, 0.12), 30.0, -1.0, 0.45)

	var shake_amount: float = 9.0 if hits.size() > 0 else 5.0
	shake(shake_amount, 0.22)


# ================================================================== 特效節點

## 勾拳掃出的弧形火焰（手繪多邊形 + 熱浪環）
class UppercutFlame extends Node2D:
	var col := Color(1, 0.45, 0.1)
	var dir := 1.0
	var life := 0.34
	var t := 0.0

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
		var a := 1.0 - k
		var sweep := 68.0 + k * 46.0

		# --- 火舌：畫在最底層，帶濃墨描邊的尖銳三角，模仿鬼滅的硬邊火焰 ---
		for i in 6:
			var ox := (float(i) - 2.5) * 12.0 * dir
			var h: float = (58.0 + float(i % 3) * 22.0) * (0.45 + k * 1.15)
			var wob := sin(t * 20.0 + float(i) * 1.7) * 9.0
			var base_w := 8.0 - float(i % 2) * 2.5
			var tip := Vector2(ox + wob, 12.0 - h)
			# 火舌中段外鼓，尖端內收 → 更像舔舐的火焰而非等腰三角
			var tongue := PackedVector2Array([
				Vector2(ox - base_w, 12.0),
				Vector2(ox - base_w * 1.5, 12.0 - h * 0.34),
				Vector2(ox + wob * 0.4 - base_w * 0.4, 12.0 - h * 0.7),
				tip,
				Vector2(ox + wob * 0.4 + base_w * 0.5, 12.0 - h * 0.66),
				Vector2(ox + base_w * 1.4, 12.0 - h * 0.3),
				Vector2(ox + base_w, 12.0),
			])
			draw_colored_polygon(tongue, Color(0.9, 0.25, 0.03, a * 0.55))
			# 內焰
			var inner_tongue := PackedVector2Array([
				Vector2(ox - base_w * 0.45, 12.0),
				Vector2(ox + wob * 0.5, 12.0 - h * 0.62),
				Vector2(ox + base_w * 0.45, 12.0),
			])
			draw_colored_polygon(inner_tongue, Color(1.0, 0.72, 0.2, a * 0.5))

		# --- 勾拳軌跡：由下往上掃的毛筆新月斬 ---
		var start := PI * 0.45
		var end := -PI * 0.55
		if dir < 0.0:
			start = PI - PI * 0.45
			end = PI + PI * 0.55
		Fx.brush_slash(self, Vector2.ZERO, sweep, start, end,
			19.0 * (1.0 - k * 0.35), Color(1.0, 0.42, 0.06), a * 0.95)
		# 第二道較短的追擊斬，錯開角度製造連擊感
		Fx.brush_slash(self, Vector2.ZERO, sweep * 0.66, start - 0.25, end + 0.3,
			10.0 * (1.0 - k * 0.4), Color(1.0, 0.68, 0.15), a * 0.7, false)
