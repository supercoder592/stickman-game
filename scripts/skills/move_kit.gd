class_name MoveKit
extends RefCounted
##
## 招式行為元件庫。
##
## 9 個元素 × 3 招 = 27 招。若每招都從零寫起，品質會參差不齊、也難以維護；
## 因此把「彈道、場域、天降、地刺、吐息、突進、壁障」抽成七個可組合的元件，
## 各元素只需要設定顏色／形狀／數值，再加上少量客製繪製即可做出辨識度。
##
## 所有元件都吃同一組欄位：
##   arena / team  → 用來查詢敵方單位
##   col / style   → 視覺
##   damage / opts → 傳給 Fighter.take_damage() 的傷害與狀態
##

# ------------------------------------------------------------------ 共用工具
static func hit_targets(arena, team: int, area: Rect2) -> Array:
	var out := []
	if arena == null or not is_instance_valid(arena):
		return out
	for f in arena.fighters_of_other_team(team):
		if f.body_rect().intersects(area):
			out.append(f)
	return out


static func impact(arena, at: Vector2, col: Color, big := false) -> void:
	if arena == null or not is_instance_valid(arena):
		return
	Fx.spark(arena.fx_front, at, col, 30.0 if big else 20.0)
	Fx.speed_lines(arena.fx_back, at, col, 130.0 if big else 80.0, 16 if big else 10, 0.24)


# ================================================================== 彈道
## 直線／拋物線飛行物。可穿透或爆炸，style 決定外觀。
## 用於：水砲、污泥波、真空斬、龍之波動、熔岩彈幕、冰凍光束的彈頭。
class Projectile extends Node2D:
	enum Style { ORB, BLADE, BLOB, SHARD, METEOR }

	var arena = null
	var team := 0
	var vel := Vector2.RIGHT * 600.0
	var gravity := 0.0
	var life := 2.0
	var radius := 22.0
	var damage := 18.0
	var knockback := Vector2(240, -180)
	var opts := {}
	var col := Color.WHITE
	var style: int = Style.ORB
	var pierce := false
	var explode_radius := 0.0     # > 0 時消失瞬間造成範圍傷害
	var homing := 0.0             # > 0 時追蹤最近敵人（每秒可轉的弧度）
	var spin_rate := 0.0

	var t := 0.0
	var _hit := {}
	var _trail: Array[Vector2] = []

	func _ready() -> void:
		z_index = 20
		var mat := CanvasItemMaterial.new()
		mat.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
		material = mat

	func _process(delta: float) -> void:
		t += delta
		if t >= life:
			_finish()
			return

		if homing > 0.0:
			var target := _nearest()
			if target:
				var want := (target.center() - global_position).normalized()
				var cur := vel.normalized()
				var ang := cur.angle_to(want)
				vel = cur.rotated(clampf(ang, -homing * delta, homing * delta)) * vel.length()

		vel.y += gravity * delta
		global_position += vel * delta
		rotation += spin_rate * delta

		_trail.push_front(global_position)
		if _trail.size() > 14:
			_trail.resize(14)

		_check_hits()
		if not _in_bounds():
			_finish()
			return
		queue_redraw()

	func _nearest() -> Fighter:
		var best: Fighter = null
		var bd := 1e9
		if arena == null or not is_instance_valid(arena):
			return null
		for f in arena.fighters_of_other_team(team):
			var d: float = f.center().distance_to(global_position)
			if d < bd:
				bd = d
				best = f
		return best

	func _in_bounds() -> bool:
		if arena == null or not is_instance_valid(arena):
			return false
		return global_position.x > arena.WORLD_LEFT - 160.0 \
			and global_position.x < arena.WORLD_RIGHT + 160.0 \
			and global_position.y < arena.GROUND_Y + 160.0 \
			and global_position.y > -900.0

	func _check_hits() -> void:
		var area := Rect2(global_position - Vector2(radius, radius), Vector2(radius, radius) * 2.0)
		for e in MoveKit.hit_targets(arena, team, area):
			if _hit.has(e.get_instance_id()):
				continue
			_hit[e.get_instance_id()] = true
			var kb := Vector2(knockback.x * signf(vel.x), knockback.y)
			if vel.x == 0.0:
				kb.x = 0.0
			e.take_damage(damage, kb, opts)
			MoveKit.impact(arena, e.center(), col, not pierce)
			if not pierce:
				_finish()
				return

	func _finish() -> void:
		if explode_radius > 0.0 and arena and is_instance_valid(arena):
			var area := Rect2(global_position - Vector2.ONE * explode_radius,
				Vector2.ONE * explode_radius * 2.0)
			for e in MoveKit.hit_targets(arena, team, area):
				if _hit.has(e.get_instance_id()):
					continue
				e.take_damage(damage * 0.7, Vector2(signf(vel.x) * 180.0, -260.0), opts)
			Fx.shockwave(arena.fx_front, global_position, explode_radius * 1.2, col, 0.32)
			Fx.particles(arena.fx_front, global_position, {
				"amount": 26, "lifetime": 0.55, "vmin": 120.0, "vmax": 380.0, "spread": 180.0,
				"direction": Vector2(0, -1), "gravity": Vector2(0, 700),
				"smin": 0.15, "smax": 0.5, "additive": true,
				"colors": [col.lightened(0.5), Color(col.r, col.g, col.b, 0.0)],
			})
		queue_free()

	func _draw() -> void:
		var fade: float = clampf(1.0 - (t / life) * 0.3, 0.0, 1.0)
		# 尾跡（世界座標轉本地）
		if _trail.size() > 2:
			var pts := PackedVector2Array()
			var widths := PackedFloat32Array()
			for i in _trail.size():
				pts.append(_trail[i] - global_position)
				widths.append(radius * 0.75 * (1.0 - float(i) / float(_trail.size())))
			Fx.draw_poly(self, Fx.ribbon(pts, widths), Color(col.r, col.g, col.b, 0.3 * fade))

		match style:
			Style.ORB:
				draw_circle(Vector2.ZERO, radius * 1.5, Color(col.r, col.g, col.b, 0.18 * fade))
				draw_circle(Vector2.ZERO, radius, Color(col.r, col.g, col.b, 0.6 * fade))
				draw_circle(Vector2.ZERO, radius * 0.55, Color(1, 1, 1, 0.85 * fade))
				var ring := radius * (1.7 + sin(t * 18.0) * 0.16)
				draw_arc(Vector2.ZERO, ring, 0, TAU, 30, Color(col.r, col.g, col.b, 0.35 * fade), 2.0, true)
			Style.BLADE:
				var ang := vel.angle()
				Fx.brush_slash(self, Vector2(cos(ang), sin(ang)) * -radius * 0.6, radius * 1.5,
					ang - 0.85, ang + 0.85, radius * 0.42, col, fade)
			Style.BLOB:
				# 不規則抖動的黏稠團塊
				var poly := PackedVector2Array()
				for i in 11:
					var a := TAU * float(i) / 11.0
					var r := radius * (0.78 + sin(t * 9.0 + float(i) * 2.1) * 0.22)
					poly.append(Vector2(cos(a), sin(a)) * r)
				Fx.draw_poly(self, poly, Color(col.r, col.g, col.b, 0.8 * fade))
				draw_circle(Vector2(-radius * 0.2, -radius * 0.2), radius * 0.3,
					Color(1, 1, 1, 0.4 * fade))
			Style.SHARD:
				var a2 := vel.angle()
				var sh := PackedVector2Array([
					Vector2(radius * 1.8, 0).rotated(a2),
					Vector2(0, -radius * 0.55).rotated(a2),
					Vector2(-radius * 0.9, 0).rotated(a2),
					Vector2(0, radius * 0.55).rotated(a2),
				])
				Fx.draw_poly(self, sh, Color(col.r, col.g, col.b, 0.9 * fade))
				Fx.draw_poly(self, PackedVector2Array([
					Vector2(radius * 1.4, 0).rotated(a2),
					Vector2(0, -radius * 0.22).rotated(a2),
					Vector2(-radius * 0.4, 0).rotated(a2),
					Vector2(0, radius * 0.22).rotated(a2),
				]), Color(1, 1, 1, 0.8 * fade))
			Style.METEOR:
				var rock := PackedVector2Array()
				for i in 8:
					var a3 := TAU * float(i) / 8.0
					rock.append(Vector2(cos(a3), sin(a3)) * radius * (0.7 + sin(float(i) * 3.3) * 0.3))
				Fx.draw_poly(self, rock, Color(0.22, 0.09, 0.06, 0.95))
				Fx.draw_poly(self, Fx.star(Vector2.ZERO, 5, radius * 0.8, radius * 0.3, t * 3.0),
					Color(col.r, col.g, col.b, 0.85 * fade))
				draw_circle(Vector2.ZERO, radius * 0.34, Color(1, 0.95, 0.7, 0.9 * fade))


# ================================================================== 場域
## 環繞施放者的持續性領域（毒霧結界、電漿護盾、鋼鐵護甲）。
class Zone extends Node2D:
	enum Style { RING, MIST, ARMOR }

	var arena = null
	var team := 0
	var follow: Node2D
	var radius := 110.0
	var life := 5.0
	var tick_interval := 0.4
	var damage := 4.0
	var opts := {}
	var col := Color.WHITE
	var style: int = Style.RING

	var t := 0.0
	var _tick := 0.0
	var _particles: CPUParticles2D

	func _ready() -> void:
		z_index = 6
		var mat := CanvasItemMaterial.new()
		mat.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
		material = mat
		_particles = Fx.particles(self, Vector2(0, -30), {
			"amount": 40, "lifetime": 1.0, "one_shot": false, "explosiveness": 0.0,
			"direction": Vector2(0, -1), "spread": 60.0,
			"vmin": 10.0, "vmax": 60.0, "gravity": Vector2(0, -40),
			"smin": 0.15, "smax": 0.5, "radius": radius * 0.8,
			"shape": CPUParticles2D.EMISSION_SHAPE_SPHERE,
			"auto_free": false, "additive": true,
			"colors": [col.lightened(0.4), Color(col.r, col.g, col.b, 0.0)],
		})

	func _process(delta: float) -> void:
		t += delta
		if follow and is_instance_valid(follow):
			global_position = follow.global_position + Vector2(0, -34)
		if t >= life:
			_particles.emitting = false
			Fx.autofree(self, 1.2)
			set_process(false)
			return
		if damage > 0.0:
			_tick += delta
			if _tick >= tick_interval:
				_tick = 0.0
				var area := Rect2(global_position - Vector2.ONE * radius, Vector2.ONE * radius * 2.0)
				for e in MoveKit.hit_targets(arena, team, area):
					e.take_damage(damage, Vector2.ZERO, opts)
		queue_redraw()

	func _draw() -> void:
		var appear: float = clampf(t * 4.0, 0.0, 1.0)
		var fade: float = clampf((life - t) * 2.0, 0.0, 1.0)
		var a := appear * fade
		match style:
			Style.RING:
				# 兩層反向旋轉的能量環 + 弧段
				draw_arc(Vector2.ZERO, radius, 0, TAU, 48, Color(col.r, col.g, col.b, a * 0.35), 3.0, true)
				for i in 6:
					var s := t * 2.4 + TAU * float(i) / 6.0
					draw_arc(Vector2.ZERO, radius * 0.9, s, s + 0.55, 12,
						Color(col.r, col.g, col.b, a * 0.8), 5.0, true)
				for i in 4:
					var s2 := -t * 3.1 + TAU * float(i) / 4.0
					draw_arc(Vector2.ZERO, radius * 0.62, s2, s2 + 0.8, 14,
						Color(1, 1, 1, a * 0.45), 2.4, true)
			Style.MIST:
				for i in 5:
					var rr := radius * (0.45 + 0.14 * float(i))
					var off := sin(t * (1.2 + float(i) * 0.3)) * 8.0
					draw_circle(Vector2(off, -off * 0.4), rr, Color(col.r, col.g, col.b, a * 0.09))
				draw_arc(Vector2.ZERO, radius, 0, TAU, 44, Color(col.r, col.g, col.b, a * 0.3), 2.0, true)
			Style.ARMOR:
				# 貼身的六邊形裝甲片
				for i in 6:
					var ang := t * 1.4 + TAU * float(i) / 6.0
					var c := Vector2(cos(ang), sin(ang)) * radius * 0.66
					var plate := PackedVector2Array()
					for k in 6:
						var a2 := TAU * float(k) / 6.0 + ang
						plate.append(c + Vector2(cos(a2), sin(a2)) * radius * 0.24)
					Fx.draw_poly(self, plate, Color(col.r, col.g, col.b, a * 0.32))
					draw_polyline(plate + PackedVector2Array([plate[0]]),
						Color(col.r, col.g, col.b, a * 0.85), 2.0, true)


# ================================================================== 天降
## 在目標區域依序降下多發打擊（落雷、流星群）。
class Rain extends Node2D:
	enum Style { BOLT, METEOR }

	var arena = null
	var team := 0
	var center_x := 0.0
	var spread := 260.0
	var count := 5
	var interval := 0.16
	var damage := 16.0
	var radius := 62.0
	var opts := {}
	var col := Color.WHITE
	var style: int = Style.BOLT

	var _left := 0
	var _t := 0.0

	func _ready() -> void:
		z_index = 21
		_left = count

	func _process(delta: float) -> void:
		_t -= delta
		if _t > 0.0:
			return
		if _left <= 0:
			queue_free()
			return
		_left -= 1
		_t = interval
		_strike()

	func _strike() -> void:
		if arena == null or not is_instance_valid(arena):
			queue_free()
			return
		var x: float = clampf(center_x + randf_range(-spread, spread),
			arena.WORLD_LEFT + 30.0, arena.WORLD_RIGHT - 30.0)
		var gy: float = arena.ground_y_at(x)
		var at := Vector2(x, gy - 26.0)

		var area := Rect2(at - Vector2.ONE * radius, Vector2.ONE * radius * 2.0)
		for e in MoveKit.hit_targets(arena, team, area):
			e.take_damage(damage, Vector2(randf_range(-120, 120), -420.0), opts)
		MoveKit.impact(arena, at, col, true)
		arena.shake(7.0, 0.18)

		match style:
			Style.BOLT:
				var b := BoltDrop.new()
				b.col = col
				b.global_position = at
				arena.fx_front.add_child(b)
				Fx.shockwave(arena.fx_back, Vector2(x, gy), radius * 1.5, col, 0.3, 0.35)
			Style.METEOR:
				var m := MoveKit.Projectile.new()
				m.arena = arena
				m.team = team
				m.col = col
				m.style = MoveKit.Projectile.Style.METEOR
				m.vel = Vector2(randf_range(-90, 90), 900.0)
				m.gravity = 900.0
				m.radius = 20.0
				m.damage = damage
				m.opts = opts
				m.explode_radius = radius
				m.life = 1.4
				arena.fx_front.add_child(m)
				m.global_position = Vector2(x + randf_range(-40, 40), gy - 620.0)


## 落雷的視覺：從天而降的粗閃電柱
class BoltDrop extends Node2D:
	var col := Color(1, 0.9, 0.3)
	var life := 0.32
	var t := 0.0
	var _lines: Array[PackedVector2Array] = []
	var _rng := RandomNumberGenerator.new()

	func _ready() -> void:
		var mat := CanvasItemMaterial.new()
		mat.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
		material = mat
		z_index = 24
		for i in 3:
			_lines.append(Fx.jagged(Vector2(randf_range(-20, 20), -520.0), Vector2.ZERO,
				13, 16.0 + float(i) * 8.0, _rng))

	func _process(delta: float) -> void:
		t += delta
		if t >= life:
			queue_free()
			return
		queue_redraw()

	func _draw() -> void:
		var a: float = clampf(1.0 - t / life, 0.0, 1.0)
		draw_polyline(_lines[2], Color(col.r, col.g, col.b, a * 0.3), 22.0, true)
		draw_polyline(_lines[1], Color(col.r, col.g, col.b, a * 0.6), 10.0, true)
		draw_polyline(_lines[0], Color(1, 1, 0.92, a), 3.4, true)
		draw_circle(Vector2.ZERO, 40.0 * (1.0 + t * 3.0), Color(col.r, col.g, col.b, a * 0.35))


# ================================================================== 地刺
## 從地面依序升起的柱體，把敵人頂飛（斷崖之劍）。
class Pillar extends Node2D:
	var arena = null
	var team := 0
	var height := 150.0
	var width := 54.0
	var damage := 26.0
	var opts := {}
	var col := Color.WHITE
	var life := 1.0
	var t := 0.0
	var _done := false

	func _ready() -> void:
		z_index = 7
		scale.y = 0.0
		var tw := create_tween()
		tw.set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_BACK)
		tw.tween_property(self, "scale:y", 1.0, 0.13)
		var area := Rect2(global_position - Vector2(width * 0.6, height), Vector2(width * 1.2, height))
		for e in MoveKit.hit_targets(arena, team, area):
			e.take_damage(damage, Vector2(0, -720.0), opts)
			MoveKit.impact(arena, e.center(), col, true)

	func _process(delta: float) -> void:
		t += delta
		if not _done and t >= life:
			_done = true
			var tw := create_tween()
			tw.set_ease(Tween.EASE_IN)
			tw.tween_property(self, "scale:y", 0.0, 0.25)
			tw.tween_callback(queue_free)
		queue_redraw()

	func _draw() -> void:
		var w := width * 0.5
		# 粗糙的岩柱剪影
		var body := PackedVector2Array([
			Vector2(-w, 0), Vector2(-w * 0.82, -height * 0.45), Vector2(-w * 0.95, -height * 0.8),
			Vector2(-w * 0.3, -height), Vector2(w * 0.45, -height * 0.94),
			Vector2(w * 0.9, -height * 0.6), Vector2(w * 0.75, -height * 0.2), Vector2(w, 0),
		])
		Fx.draw_poly(self, body, Color(0.16, 0.12, 0.12, 0.98))
		draw_polyline(body + PackedVector2Array([body[0]]),
			Color(col.r, col.g, col.b, 0.9), 2.6, true)
		# 岩縫中的熾光
		for i in 3:
			var yy := -height * (0.25 + 0.26 * float(i))
			draw_line(Vector2(-w * 0.5, yy), Vector2(w * 0.45, yy - 12.0),
				Color(col.r, col.g, col.b, 0.75), 3.0, true)


# ================================================================== 吐息
## 前方持續噴發的扇形範圍（烈焰吐息、毒霧噴吐）。
class Breath extends Node2D:
	var arena = null
	var team := 0
	var dir := 1.0
	var follow: Node2D
	var length := 260.0
	var half_angle := 0.42
	var life := 0.9
	var tick_interval := 0.11
	var damage := 7.0
	var opts := {}
	var col := Color.WHITE

	var t := 0.0
	var _tick := 0.0
	var _jet: CPUParticles2D

	func _ready() -> void:
		z_index = 20
		var mat := CanvasItemMaterial.new()
		mat.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
		material = mat
		_jet = Fx.particles(self, Vector2.ZERO, {
			"amount": 110, "lifetime": 0.5, "one_shot": false, "explosiveness": 0.0,
			"direction": Vector2(dir, -0.08), "spread": rad_to_deg(half_angle),
			"vmin": 320.0, "vmax": 760.0, "gravity": Vector2(0, -60),
			"smin": 0.25, "smax": 0.95, "life_random": 0.4,
			"damp_min": 120.0, "damp_max": 320.0,
			"auto_free": false, "additive": true,
			"colors": [col.lightened(0.55), col, Color(col.r * 0.4, col.g * 0.15, col.b * 0.1, 0.0)],
		})

	func _process(delta: float) -> void:
		t += delta
		if follow and is_instance_valid(follow):
			global_position = follow.global_position + Vector2(dir * 34.0, -46.0)
		if t >= life:
			_jet.emitting = false
			Fx.autofree(self, 0.8)
			set_process(false)
			return
		_tick += delta
		if _tick >= tick_interval:
			_tick = 0.0
			var x0: float = global_position.x
			var x1: float = x0 + dir * length
			var rect := Rect2(Vector2(minf(x0, x1), global_position.y - length * half_angle),
				Vector2(absf(x1 - x0), length * half_angle * 2.0))
			for e in MoveKit.hit_targets(arena, team, rect):
				e.take_damage(damage, Vector2(dir * 90.0, -60.0), opts)
		queue_redraw()

	func _draw() -> void:
		var appear: float = clampf(t * 7.0, 0.0, 1.0)
		var fade: float = clampf((life - t) * 4.0, 0.0, 1.0)
		var a := appear * fade
		# 扇形本體：三層由外而內收窄
		for layer in 3:
			var f := 1.0 - float(layer) * 0.28
			var poly := PackedVector2Array([Vector2.ZERO])
			var n := 14
			for i in range(n + 1):
				var u := float(i) / float(n)
				var ang: float = lerpf(-half_angle, half_angle, u) * f
				var rr: float = length * f * (0.9 + sin(u * 7.0 + t * 16.0) * 0.08)
				poly.append(Vector2(cos(ang) * dir, sin(ang)) * rr)
			var c := col.lightened(float(layer) * 0.3)
			Fx.draw_poly(self, poly, Color(c.r, c.g, c.b, a * (0.24 + 0.14 * float(layer))))


# ================================================================== 突進
## 帶傷害的高速前衝（火龍紅蓮、鋼翼斬）。
class Rush extends Node2D:
	var arena = null
	var user: Fighter
	var dir := 1.0
	var distance := 300.0
	var duration := 0.22
	var damage := 28.0
	var opts := {}
	var col := Color.WHITE
	var slash_col := Color.WHITE

	var t := 0.0
	var _from := Vector2.ZERO
	var _hit := {}
	var _after := 0.0

	func _ready() -> void:
		z_index = 19
		var mat := CanvasItemMaterial.new()
		mat.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
		material = mat
		if user and is_instance_valid(user):
			_from = user.global_position
			user.control_lock = duration + 0.08
			user.super_armor = duration + 0.12
			user.invuln = duration
			user.set_pose("dash", duration + 0.1)

	func _process(delta: float) -> void:
		t += delta
		if user == null or not is_instance_valid(user):
			queue_free()
			return
		var k: float = clampf(t / duration, 0.0, 1.0)
		if t <= duration:
			var target_x: float = _from.x + dir * distance
			if arena and is_instance_valid(arena):
				target_x = clampf(target_x, arena.WORLD_LEFT + 30.0, arena.WORLD_RIGHT - 30.0)
			user.global_position.x = lerpf(_from.x, target_x, ease(k, 0.45))
			user.velocity = Vector2.ZERO
			global_position = user.global_position + Vector2(0, -44)

			_after += delta
			if _after >= 0.02:
				_after = 0.0
				user.spawn_afterimage(Color(col.r, col.g, col.b, 0.7), 0.26)

			var area := user.body_rect().grow(20.0)
			for e in MoveKit.hit_targets(arena, user.team, area):
				if _hit.has(e.get_instance_id()):
					continue
				_hit[e.get_instance_id()] = true
				e.take_damage(damage, Vector2(dir * 320.0, -300.0), opts)
				MoveKit.impact(arena, e.center(), slash_col, true)
		elif t >= duration + 0.26:
			queue_free()
			return
		queue_redraw()

	func _draw() -> void:
		var k: float = clampf(t / (duration + 0.26), 0.0, 1.0)
		var a := 1.0 - k
		# 突進尾端的巨大斬擊
		var r := 96.0 * (0.7 + k * 0.7)
		var a0 := -1.05
		var a1 := 1.05
		if dir < 0.0:
			a0 = PI + 1.05
			a1 = PI - 1.05
		Fx.brush_slash(self, Vector2(-dir * r * 0.45, 0), r, a0, a1, 17.0 * (1.0 - k * 0.4),
			slash_col, a * 0.95)
