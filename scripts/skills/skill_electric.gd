class_name SkillElectric
extends Skill
##
## ⚡ 雷電 —— 【電光·極速伏特】
##
## 機制：火柴人化為電光，向前方進行「Z」字型三次高速折返衝刺，最後爆發打擊。
##       被命中的敵人進入 0.5 秒麻痺硬直。
##
## 特效（純 GDScript）：
##   1. 閃電線條：_draw() + draw_polyline()，以 randf_range() 在起訖點之間生成折點，
##      畫出鋸齒狀的亮藍／金色閃電，每 0.04 秒重新抽一次亂數形狀（電流跳動感）。
##   2. 粒子殘影：CPUParticles2D 的 initial_velocity 設為 0，讓金黃色粒子停留在
##      軌跡上緩慢淡出，Blend Mode 設為 ADD。另外沿路留下火柴人骨架殘影。
##

const SEG_TIME := 0.085          # 每段衝刺耗時
const SEG_LEN := 165.0           # 每段水平距離
const ZIG := 78.0                # Z 字上下振幅
const DASH_DAMAGE := 12.0
const BURST_DAMAGE := 26.0
const BURST_RADIUS := 105.0

var _dashing := false
var _points: PackedVector2Array = []
var _seg := 0
var _seg_t := 0.0
var _hit: Dictionary = {}
var _afterimage_t := 0.0
var _trail_particles: CPUParticles2D


func _on_setup() -> void:
	id = "electric"
	cd_max = 1.6
	color = Game.element_color(id)


func can_use() -> bool:
	return super() and not _dashing


func _use() -> void:
	var origin := user.global_position
	var f := signf(float(user.facing))
	_points = PackedVector2Array([origin])
	var ground_y := origin.y
	for i in 3:
		var up: float = -1.0 if i % 2 == 0 else 1.0
		var p := _points[i] + Vector2(f * SEG_LEN, up * ZIG)
		# 不要衝到地板底下
		p.y = minf(p.y, ground_y)
		p.x = clampf(p.x, arena.WORLD_LEFT + 30.0, arena.WORLD_RIGHT - 30.0)
		_points.append(p)

	_dashing = true
	_seg = 0
	_seg_t = 0.0
	_hit.clear()
	_afterimage_t = 0.0

	user.set_pose("dash", SEG_TIME * 3.0 + 0.15)
	user.control_lock = SEG_TIME * 3.0 + 0.05
	user.super_armor = SEG_TIME * 3.0 + 0.2
	user.invuln = SEG_TIME * 3.0
	user.velocity = Vector2.ZERO

	# 軌跡閃電
	var bolt := Bolt.new()
	bolt.points = _points
	bolt.col = color
	arena.fx_front.add_child(bolt)

	# 停在原地慢慢淡出的殘留電粒子（initial_velocity = 0 + ADD）
	_trail_particles = Fx.particles(arena.fx_back, Vector2.ZERO, {
		"amount": 90, "lifetime": 0.55, "one_shot": false, "explosiveness": 0.0,
		"vmin": 0.0, "vmax": 0.0, "gravity": Vector2.ZERO,
		"smin": 0.15, "smax": 0.55, "radius": 26.0,
		"shape": CPUParticles2D.EMISSION_SHAPE_SPHERE,
		"additive": true, "auto_free": false,
		"colors": [Color(1.0, 0.95, 0.5, 1.0), Color(0.4, 0.75, 1.0, 0.6), Color(0.3, 0.5, 1.0, 0.0)],
	})
	_trail_particles.global_position = origin

	start_cooldown()
	shake(4.0, 0.15)


func _tick(delta: float) -> void:
	if not _dashing:
		return

	_seg_t += delta
	var a := _points[_seg]
	var b := _points[_seg + 1]
	var k: float = clampf(_seg_t / SEG_TIME, 0.0, 1.0)
	var pos := a.lerp(b, ease(k, 0.6))

	user.global_position = pos
	user.velocity = Vector2.ZERO
	if _trail_particles and is_instance_valid(_trail_particles):
		_trail_particles.global_position = pos

	# 殘影
	_afterimage_t += delta
	if _afterimage_t >= 0.022:
		_afterimage_t = 0.0
		user.spawn_afterimage(Color(1.0, 0.92, 0.35, 0.75), 0.28)

	# 沿途擦過的敵人
	for e in enemies_in_circle(pos + Vector2(0, -40), 46.0):
		if _hit.has(e.get_instance_id()):
			continue
		_hit[e.get_instance_id()] = true
		e.take_damage(DASH_DAMAGE, Vector2(signf(float(user.facing)) * 180.0, -160.0), {
			"color": color, "stun": 0.18,
		})

	if k >= 1.0:
		_seg += 1
		_seg_t = 0.0
		if _seg >= 3:
			_finish(b)


func _finish(at: Vector2) -> void:
	_dashing = false
	user.velocity = Vector2(signf(float(user.facing)) * 120.0, -120.0)
	if _trail_particles and is_instance_valid(_trail_particles):
		_trail_particles.emitting = false
		Fx.autofree(_trail_particles, 0.8)
		_trail_particles = null

	# 終擊：範圍爆發 + 0.5 秒麻痺
	var burst_at := at + Vector2(0, -40)
	for e in enemies_in_circle(burst_at, BURST_RADIUS):
		e.take_damage(BURST_DAMAGE, Vector2(signf(float(user.facing)) * 320.0, -300.0), {
			"color": color, "stun": 0.5,
		})

	var burst := Burst.new()
	burst.global_position = burst_at
	burst.col = color
	arena.fx_front.add_child(burst)

	Fx.shockwave(arena.fx_front, burst_at, BURST_RADIUS * 1.15, Color(0.6, 0.85, 1.0, 0.9), 0.3)
	Fx.speed_lines(arena.fx_back, burst_at, Color(1.0, 0.95, 0.55), 190.0, 22, 0.28)
	Fx.particles(arena.fx_front, burst_at, {
		"amount": 40, "lifetime": 0.45, "vmin": 180.0, "vmax": 520.0, "spread": 180.0,
		"direction": Vector2(1, 0), "gravity": Vector2(0, 200), "smin": 0.15, "smax": 0.45,
		"texture": Fx.tex_shard(), "additive": true,
		"colors": [Color(1, 1, 0.8, 1), Color(0.35, 0.7, 1, 0)],
	})
	shake(11.0, 0.28)


func _dispose() -> void:
	if _trail_particles and is_instance_valid(_trail_particles):
		_trail_particles.queue_free()


# ================================================================== 特效節點

## 沿著 Z 字路徑亂數抽點畫出的鋸齒閃電
class Bolt extends Node2D:
	var points: PackedVector2Array
	var col := Color(1, 0.9, 0.2)
	var life := 0.42
	var t := 0.0
	var _shape_t := 0.0
	var _cache: Array[PackedVector2Array] = []
	var _forks: Array[PackedVector2Array] = []
	var _rng := RandomNumberGenerator.new()

	func _ready() -> void:
		var mat := CanvasItemMaterial.new()
		mat.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
		material = mat
		z_index = 20
		_regen()

	func _regen() -> void:
		_cache.clear()
		# 主幹 + 兩條較細的分岔電流
		for layer in 3:
			var line := PackedVector2Array()
			for i in range(points.size() - 1):
				var seg := Fx.jagged(points[i] + Vector2(0, -40), points[i + 1] + Vector2(0, -40),
					9, 10.0 + layer * 9.0, _rng)
				if i > 0:
					seg.remove_at(0)
				line.append_array(seg)
			_cache.append(line)
		# 從主幹隨機節點岔出的短支流，讓電光更有「雷之呼吸」的爆裂感
		_forks.clear()
		var trunk := _cache[0]
		for i in 9:
			var at: int = _rng.randi_range(1, maxi(1, trunk.size() - 2))
			var origin := trunk[at]
			var ang := _rng.randf_range(0.0, TAU)
			var len_ := _rng.randf_range(26.0, 74.0)
			_forks.append(Fx.jagged(origin, origin + Vector2(cos(ang), sin(ang)) * len_,
				4, 9.0, _rng))

	func _process(delta: float) -> void:
		t += delta
		_shape_t += delta
		if _shape_t >= 0.04:
			_shape_t = 0.0
			_regen()
		if t >= life:
			queue_free()
			return
		queue_redraw()

	func _draw() -> void:
		var a: float = clampf(1.0 - t / life, 0.0, 1.0)
		# 外層藍色光暈 → 內層金白核心
		draw_polyline(_cache[2], Color(0.3, 0.55, 1.0, a * 0.35), 14.0, true)
		draw_polyline(_cache[1], Color(0.55, 0.8, 1.0, a * 0.6), 7.0, true)
		for fk in _forks:
			draw_polyline(fk, Color(0.7, 0.88, 1.0, a * 0.5), 3.0, true)
			draw_polyline(fk, Color(1.0, 1.0, 0.9, a * 0.8), 1.2, true)
		draw_polyline(_cache[0], Color(1.0, 1.0, 0.85, a), 2.6, true)


## 終擊爆發：放射狀電弧
class Burst extends Node2D:
	var col := Color(1, 0.9, 0.2)
	var life := 0.3
	var t := 0.0
	var _arcs: Array[PackedVector2Array] = []
	var _rng := RandomNumberGenerator.new()

	func _ready() -> void:
		var mat := CanvasItemMaterial.new()
		mat.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
		material = mat
		z_index = 21
		for i in 12:
			var ang := TAU * float(i) / 12.0 + _rng.randf_range(-0.2, 0.2)
			var len_ := _rng.randf_range(70.0, 130.0)
			_arcs.append(Fx.jagged(Vector2.ZERO, Vector2(cos(ang), sin(ang)) * len_, 6, 14.0, _rng))

	func _process(delta: float) -> void:
		t += delta
		if t >= life:
			queue_free()
			return
		queue_redraw()

	func _draw() -> void:
		var k := t / life
		var a := 1.0 - k
		for arc in _arcs:
			draw_polyline(arc, Color(0.6, 0.85, 1.0, a * 0.7), 5.0, true)
			draw_polyline(arc, Color(1, 1, 0.9, a), 1.8, true)
		draw_circle(Vector2.ZERO, 26.0 * (1.0 + k * 1.5), Color(1, 1, 0.9, a * 0.55))
