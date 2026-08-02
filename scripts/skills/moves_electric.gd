class_name ElectricMoves
extends RefCounted
## ⚡ 雷電的追加招式（招式二、招式三）。招式一在 skill_electric.gd。

static func list() -> Array:
	return [Thunder, Barrier]


## 招式二：【落雷·十萬伏特】
## 在最近的敵人頭上連續降下 5 道落雷，命中麻痺。
class Thunder extends Skill:
	func _on_setup() -> void:
		id = "electric"
		move_index = 1
		cd_max = 3.2

	func _use() -> void:
		user.set_pose("cast", 0.4)
		user.control_lock = 0.22

		dash(-signf(float(user.facing)), 260.0, -180.0)
		var target_x: float = front(150.0).x
		var foes := enemies()
		if foes.size() > 0:
			var best = foes[0]
			var bd: float = 1e9
			for f in foes:
				var d: float = absf(f.global_position.x - user.global_position.x)
				if d < bd:
					bd = d
					best = f
			target_x = best.global_position.x

		var r := MoveKit.Rain.new()
		r.arena = arena
		r.team = user.team
		r.center_x = target_x
		r.spread = 140.0
		r.count = 5
		r.interval = 0.14
		r.damage = 15.0
		r.radius = 66.0
		r.col = color
		r.style = MoveKit.Rain.Style.BOLT
		r.opts = {"color": color, "stun": 0.3}
		arena.fx_front.add_child(r)

		Fx.speed_lines(arena.fx_back, user.center(), color, 120.0, 14, 0.28)
		start_cooldown()
		shake(5.0, 0.2)


## 招式三：【磁暴·電漿護盾】
## 展開電漿護罩：期間減傷 45%，並持續電擊靠近的敵人。
class Barrier extends Skill:
	const DURATION := 5.0

	func _on_setup() -> void:
		id = "electric"
		move_index = 2
		cd_max = 8.0

	func _use() -> void:
		user.set_pose("cast", 0.35)
		aura(230.0, 0.9)
		user.damage_reduction = 0.45
		user.dr_time = DURATION

		var z := MoveKit.Zone.new()
		z.arena = arena
		z.team = user.team
		z.follow = user
		z.radius = 104.0
		z.life = DURATION
		z.tick_interval = 0.4
		z.damage = 5.0
		z.col = color
		z.style = MoveKit.Zone.Style.RING
		z.opts = {"color": color, "stun": 0.1}
		arena.fx_back.add_child(z)

		Fx.shockwave(arena.fx_front, user.center(), 130.0, color, 0.35)
		Fx.particles(arena.fx_front, user.center(), {
			"amount": 34, "lifetime": 0.5, "vmin": 0.0, "vmax": 0.0,
			"gravity": Vector2.ZERO, "radius": 150.0,
			"shape": CPUParticles2D.EMISSION_SHAPE_SPHERE,
			"radial_min": -380.0, "radial_max": -620.0,
			"smin": 0.12, "smax": 0.4, "additive": true,
			"colors": [Color(1, 0.98, 0.7, 0.9), Color(0.4, 0.7, 1.0, 0)],
		})
		start_cooldown()
