class_name PoisonMoves
extends RefCounted
## ☠️ 劇毒的追加招式。招式一在 skill_poison.gd。

static func list() -> Array:
	return [Sludge, Fog]


## 招式二：【污泥波】
## 拋射黏稠毒彈，落地濺開並疊加毒素。
class Sludge extends Skill:
	func _on_setup() -> void:
		id = "poison"
		move_index = 1
		cd_max = 2.2

	func _use() -> void:
		var d := signf(float(user.facing))
		user.set_pose("cast", 0.38)
		user.control_lock = 0.18
		dash(-d, 290.0, -210.0)

		for i in 2:
			var p := MoveKit.Projectile.new()
			p.arena = arena
			p.team = user.team
			p.vel = Vector2(d * (520.0 + float(i) * 90.0), -420.0 + float(i) * 60.0)
			p.gravity = 1150.0
			p.life = 2.0
			p.radius = 19.0
			p.damage = 15.0
			p.knockback = Vector2(180.0, -220.0)
			p.col = Color(0.7, 0.34, 0.98)
			p.style = MoveKit.Projectile.Style.BLOB
			p.explode_radius = 78.0
			p.spin_rate = 5.0
			p.opts = {"color": color, "poison": 3, "slow": [1.5, 0.65]}
			arena.fx_front.add_child(p)
			p.global_position = user.center() + Vector2(d * 32.0, -10.0 * float(i))

		Fx.curl(arena.fx_front, user.center() + Vector2(d * 26.0, 0),
			Color(0.6, 1.0, 0.7), 26.0, -d, 0.4)
		start_cooldown()


## 招式三：【毒霧結界】
## 在自身周圍展開毒霧，持續對範圍內敵人疊毒與減速。
class Fog extends Skill:
	const DURATION := 6.0

	func _on_setup() -> void:
		id = "poison"
		move_index = 2
		cd_max = 8.0

	func _use() -> void:
		user.set_pose("cast", 0.4)
		aura(235.0, 0.9)

		var z := MoveKit.Zone.new()
		z.arena = arena
		z.team = user.team
		z.follow = user
		z.radius = 145.0
		z.life = DURATION
		z.tick_interval = 0.45
		z.damage = 4.0
		z.col = Color(0.68, 0.32, 0.95)
		z.style = MoveKit.Zone.Style.MIST
		z.opts = {"color": color, "poison": 1, "slow": [0.8, 0.6], "silent": true}
		arena.fx_back.add_child(z)

		Fx.shockwave(arena.fx_front, user.center(), 160.0,
			Color(0.7, 0.4, 1.0, 0.75), 0.45)
		Fx.particles(arena.fx_front, user.center(), {
			"amount": 40, "lifetime": 0.9, "vmin": 60.0, "vmax": 260.0, "spread": 180.0,
			"direction": Vector2(0, -1), "gravity": Vector2(0, -60),
			"smin": 0.3, "smax": 0.9, "additive": true,
			"colors": [Color(0.85, 0.6, 1.0, 0.9), Color(0.45, 0.9, 0.6, 0.4), Color(0.2, 0.05, 0.3, 0)],
		})
		start_cooldown()
