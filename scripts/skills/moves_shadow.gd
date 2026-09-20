class_name ShadowMoves
extends RefCounted
## 🌑 暗影的追加招式（招式二、招式三）。招式一在 skill_shadow.gd。

static func list() -> Array:
	return [Fang, Veil]


## 招式二：【魔影·追牙】
## 射出兩顆會追蹤的影牙，命中減速並疊加壓制；自身順勢後撤半步。
class Fang extends Skill:
	func _on_setup() -> void:
		id = "shadow"
		move_index = 1
		cd_max = 2.0

	func _use() -> void:
		var d := signf(float(user.facing))
		user.set_pose("cast", 0.32)
		user.control_lock = 0.14
		# 後座力：射完往後滑半步，遠程招式也要有走位代價
		dash(-d, 180.0, -110.0)

		for i in 2:
			var p := MoveKit.Projectile.new()
			p.arena = arena
			p.team = user.team
			p.vel = Vector2(d, 0).rotated((float(i) - 0.5) * 0.3 * d) * 620.0
			p.life = 1.8
			p.radius = 20.0
			p.damage = 13.0
			p.knockback = Vector2(160.0, -140.0)
			p.col = color
			p.style = MoveKit.Projectile.Style.SHARD
			p.homing = 3.4
			p.opts = {"color": color, "slow": [1.6, 0.68]}
			arena.fx_front.add_child(p)
			p.global_position = user.center() + Vector2(d * 30.0, float(i) * 18.0 - 9.0)

		Fx.speed_lines(arena.fx_back, user.center() + Vector2(d * 36.0, 0),
			color, 120.0, 12, 0.24)
		start_cooldown()
		shake(3.0, 0.14)


## 招式三：【宵闇·虛影結界】
## 周身展開影霧：減傷 50%、霧中的敵人持續減速，
## 並在左右留下兩個虛影（純視覺的假目標）。
class Veil extends Skill:
	const DURATION := 4.5

	func _on_setup() -> void:
		id = "shadow"
		move_index = 2
		cd_max = 9.0

	func _use() -> void:
		user.set_pose("cast", 0.4)
		aura(220.0, 0.85, false)
		user.damage_reduction = 0.5
		user.dr_time = DURATION

		var z := MoveKit.Zone.new()
		z.arena = arena
		z.team = user.team
		z.follow = user
		z.radius = 116.0
		z.life = DURATION
		z.tick_interval = 0.5
		z.damage = 4.0
		z.col = color
		z.style = MoveKit.Zone.Style.MIST
		z.opts = {"color": color, "slow": [1.0, 0.7]}
		arena.fx_back.add_child(z)

		# 左右各站一個虛影
		for side in [-1.0, 1.0]:
			var d := Decoy.new()
			d.joints_data = user.current_joints()
			d.skin = user.skin
			d.col = Color(color.r, color.g, color.b, 0.55)
			d.life = DURATION
			d.width = float(user.skin.get("width", 5.0))
			d.global_position = user.global_position + Vector2(side * 66.0, 0.0)
			arena.fx_back.add_child(d)

		Fx.shockwave(arena.fx_front, user.center(), 140.0, color, 0.38)
		start_cooldown()


## 虛影：把施放瞬間的骨架釘在原地慢慢呼吸，時間到才散掉。
## 只有視覺效果，不擋招也不受傷 —— 用來擾亂對手（和線上對手的眼睛）。
class Decoy extends Node2D:
	var joints_data: Dictionary
	var skin: Dictionary = {}
	var col := Color(0.85, 0.25, 0.65, 0.55)
	var life := 4.0
	var width := 5.0
	var t := 0.0

	func _ready() -> void:
		var mat := CanvasItemMaterial.new()
		mat.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
		material = mat
		z_index = 4

	func _process(delta: float) -> void:
		t += delta
		if t >= life:
			queue_free()
			return
		queue_redraw()

	func _draw() -> void:
		# 出現與消失各花 0.35 秒淡入淡出，中間微微明滅
		var fade_in: float = clampf(t / 0.35, 0.0, 1.0)
		var fade_out: float = clampf((life - t) / 0.35, 0.0, 1.0)
		var a: float = col.a * fade_in * fade_out * (0.75 + 0.25 * sin(t * 4.0))
		var flat := skin.duplicate()
		flat["glow"] = false
		StickFigure.draw_figure(self, joints_data, Color(col.r, col.g, col.b, a),
			width, 0.8, flat)
