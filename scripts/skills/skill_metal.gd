class_name SkillMetal
extends Skill
##
## 🧲 鋼鐵／金屬 —— 【金·御劍術】（售價 1500 金幣）
##
## 機制（二段式）：
##   第一段：召喚 6 把金屬金劍環繞自身旋轉待命。
##   第二段：再按一次技能鍵 → 自動鎖定全屏敵人，穿透飛去。
##
## 特效（純 GDScript）：
##   1. 飛劍繪製：draw_colored_polygon() 畫出幾何劍身（銀白刃身 + 金黃護手與劍柄）。
##   2. 飛劍軌跡：以程式建立 Line2D（Line2D.new()）把飛劍歷史位置連成線，
##      搭配 gradient 與 width_curve 做出淡出尾跡，營造刺穿質感。
##

const SWORD_COUNT := 6
const ORBIT_RADIUS := 78.0
const ORBIT_SPEED := 2.6
const STANDBY_LIFE := 12.0
const FLY_SPEED := 1150.0
const DAMAGE := 22.0

var _swords: Array = []
var _standby_t := 0.0


func _on_setup() -> void:
	id = "metal"
	cd_max = 4.0
	color = Game.element_color(id)
	stage_label = "召劍"


func can_use() -> bool:
	if _live_swords().size() > 0 and stage == 1:
		return _recover <= 0.0   # 發射不需冷卻，但仍要過施放後搖
	return super()


func _use() -> void:
	if stage == 1 and _live_swords().size() > 0:
		_launch()
		return
	_summon()


func _summon() -> void:
	user.set_pose("cast_hold", 0.6)
	_swords.clear()
	for i in SWORD_COUNT:
		var s := Sword.new()
		s.skill = self
		s.orbit_angle = TAU * float(i) / float(SWORD_COUNT)
		s.col = color
		s.fly_speed = FLY_SPEED
		arena.fx_front.add_child(s)
		s.global_position = _orbit_pos(s.orbit_angle)
		_swords.append(s)

	Fx.particles(arena.fx_back, user.center(), {
		"amount": 30, "lifetime": 0.5, "vmin": 0.0, "vmax": 0.0,
		"gravity": Vector2.ZERO, "radius": 90.0,
		"shape": CPUParticles2D.EMISSION_SHAPE_SPHERE,
		"radial_min": -320.0, "radial_max": -520.0,
		"smin": 0.12, "smax": 0.35, "additive": true,
		"colors": [Color(1, 0.92, 0.6, 0.9), Color(1, 0.8, 0.3, 0)],
	})
	# 召劍法陣
	var circle := RuneCircle.new()
	circle.col = color
	circle.follow = user
	arena.fx_back.add_child(circle)

	stage = 1
	stage_label = "御劍"
	start_cooldown()


func _launch() -> void:
	user.set_pose("cast", 0.35)
	var targets := []
	for e in enemies():
		if not e.is_dead:
			targets.append(e)

	var live := _live_swords()
	for i in live.size():
		var s = live[i]
		var target: Fighter = null
		if targets.size() > 0:
			target = targets[i % targets.size()]
		s.launch(target, signf(float(user.facing)))

	stage = 0
	stage_label = "召劍"
	cooldown = cd_max
	shake(5.0, 0.2)


func _tick(delta: float) -> void:
	var live := _live_swords()
	if live.is_empty():
		if stage == 1:
			stage = 0
			stage_label = "召劍"
		_standby_t = 0.0
		return

	if stage == 1:
		_standby_t += delta
		for s in live:
			if s.state == Sword.State.ORBIT:
				s.orbit_angle += ORBIT_SPEED * delta
				s.global_position = _orbit_pos(s.orbit_angle)
				s.rotation = s.orbit_angle + PI * 0.5
		if _standby_t >= STANDBY_LIFE:
			_launch()


func _orbit_pos(angle: float) -> Vector2:
	var c := user.center()
	return c + Vector2(cos(angle) * ORBIT_RADIUS, sin(angle) * ORBIT_RADIUS * 0.62)


func _live_swords() -> Array:
	var out := []
	for s in _swords:
		if is_instance_valid(s):
			out.append(s)
	_swords = out
	return out


## 由 Sword 呼叫
func sword_hit(e: Fighter, dir: Vector2) -> void:
	e.take_damage(DAMAGE, dir * 210.0 + Vector2(0, -150.0), {"color": color, "stun": 0.12})
	# 穿透瞬間留下一道金色斬痕與集中線
	var mark := SlashMark.new()
	mark.col = color
	mark.rotation = dir.angle()
	mark.global_position = e.center()
	arena.fx_front.add_child(mark)
	Fx.speed_lines(arena.fx_back, e.center(), Color(1.0, 0.9, 0.55), 95.0, 12, 0.2)


func _dispose() -> void:
	for s in _live_swords():
		s.queue_free()


# ================================================================== 特效節點

## 召劍法陣：腳下展開的旋轉六芒星魔法陣（寶可夢式的能量演出）
class RuneCircle extends Node2D:
	var col := Color(1.0, 0.85, 0.45)
	var follow: Node2D
	var life := 1.1
	var t := 0.0

	func _ready() -> void:
		var mat := CanvasItemMaterial.new()
		mat.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
		material = mat
		z_index = 4

	func _process(delta: float) -> void:
		t += delta
		if follow and is_instance_valid(follow):
			global_position = follow.global_position + Vector2(0, -4)
		if t >= life:
			queue_free()
			return
		queue_redraw()

	func _draw() -> void:
		var k: float = clampf(t / life, 0.0, 1.0)
		var open: float = clampf(t * 5.0, 0.0, 1.0)
		var a := (1.0 - k * k) * open
		var r := 88.0 * open
		# 壓扁成橢圓 → 看起來貼在地面上
		draw_set_transform(Vector2.ZERO, 0.0, Vector2(1.0, 0.34))
		draw_circle(Vector2.ZERO, r, Color(col.r, col.g * 0.85, col.b * 0.4, a * 0.13))
		draw_arc(Vector2.ZERO, r, 0, TAU, 56, Color(col.r, col.g, col.b, a), 4.5, true)
		draw_arc(Vector2.ZERO, r * 0.88, 0, TAU, 52, Color(1.0, 0.95, 0.7, a * 0.55), 1.8, true)
		draw_arc(Vector2.ZERO, r * 0.76, 0, TAU, 48, Color(col.r, col.g, col.b, a * 0.8), 3.0, true)
		# 兩個反向旋轉的三角形疊成六芒星
		for s in 2:
			var spin_dir: float = 1.6 if s == 0 else -1.6
			var rot: float = t * spin_dir + float(s) * PI / 3.0
			var tri := PackedVector2Array()
			for i in 3:
				var ang := rot + TAU * float(i) / 3.0
				tri.append(Vector2(cos(ang), sin(ang)) * r * 0.82)
			draw_polyline(tri + PackedVector2Array([tri[0]]),
				Color(col.r, col.g, col.b, a * 0.9), 3.4, true)
		# 沿圓周的刻度
		for i in 12:
			var ang := TAU * float(i) / 12.0 + t * 0.8
			var d := Vector2(cos(ang), sin(ang))
			draw_line(d * r * 0.88, d * r * 1.08, Color(1.0, 0.92, 0.6, a * 0.85), 3.0, true)
		draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


## 飛劍穿透留下的金色斬痕
class SlashMark extends Node2D:
	var col := Color(1.0, 0.85, 0.45)
	var life := 0.24
	var t := 0.0

	func _ready() -> void:
		var mat := CanvasItemMaterial.new()
		mat.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
		material = mat
		z_index = 25

	func _process(delta: float) -> void:
		t += delta
		if t >= life:
			queue_free()
			return
		queue_redraw()

	func _draw() -> void:
		var k: float = clampf(t / life, 0.0, 1.0)
		var a := 1.0 - k
		var r: float = 46.0 * (0.85 + k * 0.5)
		Fx.brush_slash(self, Vector2(-r * 0.55, 0), r, -0.95, 0.95, 9.0 * (1.0 - k * 0.5), col, a, false)


## 一把飛劍：幾何劍身 + Line2D 尾跡
class Sword extends Node2D:
	enum State { ORBIT, LOCKING, FLYING, DONE }

	var skill = null            # 施放者的 SkillMetal（不加型別註記以避免自我參照）
	var state: int = State.ORBIT
	var orbit_angle := 0.0
	var col := Color(1.0, 0.85, 0.45)
	var target: Fighter
	var vel := Vector2.ZERO
	var fly_speed := 1150.0
	var fallback_dir := 1.0
	var life := 0.0
	var _hit := {}
	var _trail: Line2D
	var _spawn_t := 0.0

	func _ready() -> void:
		z_index = 24
		scale = Vector2(0.1, 0.1)
		var tw := create_tween()
		tw.set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_BACK)
		tw.tween_property(self, "scale", Vector2(1.35, 1.35), 0.25)

	func _make_trail() -> void:
		_trail = Line2D.new()
		_trail.width = 15.0
		_trail.default_color = Color(1.0, 0.9, 0.55, 0.75)
		_trail.joint_mode = Line2D.LINE_JOINT_ROUND
		_trail.begin_cap_mode = Line2D.LINE_CAP_ROUND
		_trail.end_cap_mode = Line2D.LINE_CAP_ROUND
		_trail.z_index = 23
		var g := Gradient.new()
		g.set_offset(0, 0.0)
		g.set_color(0, Color(1.0, 0.75, 0.2, 0.0))
		g.set_offset(1, 1.0)
		g.set_color(1, Color(1.0, 1.0, 0.85, 0.9))
		_trail.gradient = g
		var c := Curve.new()
		c.add_point(Vector2(0.0, 0.05))
		c.add_point(Vector2(1.0, 1.0))
		_trail.width_curve = c
		var mat := CanvasItemMaterial.new()
		mat.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
		_trail.material = mat
		get_parent().add_child(_trail)

	func launch(t: Fighter, dir: float) -> void:
		target = t
		fallback_dir = dir
		state = State.LOCKING
		life = 0.0
		_make_trail()
		# 出鞘前微微後撤蓄勢
		var tw := create_tween()
		tw.tween_property(self, "scale", Vector2(1.85, 1.05), 0.08)
		tw.tween_property(self, "scale", Vector2(1.35, 1.35), 0.06)

	func _process(delta: float) -> void:
		_spawn_t += delta
		match state:
			State.ORBIT:
				pass
			State.LOCKING:
				life += delta
				# 短暫瞄準：劍尖轉向目標
				var aim := _aim_dir()
				rotation = lerp_angle(rotation, aim.angle() + PI * 0.5, 12.0 * delta)
				if life >= 0.16:
					state = State.FLYING
					vel = _aim_dir() * fly_speed
					life = 0.0
			State.FLYING:
				life += delta
				global_position += vel * delta
				rotation = vel.angle() + PI * 0.5
				_update_trail()
				_check_hits()
				if life > 1.6 or not _in_world():
					_finish()
		queue_redraw()

	func _aim_dir() -> Vector2:
		if target and is_instance_valid(target) and not target.is_dead:
			return (target.center() - global_position).normalized()
		return Vector2(fallback_dir, 0.0)

	func _in_world() -> bool:
		if skill == null or not is_instance_valid(skill):
			return false
		var a = skill.arena
		if a == null:
			return false
		return global_position.x > a.WORLD_LEFT - 200.0 and global_position.x < a.WORLD_RIGHT + 200.0 \
			and global_position.y > -600.0 and global_position.y < a.GROUND_Y + 300.0

	func _update_trail() -> void:
		if _trail == null or not is_instance_valid(_trail):
			return
		_trail.add_point(global_position)
		while _trail.get_point_count() > 16:
			_trail.remove_point(0)

	func _check_hits() -> void:
		if skill == null or not is_instance_valid(skill):
			return
		for e in skill.enemies():
			if _hit.has(e.get_instance_id()):
				continue
			if not e.body_rect().grow(6.0).has_point(global_position):
				continue
			_hit[e.get_instance_id()] = true       # 穿透：同一目標只打一次
			skill.sword_hit(e, vel.normalized())
			Fx.spark(get_parent(), global_position, Color(1, 0.95, 0.7), 30.0)
			Fx.particles(get_parent(), global_position, {
				"amount": 10, "lifetime": 0.35, "vmin": 100.0, "vmax": 300.0, "spread": 180.0,
				"direction": -vel.normalized(), "gravity": Vector2(0, 600),
				"smin": 0.1, "smax": 0.3, "texture": Fx.tex_square(), "additive": true,
				"colors": [Color(1, 1, 0.85, 1), Color(1, 0.7, 0.2, 0)],
			})

	func _finish() -> void:
		state = State.DONE
		if _trail and is_instance_valid(_trail):
			var tw := _trail.create_tween()
			tw.tween_property(_trail, "modulate:a", 0.0, 0.25)
			tw.tween_callback(_trail.queue_free)
		queue_free()

	func _draw() -> void:
		# 劍身朝「上」（-Y），由 rotation 決定實際指向
		var blade := PackedVector2Array([
			Vector2(0, -46), Vector2(4.5, -30), Vector2(4.0, 6), Vector2(-4.0, 6), Vector2(-4.5, -30),
		])
		var blade_hi := PackedVector2Array([
			Vector2(0, -44), Vector2(1.8, -28), Vector2(1.6, 4), Vector2(-0.6, 4), Vector2(-0.8, -28),
		])
		var guard := PackedVector2Array([
			Vector2(-13, 6), Vector2(13, 6), Vector2(11, 12), Vector2(-11, 12),
		])
		var grip := PackedVector2Array([
			Vector2(-3, 12), Vector2(3, 12), Vector2(3, 26), Vector2(-3, 26),
		])
		var pommel_c := Vector2(0, 28)

		# 銀白刃身 + 金色鑲邊（純銀白在泛光下會整片糊掉，靠金邊把輪廓拉回來）
		draw_colored_polygon(blade, Color(0.72, 0.76, 0.86, 0.98))
		draw_colored_polygon(blade_hi, Color(0.98, 0.99, 1.0, 0.85))
		draw_polyline(blade + PackedVector2Array([blade[0]]),
			Color(col.r, col.g * 0.82, col.b * 0.3, 1.0), 2.2, true)
		# 金黃護手與握柄
		draw_colored_polygon(guard, Color(col.r, col.g * 0.86, col.b * 0.35, 1.0))
		draw_colored_polygon(grip, Color(0.35, 0.28, 0.2, 1.0))
		draw_circle(pommel_c, 4.2, Color(col.r, col.g * 0.9, col.b * 0.4, 1.0))

		# 待命時的靈氣光暈
		if state == State.ORBIT:
			var pulse: float = 0.25 + sin(_spawn_t * 6.0 + orbit_angle) * 0.12
			draw_circle(Vector2(0, -18), 22.0, Color(col.r, col.g, col.b, pulse * 0.4))
