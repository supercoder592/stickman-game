class_name SkillShadow
extends Skill
##
## 🌑 暗影 —— 【影渡·瞬身斬】
##
## 機制：整個人散成墨影，瞬間出現在敵人「背後」並斬出交叉雙斬。
##       從背後命中時傷害額外提升 25%，命中者失衡 0.45 秒。
##       場上沒有敵人時就只是往前短距離瞬移（仍可用來拉開或貼近）。
##
## 特效（純 GDScript）：
##   1. 消失／現身的墨霧：Veil —— 不用 ADD 混色（黑色在加法混色下會消失），
##      改以深色多邊形擴散 + 洋紅描邊弧，做出「潑墨散開」的輪廓。
##   2. 途中殘影：沿起訖點插出三個 StickFigure.Afterimage。
##   3. 斬擊：Slash —— 兩道交叉的毛筆新月斬（ADD），與其他元素的斬擊語言一致。
##

const DAMAGE := 26.0
const BACKSTAB_MUL := 1.25        # 真的繞到背後才吃得到的加成
const BLINK_RANGE := 130.0        # 沒有目標時的前衝距離
const BACK_OFFSET := 58.0         # 落點與目標的水平距離
const HIT_RADIUS := 84.0


func _on_setup() -> void:
	id = "shadow"
	cd_max = 1.7
	color = Game.element_color(id)


func _use() -> void:
	var from := user.global_position
	var target := _nearest_enemy()

	var to := from + Vector2(signf(float(user.facing)) * BLINK_RANGE, 0.0)
	var backstab := false
	if target != null:
		# 目標面向哪一邊，就從反方向現身
		var behind := -signf(float(target.facing))
		if behind == 0.0:
			behind = -signf(float(user.facing))
		to = target.global_position + Vector2(behind * BACK_OFFSET, 0.0)
		backstab = true
	to.x = clampf(to.x, arena.WORLD_LEFT + 40.0, arena.WORLD_RIGHT - 40.0)

	_veil(from, 1.0)
	_afterimages(from, to)

	user.global_position = to
	user.velocity = Vector2.ZERO
	if target != null:
		var look := signf(target.global_position.x - to.x)
		user.facing = int(look) if look != 0.0 else user.facing
	user.set_pose("dash", 0.32)
	user.control_lock = 0.2
	user.invuln = 0.24
	user.super_armor = 0.3
	_veil(to, 0.75)

	var f := signf(float(user.facing))
	var dmg: float = DAMAGE * (BACKSTAB_MUL if backstab else 1.0)
	for e in enemies_in_circle(to + Vector2(0, -40), HIT_RADIUS):
		e.take_damage(dmg, Vector2(f * 300.0, -280.0), {"color": color, "stun": 0.45})
		MoveKit.impact(arena, e.center(), color, true)

	var slash := Slash.new()
	slash.col = color
	slash.dir = f
	slash.global_position = to + Vector2(f * 30.0, -44.0)
	arena.fx_front.add_child(slash)

	start_cooldown()
	shake(8.0, 0.22)


func _nearest_enemy() -> Fighter:
	var best: Fighter = null
	var bd := 1e9
	for e in enemies():
		var d: float = absf(e.global_position.x - user.global_position.x)
		if d < bd:
			bd = d
			best = e
	return best


func _veil(at: Vector2, scale_k: float) -> void:
	var v := Veil.new()
	v.col = color
	v.scale_k = scale_k
	v.global_position = at + Vector2(0, -40)
	arena.fx_back.add_child(v)
	Fx.particles(arena.fx_front, at + Vector2(0, -40), {
		"amount": int(22 * scale_k) + 6, "lifetime": 0.5,
		"vmin": 60.0, "vmax": 260.0, "spread": 180.0,
		"direction": Vector2(0, -1), "gravity": Vector2(0, 120),
		"smin": 0.12, "smax": 0.42, "additive": true,
		"colors": [Color(1, 0.75, 0.95, 0.9), Color(color.r, color.g, color.b, 0.5),
			Color(0.1, 0.05, 0.12, 0.0)],
	})


## 起訖點之間插出的三個骨架殘影，讓「瞬移」看得出移動方向
func _afterimages(from: Vector2, to: Vector2) -> void:
	var joints := user.current_joints()
	for i in 3:
		var a := StickFigure.Afterimage.new()
		a.joints_data = joints
		a.global_position = from.lerp(to, float(i + 1) / 4.0)
		a.col = Color(color.r, color.g, color.b, 0.55)
		a.life = 0.26 + 0.06 * float(i)
		a.skin = user.skin
		a.width = float(user.skin.get("width", 5.0))
		arena.fx_back.add_child(a)


# ================================================================== 特效節點

## 潑墨般散開的影霧。
## 刻意不使用 ADD 混色 —— 黑色在加法混色下等於不畫，影子就沒有「暗」的質感了。
class Veil extends Node2D:
	var col := Color(0.85, 0.25, 0.65)
	var scale_k := 1.0
	var life := 0.4
	var t := 0.0
	var _blobs: Array = []          # [方向, 距離, 半徑]
	var _rng := RandomNumberGenerator.new()

	func _ready() -> void:
		z_index = 8
		for i in 9:
			var ang := TAU * float(i) / 9.0 + _rng.randf_range(-0.25, 0.25)
			_blobs.append([Vector2(cos(ang), sin(ang) * 0.75),
				_rng.randf_range(20.0, 46.0) * scale_k,
				_rng.randf_range(13.0, 24.0) * scale_k])

	func _process(delta: float) -> void:
		t += delta
		if t >= life:
			queue_free()
			return
		queue_redraw()

	func _draw() -> void:
		var k: float = clampf(t / life, 0.0, 1.0)
		var a: float = (1.0 - k) * 0.9
		for b in _blobs:
			var dir: Vector2 = b[0]
			var c: Vector2 = dir * (float(b[1]) * ease(k, 0.4))
			var r: float = float(b[2]) * (0.5 + k * 0.9)
			draw_circle(c, r, Color(0.05, 0.03, 0.08, a * 0.75))
			draw_arc(c, r, 0.0, TAU, 16, Color(col.r, col.g, col.b, a * 0.55), 1.6, true)
		draw_circle(Vector2.ZERO, 34.0 * scale_k * (1.0 - k), Color(0.04, 0.02, 0.07, a))
		draw_arc(Vector2.ZERO, 40.0 * scale_k * (0.4 + k), 0.0, TAU, 28,
			Color(col.r, col.g, col.b, a * 0.8), 2.4, true)


## 現身瞬間的交叉雙斬
class Slash extends Node2D:
	var col := Color(0.85, 0.25, 0.65)
	var dir := 1.0
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
		var r: float = 74.0 * (0.72 + k * 0.5)
		for s in 2:
			var tilt: float = 0.55 if s == 0 else -0.55
			var a0 := -1.15 + tilt
			var a1 := 1.15 + tilt
			if dir < 0.0:
				a0 = PI + 1.15 - tilt
				a1 = PI - 1.15 - tilt
			Fx.brush_slash(self, Vector2(-dir * r * 0.3, 0), r, a0, a1,
				15.0 * (1.0 - k * 0.45), col, a * 0.95)
		draw_circle(Vector2.ZERO, 16.0 * (1.0 + k * 1.6), Color(1, 0.85, 0.98, a * 0.5))
