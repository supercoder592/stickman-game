class_name LavaMoves
extends RefCounted
## 🌋 熔岩的追加招式。招式一在 skill_lava.gd。

static func list() -> Array:
	return [Barrage, Blade]


## 招式二：【熔岩彈幕】
## 拋射五顆熔岩塊，落點爆開並灼燒。
class Barrage extends Skill:
	func _on_setup() -> void:
		id = "lava"
		move_index = 1
		cd_max = 3.0

	func _use() -> void:
		var d := signf(float(user.facing))
		user.set_pose("cast", 0.5)
		user.control_lock = 0.25
		dash(-d, 270.0, -230.0)

		for i in 5:
			var p := MoveKit.Projectile.new()
			p.arena = arena
			p.team = user.team
			p.vel = Vector2(d * (330.0 + float(i) * 95.0), -560.0 - float(i) * 25.0)
			p.gravity = 1250.0
			p.life = 2.2
			p.radius = 17.0
			p.damage = 14.0
			p.knockback = Vector2(200.0, -300.0)
			p.col = Color(1.0, 0.45, 0.08)
			p.style = MoveKit.Projectile.Style.METEOR
			p.explode_radius = 66.0
			p.spin_rate = randf_range(-7.0, 7.0)
			p.opts = {"color": color, "burn": [2.5, 9.0]}
			arena.fx_front.add_child(p)
			p.global_position = user.center() + Vector2(d * 30.0, -14.0)

		Fx.speed_lines(arena.fx_back, user.center(), Color(1.0, 0.55, 0.15), 130.0, 16, 0.28)
		start_cooldown()
		shake(6.0, 0.25)


## 招式三：【斷崖之劍】
## 前方地面接連隆起三根熔岩岩柱，將敵人高高頂飛。
class Blade extends Skill:
	func _on_setup() -> void:
		id = "lava"
		move_index = 2
		cd_max = 4.4

	func _use() -> void:
		var d := signf(float(user.facing))
		user.set_pose("slam", 0.48)
		aura(260.0, 0.95)
		user.control_lock = 0.28

		for i in 3:
			var x: float = user.global_position.x + d * (100.0 + float(i) * 88.0)
			x = clampf(x, arena.WORLD_LEFT + 25.0, arena.WORLD_RIGHT - 25.0)
			var pil := MoveKit.Pillar.new()
			pil.arena = arena
			pil.team = user.team
			pil.height = 165.0 - float(i) * 18.0
			pil.width = 58.0
			pil.damage = 24.0
			pil.life = 0.9
			pil.col = Color(1.0, 0.45, 0.08)
			pil.opts = {"color": color, "burn": [3.0, 10.0], "stun": 0.2}
			pil.global_position = Vector2(x, arena.ground_y_at(x))
			arena.fx_back.add_child(pil)

			Fx.particles(arena.fx_front, pil.global_position, {
				"amount": 14, "lifetime": 0.7, "vmin": 260.0, "vmax": 620.0, "spread": 30.0,
				"direction": Vector2(0, -1), "gravity": Vector2(0, 1300),
				"smin": 0.18, "smax": 0.7, "texture": Fx.tex_square(), "additive": true,
				"colors": [Color(1, 0.9, 0.5, 1), Color(1, 0.35, 0.05, 0.8), Color(0.3, 0.05, 0, 0)],
			})

		Fx.shockwave(arena.fx_back, user.global_position, 120.0,
			Color(1.0, 0.5, 0.12, 0.9), 0.34, 0.32)
		start_cooldown()
		shake(11.0, 0.3)
