class_name WaterMoves
extends RefCounted
## 💧 水流的追加招式。招式一在 skill_water.gd。

static func list() -> Array:
	return [Cannon, Calm]


## 招式二：【水砲】
## 高速水彈，命中造成大幅擊退。
class Cannon extends Skill:
	func _on_setup() -> void:
		id = "water"
		move_index = 1
		cd_max = 1.7

	func _use() -> void:
		var d := signf(float(user.facing))
		user.set_pose("cast", 0.35)
		user.control_lock = 0.16
		dash(-d, 330.0, -190.0)

		var p := MoveKit.Projectile.new()
		p.arena = arena
		p.team = user.team
		p.vel = Vector2(d * 900.0, -40.0)
		p.gravity = 220.0
		p.life = 1.6
		p.radius = 20.0
		p.damage = 22.0
		p.knockback = Vector2(520.0, -260.0)
		p.col = Color(0.35, 0.72, 1.0)
		p.style = MoveKit.Projectile.Style.ORB
		p.explode_radius = 70.0
		p.opts = {"color": color, "stun": 0.15}
		arena.fx_front.add_child(p)
		p.global_position = user.center() + Vector2(d * 36.0, 0)

		Fx.curl(arena.fx_front, user.center() + Vector2(d * 30.0, 0),
			Color(0.8, 0.94, 1.0), 30.0, d, 0.4)
		start_cooldown()
		shake(3.0, 0.14)


## 招式三：【水之呼吸·凪】
## 進入無我之境：0.9 秒內完全無敵，且反彈靠近的敵人。
class Calm extends Skill:
	const DURATION := 0.9

	func _on_setup() -> void:
		id = "water"
		move_index = 2
		cd_max = 7.0

	func _use() -> void:
		user.set_pose("cast_hold", DURATION + 0.15)
		aura(240.0, 0.9)
		user.invuln = DURATION
		user.super_armor = DURATION + 0.1
		user.velocity.x = 0.0

		var z := MoveKit.Zone.new()
		z.arena = arena
		z.team = user.team
		z.follow = user
		z.radius = 118.0
		z.life = DURATION
		z.tick_interval = 0.3
		z.damage = 9.0
		z.col = Color(0.5, 0.82, 1.0)
		z.style = MoveKit.Zone.Style.RING
		z.opts = {"color": color, "stun": 0.2}
		arena.fx_back.add_child(z)

		# 凪：靜止水面般的同心圓
		for i in 3:
			Fx.shockwave(arena.fx_front, user.center(), 90.0 + float(i) * 45.0,
				Color(0.6, 0.88, 1.0, 0.8), 0.4 + float(i) * 0.12)
		Fx.curl(arena.fx_front, user.center(), Color(0.85, 0.96, 1.0), 52.0, 1.0, 0.6)
		Fx.curl(arena.fx_front, user.center(), Color(0.85, 0.96, 1.0), 44.0, -1.0, 0.6)
		start_cooldown()
