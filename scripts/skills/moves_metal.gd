class_name MetalMoves
extends RefCounted
## 🧲 鋼鐵的追加招式。招式一在 skill_metal.gd。

static func list() -> Array:
	return [WingSlash, IronHead]


## 招式二：【飛葉快刀·鋼翼斬】
## 化為鋼翼高速突進，穿過的敵人承受重擊。
class WingSlash extends Skill:
	func _on_setup() -> void:
		id = "metal"
		move_index = 1
		cd_max = 2.3

	func _use() -> void:
		var d := signf(float(user.facing))
		var r := MoveKit.Rush.new()
		r.arena = arena
		r.user = user
		r.dir = d
		r.distance = 360.0
		r.duration = 0.2
		r.damage = 27.0
		r.col = Color(1.0, 0.88, 0.55)
		r.slash_col = Color(1.0, 0.92, 0.7)
		r.opts = {"color": color, "stun": 0.25}
		arena.fx_front.add_child(r)

		Fx.particles(arena.fx_back, user.center(), {
			"amount": 28, "lifetime": 0.45, "vmin": 120.0, "vmax": 420.0, "spread": 40.0,
			"direction": Vector2(-d, -0.3).normalized(), "gravity": Vector2(0, 500),
			"smin": 0.12, "smax": 0.4, "texture": Fx.tex_shard(), "additive": true,
			"colors": [Color(1, 1, 0.9, 1), Color(1, 0.75, 0.25, 0)],
		})
		Fx.speed_lines(arena.fx_back, user.center(), Color(1.0, 0.9, 0.6), 160.0, 20, 0.3)
		start_cooldown()
		shake(7.0, 0.22)


## 招式三：【鋼鐵頭殼】
## 覆上鋼鐵裝甲：減傷 60% 且全程霸體，撞到的敵人被彈開。
class IronHead extends Skill:
	const DURATION := 4.5

	func _on_setup() -> void:
		id = "metal"
		move_index = 2
		cd_max = 9.0

	func _use() -> void:
		user.set_pose("cast", 0.3)
		aura(225.0, 0.9)
		user.damage_reduction = 0.6
		user.dr_time = DURATION
		user.super_armor = DURATION

		var z := MoveKit.Zone.new()
		z.arena = arena
		z.team = user.team
		z.follow = user
		z.radius = 92.0
		z.life = DURATION
		z.tick_interval = 0.5
		z.damage = 6.0
		z.col = Color(1.0, 0.85, 0.45)
		z.style = MoveKit.Zone.Style.ARMOR
		z.opts = {"color": color, "stun": 0.1}
		arena.fx_back.add_child(z)

		Fx.shockwave(arena.fx_front, user.center(), 120.0, Color(1.0, 0.88, 0.5, 0.9), 0.3)
		Fx.particles(arena.fx_front, user.center(), {
			"amount": 30, "lifetime": 0.5, "vmin": 0.0, "vmax": 0.0,
			"gravity": Vector2.ZERO, "radius": 140.0,
			"shape": CPUParticles2D.EMISSION_SHAPE_SPHERE,
			"radial_min": -350.0, "radial_max": -560.0,
			"smin": 0.12, "smax": 0.4, "texture": Fx.tex_square(), "additive": true,
			"colors": [Color(1, 0.95, 0.7, 0.95), Color(1, 0.7, 0.2, 0)],
		})
		start_cooldown()
