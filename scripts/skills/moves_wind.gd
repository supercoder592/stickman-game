class_name WindMoves
extends RefCounted
## 🍃 疾風的追加招式。招式一在 skill_wind.gd。

static func list() -> Array:
	return [Vacuum, Soar]


## 招式二：【風之呼吸·三型·晴嵐風樹】
## 扇形射出三道真空風刃，可穿透。
class Vacuum extends Skill:
	func _on_setup() -> void:
		id = "wind"
		move_index = 1
		cd_max = 2.1

	func _use() -> void:
		var d := signf(float(user.facing))
		user.set_pose("cast", 0.35)
		user.control_lock = 0.16

		for i in 3:
			var spread := (float(i) - 1.0) * 0.24
			var p := MoveKit.Projectile.new()
			p.arena = arena
			p.team = user.team
			p.vel = Vector2(d, 0).rotated(spread * d) * 780.0
			p.life = 1.3
			p.radius = 26.0
			p.damage = 12.0
			p.knockback = Vector2(180.0, -150.0)
			p.col = Color(0.6, 1.0, 0.65)
			p.style = MoveKit.Projectile.Style.BLADE
			p.pierce = true
			p.opts = {"color": color}
			arena.fx_front.add_child(p)
			p.global_position = user.center() + Vector2(d * 34.0, float(i - 1) * 12.0)

		Fx.speed_lines(arena.fx_back, user.center() + Vector2(d * 40.0, 0),
			Color(0.8, 1.0, 0.85), 140.0, 16, 0.26)
		start_cooldown()
		shake(3.0, 0.15)


## 招式三：【疾風·浮空】
## 藉風力再次躍升（空中亦可），落地時產生衝擊波。
class Soar extends Skill:
	func _on_setup() -> void:
		id = "wind"
		move_index = 2
		cd_max = 3.0

	func _use() -> void:
		aura(190.0, 0.6, false)
		user.velocity.y = -780.0
		user.velocity.x += signf(float(user.facing)) * 320.0
		user.set_pose("air", 0.4)

		# 腳下的爆風
		Fx.shockwave(arena.fx_back, user.global_position, 120.0,
			Color(0.7, 1.0, 0.75, 0.9), 0.32, 0.4)
		Fx.particles(arena.fx_back, user.global_position, {
			"amount": 30, "lifetime": 0.5, "vmin": 120.0, "vmax": 400.0, "spread": 65.0,
			"direction": Vector2(0, 1), "gravity": Vector2(0, 300),
			"smin": 0.18, "smax": 0.6, "texture": Fx.tex_shard(), "additive": true,
			"spin_min": -5.0, "spin_max": 5.0,
			"colors": [Color(0.9, 1.0, 0.9, 0.9), Color(0.4, 0.95, 0.5, 0)],
		})
		for i in 2:
			var curl_spin: float = 1.0 if i == 0 else -1.0
			Fx.curl(arena.fx_front, user.global_position + Vector2(float(i * 40 - 20), -20.0),
				Color(0.8, 1.0, 0.85), 30.0, curl_spin, 0.45)

		# 落地監聽：著地瞬間放出範圍衝擊
		var lander := Lander.new()
		lander.skill = self
		lander.user_ref = user
		arena.add_child(lander)

		start_cooldown()

	func landing_burst() -> void:
		var at := user.global_position
		for e in enemies_in_circle(at + Vector2(0, -30), 110.0):
			e.take_damage(14.0, Vector2(signf(e.center().x - at.x) * 300.0, -420.0),
				{"color": color, "stun": 0.2})
		Fx.shockwave(arena.fx_front, at, 150.0, Color(0.75, 1.0, 0.8, 0.95), 0.35, 0.35)
		Fx.speed_lines(arena.fx_back, at, Color(0.8, 1.0, 0.85), 150.0, 18, 0.28)
		shake(7.0, 0.22)


## 等待施放者落地的小監聽器（放在檔案頂層，避免多層巢狀內部類別）
class Lander extends Node:
	var skill = null
	var user_ref: Fighter
	var t := 0.0
	var armed := false

	func _process(delta: float) -> void:
		t += delta
		if user_ref == null or not is_instance_valid(user_ref) or t > 4.0:
			queue_free()
			return
		if not armed:
			if not user_ref.is_on_floor():
				armed = true
			return
		if user_ref.is_on_floor():
			if skill and is_instance_valid(skill):
				skill.landing_burst()
			queue_free()
