class_name DragonMoves
extends RefCounted
## 🐉 龍之力的追加招式。招式一在 skill_dragon.gd。

static func list() -> Array:
	return [Pulse, Meteor]


## 招式二：【龍之波動】
## 射出會追蹤敵人的巨大龍能量彈，命中爆散。
class Pulse extends Skill:
	func _on_setup() -> void:
		id = "dragon"
		move_index = 1
		cd_max = 3.6

	func _use() -> void:
		var d := signf(float(user.facing))
		user.set_pose("cast", 0.5)
		user.control_lock = 0.26
		dash(-d, 380.0, -200.0)

		var p := MoveKit.Projectile.new()
		p.arena = arena
		p.team = user.team
		p.vel = Vector2(d * 620.0, -30.0)
		p.life = 2.4
		p.radius = 34.0
		p.damage = 34.0
		p.knockback = Vector2(420.0, -360.0)
		p.col = Color(0.62, 0.48, 1.0)
		p.style = MoveKit.Projectile.Style.ORB
		p.homing = 2.4
		p.explode_radius = 105.0
		p.opts = {"color": color, "stun": 0.3}
		arena.fx_front.add_child(p)
		p.global_position = user.center() + Vector2(d * 42.0, 0)

		Fx.shockwave(arena.fx_front, user.center() + Vector2(d * 34.0, 0), 110.0,
			Color(0.7, 0.6, 1.0, 0.9), 0.32)
		Fx.speed_lines(arena.fx_back, user.center(), Color(0.75, 0.65, 1.0), 150.0, 18, 0.3)
		start_cooldown()
		shake(6.0, 0.24)


## 招式三：【流星群】
## 天降八顆隕石覆蓋整片戰場。
class Meteor extends Skill:
	func _on_setup() -> void:
		id = "dragon"
		move_index = 2
		cd_max = 9.0

	func _use() -> void:
		user.set_pose("charge", 0.6)
		aura(300.0, 1.1)
		user.control_lock = 0.4
		user.super_armor = 0.7

		var target_x: float = user.global_position.x + signf(float(user.facing)) * 240.0
		var foes := enemies()
		if foes.size() > 0:
			target_x = foes[0].global_position.x

		var r := MoveKit.Rain.new()
		r.arena = arena
		r.team = user.team
		r.center_x = target_x
		r.spread = 300.0
		r.count = 8
		r.interval = 0.17
		r.damage = 20.0
		r.radius = 78.0
		r.col = Color(0.68, 0.5, 1.0)
		r.style = MoveKit.Rain.Style.METEOR
		r.opts = {"color": color, "burn": [2.0, 6.0], "stun": 0.15}
		arena.fx_front.add_child(r)

		Fx.particles(arena.fx_front, user.center(), {
			"amount": 44, "lifetime": 0.7, "vmin": 0.0, "vmax": 20.0,
			"gravity": Vector2.ZERO, "radius": 300.0,
			"shape": CPUParticles2D.EMISSION_SHAPE_SPHERE,
			"radial_min": -600.0, "radial_max": -1000.0,
			"smin": 0.15, "smax": 0.5, "additive": true,
			"colors": [Color(0.8, 0.7, 1.0, 0.9), Color(1, 1, 1, 1)],
		})
		start_cooldown()
		shake(9.0, 0.4)
