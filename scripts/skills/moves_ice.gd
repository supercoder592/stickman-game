class_name IceMoves
extends RefCounted
## 🧊 冰霜的追加招式。招式一在 skill_ice.gd。

static func list() -> Array:
	return [Beam, Wall]


## 招式二：【冰凍光束】
## 射出貫穿的冰晶光束，命中者凍結。
class Beam extends Skill:
	func _on_setup() -> void:
		id = "ice"
		move_index = 1
		cd_max = 2.8

	func _use() -> void:
		var d := signf(float(user.facing))
		user.set_pose("cast", 0.4)
		user.control_lock = 0.2
		dash(-d, 300.0, -160.0)

		var p := MoveKit.Projectile.new()
		p.arena = arena
		p.team = user.team
		p.vel = Vector2(d * 1050.0, 0)
		p.life = 1.4
		p.radius = 24.0
		p.damage = 20.0
		p.knockback = Vector2(150.0, -140.0)
		p.col = Color(0.78, 0.94, 1.0)
		p.style = MoveKit.Projectile.Style.SHARD
		p.pierce = true
		p.opts = {"color": color, "freeze": 1.4}
		arena.fx_front.add_child(p)
		p.global_position = user.center() + Vector2(d * 36.0, 0)

		# 槍口的寒氣
		Fx.particles(arena.fx_front, user.center() + Vector2(d * 30.0, 0), {
			"amount": 24, "lifetime": 0.45, "vmin": 100.0, "vmax": 320.0, "spread": 30.0,
			"direction": Vector2(d, 0), "gravity": Vector2(0, 120),
			"smin": 0.12, "smax": 0.4, "texture": Fx.tex_square(), "additive": true,
			"spin_min": -5.0, "spin_max": 5.0,
			"colors": [Color(1, 1, 1, 1), Color(0.6, 0.85, 1.0, 0)],
		})
		Fx.speed_lines(arena.fx_back, user.center(), Color(0.8, 0.95, 1.0), 120.0, 14, 0.24)
		start_cooldown()
		shake(3.0, 0.15)


## 招式三：【冰之壁】
## 在前方豎起三道冰牆，撞上的敵人被彈開並凍結。
class Wall extends Skill:
	func _on_setup() -> void:
		id = "ice"
		move_index = 2
		cd_max = 4.2

	func _use() -> void:
		var d := signf(float(user.facing))
		user.set_pose("slam", 0.42)
		aura(215.0, 0.85)
		user.control_lock = 0.24

		for i in 3:
			var x: float = user.global_position.x + d * (95.0 + float(i) * 46.0)
			x = clampf(x, arena.WORLD_LEFT + 20.0, arena.WORLD_RIGHT - 20.0)
			var w := MoveKit.Pillar.new()
			w.arena = arena
			w.team = user.team
			w.height = 128.0 - float(i) * 16.0
			w.width = 40.0
			w.damage = 16.0
			w.life = 2.2
			w.col = Color(0.82, 0.95, 1.0)
			w.opts = {"color": color, "freeze": 1.5}
			w.global_position = Vector2(x, arena.ground_y_at(x))
			arena.fx_back.add_child(w)

		Fx.shockwave(arena.fx_back, user.global_position, 110.0,
			Color(0.75, 0.93, 1.0, 0.9), 0.32, 0.35)
		Fx.particles(arena.fx_back, user.global_position + Vector2(d * 80.0, 0), {
			"amount": 26, "lifetime": 0.6, "vmin": 90.0, "vmax": 300.0, "spread": 70.0,
			"direction": Vector2(0, -1), "gravity": Vector2(0, 900),
			"smin": 0.15, "smax": 0.45, "texture": Fx.tex_square(),
			"colors": [Color(1, 1, 1, 1), Color(0.65, 0.87, 1.0, 0)],
		})
		start_cooldown()
		shake(6.0, 0.22)
