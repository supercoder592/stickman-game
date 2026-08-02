class_name FireMoves
extends RefCounted
## 🔥 熾焰的追加招式。招式一在 skill_fire.gd。

static func list() -> Array:
	return [Crimson, Breath]


## 招式二：【炎之呼吸·火龍紅蓮】
## 帶霸體的高速突進斬，穿過敵人並留下灼燒。
class Crimson extends Skill:
	func _on_setup() -> void:
		id = "fire"
		move_index = 1
		cd_max = 2.6

	func _use() -> void:
		var d := signf(float(user.facing))
		var r := MoveKit.Rush.new()
		r.arena = arena
		r.user = user
		r.dir = d
		r.distance = 330.0
		r.duration = 0.24
		r.damage = 30.0
		r.col = Color(1.0, 0.5, 0.12)
		r.slash_col = Color(1.0, 0.42, 0.08)
		r.opts = {"color": color, "burn": [4.0, 10.0], "stun": 0.2}
		arena.fx_front.add_child(r)

		# 沿路的火痕
		Fx.particles(arena.fx_back, user.global_position + Vector2(0, -30), {
			"amount": 40, "lifetime": 0.6, "vmin": 60.0, "vmax": 260.0, "spread": 60.0,
			"direction": Vector2(-d, -0.5).normalized(), "gravity": Vector2(0, -120),
			"smin": 0.25, "smax": 0.8, "additive": true,
			"colors": [Color(1, 0.88, 0.42, 1), Color(1, 0.4, 0.06, 0.7), Color(0.3, 0.05, 0, 0)],
		})
		Fx.speed_lines(arena.fx_back, user.center(), Color(1.0, 0.6, 0.2), 150.0, 18, 0.3)
		start_cooldown()
		shake(8.0, 0.25)


## 招式三：【噴火·烈焰吐息】
## 向前持續噴出扇形火焰，多段灼燒。
class Breath extends Skill:
	func _on_setup() -> void:
		id = "fire"
		move_index = 2
		cd_max = 3.4

	func _use() -> void:
		var d := signf(float(user.facing))
		user.set_pose("cast", 1.0)
		aura(210.0, 0.8)
		user.control_lock = 0.85
		user.velocity.x = -d * 60.0

		var b := MoveKit.Breath.new()
		b.arena = arena
		b.team = user.team
		b.dir = d
		b.follow = user
		b.length = 285.0
		b.half_angle = 0.4
		b.life = 0.9
		b.damage = 8.0
		b.col = Color(1.0, 0.45, 0.08)
		b.opts = {"color": color, "burn": [3.0, 9.0], "silent": false}
		arena.fx_front.add_child(b)

		start_cooldown()
		shake(3.5, 0.9)
