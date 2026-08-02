class_name SkillPoison
extends Skill
##
## ☠️ 劇毒 —— 【魔元·毒沼引爆】（售價 1000 金幣）
##
## 機制（二段式）：
##   第一段：在腳下創造紫色毒沼，踏入的敵人持續疊加毒素。
##   第二段：毒沼存在期間再按一次技能鍵 → 引爆毒素，
##           對所有帶毒目標造成「每層 2.5% 最大血量」的傷害。
##
## 特效（純 GDScript）：
##   1. 毒沼氣泡：以多邊形近似的半透明紫色橢圓（Fx.ellipse），
##      區域內隨機生成向上飄浮、逐漸放大的紫色圓形氣泡（draw_circle），破裂時噴小粒子。
##   2. 毒氣瀰漫：CPUParticles2D，gravity = Vector2(0, -20)，顏色為深紫混薄荷綠。
##

const SWAMP_LIFE := 8.0
const STACK_INTERVAL := 0.45
const TICK_DAMAGE := 2.5
const PERCENT_PER_STACK := 0.025      # 每層引爆傷害 = 2.5% 最大血量

var _swamp = null              # Swamp（內部類別，不加型別註記避免前向參照）


func _on_setup() -> void:
	id = "poison"
	cd_max = 3.0
	color = Game.element_color(id)
	stage_label = "布毒"


func can_use() -> bool:
	# 毒沼存在時，引爆不需要等冷卻（但仍要過施放後搖）
	if _swamp != null and is_instance_valid(_swamp) and _swamp.armed:
		return _recover <= 0.0
	return super()


func _use() -> void:
	if _swamp != null and is_instance_valid(_swamp) and _swamp.armed:
		_detonate()
		return
	_deploy()


func _deploy() -> void:
	user.set_pose("slam", 0.4)
	user.control_lock = 0.2

	_swamp = Swamp.new()
	_swamp.global_position = Vector2(user.global_position.x, arena.ground_y_at(user.global_position.x))
	_swamp.col = color
	_swamp.skill = self
	_swamp.life = SWAMP_LIFE
	_swamp.stack_interval = STACK_INTERVAL
	arena.fx_back.add_child(_swamp)

	stage = 1
	stage_label = "引爆"
	start_cooldown()


func _detonate() -> void:
	var center: Vector2 = _swamp.global_position
	user.set_pose("cast", 0.3)

	var victims := []
	for e in enemies():
		if e.poison_stacks > 0:
			victims.append(e)

	for e in victims:
		var dmg: float = e.max_hp * PERCENT_PER_STACK * float(e.poison_stacks)
		var dir := signf(e.center().x - center.x)
		if dir == 0.0:
			dir = 1.0
		e.take_damage(dmg, Vector2(dir * 220.0, -420.0), {"color": color, "stun": 0.25})
		e.poison_stacks = 0
		e.poison_time = 0.0

		var blast := Blast.new()
		blast.global_position = e.center()
		blast.col = color
		arena.fx_front.add_child(blast)
		Fx.speed_lines(arena.fx_back, e.center(), Color(0.85, 0.55, 1.0), 140.0, 16, 0.26)
		Fx.curl(arena.fx_front, e.center(), Color(0.6, 1.0, 0.7), 26.0, -1.0, 0.4)

	# 毒沼本體也爆開
	var blast2 := Blast.new()
	blast2.global_position = center + Vector2(0, -20)
	blast2.col = color
	blast2.radius = 150.0
	arena.fx_front.add_child(blast2)

	Fx.particles(arena.fx_front, center + Vector2(0, -10), {
		"amount": 60, "lifetime": 0.9, "vmin": 120.0, "vmax": 430.0, "spread": 180.0,
		"direction": Vector2(0, -1), "gravity": Vector2(0, 260),
		"smin": 0.2, "smax": 0.7, "additive": true,
		"colors": [Color(0.9, 0.7, 1.0, 1.0), Color(0.62, 0.25, 0.95, 0.85),
			Color(0.35, 0.9, 0.6, 0.5), Color(0.2, 0.05, 0.35, 0.0)],
	})

	_swamp.queue_free()
	_swamp = null
	stage = 0
	stage_label = "布毒"
	cooldown = cd_max
	shake(10.0, 0.3)


func _tick(_delta: float) -> void:
	if _swamp != null and not is_instance_valid(_swamp):
		_swamp = null
		stage = 0
		stage_label = "布毒"


## 由 Swamp 呼叫：對站在沼中的敵人疊毒
func poison_tick(area: Rect2) -> void:
	for e in enemies():
		if not e.body_rect().intersects(area):
			continue
		e.take_damage(TICK_DAMAGE, Vector2.ZERO, {
			"color": color, "poison": 1, "silent": true, "slow": [0.5, 0.7],
		})


func _dispose() -> void:
	if _swamp != null and is_instance_valid(_swamp):
		_swamp.queue_free()


# ================================================================== 特效節點

## 毒沼：橢圓池 + 上浮氣泡 + 毒氣粒子
class Swamp extends Node2D:
	var col := Color(0.68, 0.32, 0.95)
	var skill = null            # 施放者的 SkillPoison（不加型別註記以避免自我參照）
	var rx := 130.0
	var ry := 30.0
	var t := 0.0
	var life := 8.0
	var stack_interval := 0.45
	var armed := false
	var _bubbles: Array = []          # [本地座標, 半徑, 生命, 最大生命]
	var _bubble_t := 0.0
	var _stack_t := 0.0
	var _gas: CPUParticles2D

	func _ready() -> void:
		z_index = 2
		scale = Vector2(0.2, 0.2)
		var tw := create_tween()
		tw.set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_BACK)
		tw.tween_property(self, "scale", Vector2.ONE, 0.28)
		tw.tween_callback(_arm)

		# 毒氣：向上緩慢瀰漫（gravity 為負）
		_gas = Fx.particles(self, Vector2(0, -6), {
			"amount": 46, "lifetime": 1.8, "one_shot": false, "explosiveness": 0.0,
			"direction": Vector2(0, -1), "spread": 30.0,
			"vmin": 6.0, "vmax": 26.0, "gravity": Vector2(0, -20),
			"smin": 0.3, "smax": 1.0, "radius": 110.0,
			"shape": CPUParticles2D.EMISSION_SHAPE_SPHERE, "auto_free": false,
			"colors": [Color(0.45, 0.12, 0.6, 0.0), Color(0.6, 0.25, 0.85, 0.45),
				Color(0.4, 0.85, 0.55, 0.25), Color(0.25, 0.5, 0.35, 0.0)],
		})
		_gas.emission_rect_extents = Vector2(rx, ry * 0.6)
		_gas.emission_shape = CPUParticles2D.EMISSION_SHAPE_RECTANGLE

	func _arm() -> void:
		armed = true

	func _process(delta: float) -> void:
		t += delta
		if t >= life:
			_gas.emitting = false
			armed = false
			var tw := create_tween()
			tw.tween_property(self, "scale", Vector2(0.1, 0.1), 0.4)
			tw.parallel().tween_property(self, "modulate:a", 0.0, 0.4)
			tw.tween_callback(queue_free)
			set_process(false)
			return

		# 疊毒判定
		_stack_t += delta
		if _stack_t >= stack_interval and armed:
			_stack_t = 0.0
			if skill and is_instance_valid(skill):
				skill.poison_tick(Rect2(global_position - Vector2(rx, ry + 40.0),
					Vector2(rx * 2.0, ry + 60.0)))

		# 氣泡生成
		_bubble_t += delta
		if _bubble_t >= 0.09:
			_bubble_t = 0.0
			var a := randf() * TAU
			var r := sqrt(randf())
			_bubbles.append([
				Vector2(cos(a) * rx * r, sin(a) * ry * r + 2.0),
				randf_range(3.0, 9.0),
				0.0,
				randf_range(0.6, 1.2),
			])

		var alive := []
		for b in _bubbles:
			b[2] += delta
			b[0].y -= delta * 22.0
			if b[2] < b[3]:
				alive.append(b)
			else:
				_pop(b[0])
		_bubbles = alive
		queue_redraw()

	func _pop(local_pos: Vector2) -> void:
		Fx.particles(self, local_pos, {
			"amount": 5, "lifetime": 0.35, "vmin": 20.0, "vmax": 70.0, "spread": 180.0,
			"direction": Vector2(0, -1), "gravity": Vector2(0, -40),
			"smin": 0.08, "smax": 0.2,
			"colors": [Color(0.85, 0.6, 1.0, 0.8), Color(0.4, 0.9, 0.6, 0)],
		})

	func _draw() -> void:
		var pulse := 1.0 + sin(t * 3.0) * 0.02
		# 沼澤本體：三層橢圓
		draw_colored_polygon(Fx.ellipse(Vector2.ZERO, rx * pulse, ry * pulse, 40),
			Color(0.28, 0.06, 0.42, 0.72))
		draw_colored_polygon(Fx.ellipse(Vector2(0, -1), rx * 0.86, ry * 0.82, 36),
			Color(col.r * 0.75, col.g * 0.4, col.b * 0.9, 0.7))
		draw_colored_polygon(Fx.ellipse(Vector2(0, -2), rx * 0.55, ry * 0.55, 30),
			Color(0.5, 0.95, 0.65, 0.22))
		draw_polyline(Fx.ellipse(Vector2.ZERO, rx * pulse, ry * pulse, 40)
			+ PackedVector2Array([Vector2(rx * pulse, 0)]),
			Color(0.8, 0.55, 1.0, 0.6), 2.0, true)

		# 氣泡
		for b in _bubbles:
			var k: float = b[2] / b[3]
			var r: float = b[1] * (0.5 + k * 1.3)
			var a: float = (1.0 - k * 0.5) * 0.55
			draw_circle(b[0], r, Color(0.62, 0.3, 0.9, a))
			draw_circle(b[0] + Vector2(-r * 0.3, -r * 0.3), r * 0.3, Color(0.9, 0.8, 1.0, a * 0.8))

		# 準備引爆時的警示環
		if armed:
			var w := 1.5 + sin(t * 8.0) * 1.0
			draw_polyline(Fx.ellipse(Vector2.ZERO, rx + 8.0, ry + 5.0, 40)
				+ PackedVector2Array([Vector2(rx + 8.0, 0)]),
				Color(1.0, 0.5, 0.9, 0.35), w, true)


## 引爆：紫色毒素爆炸
class Blast extends Node2D:
	var col := Color(0.68, 0.32, 0.95)
	var radius := 90.0
	var life := 0.4
	var t := 0.0
	var _spikes: Array[float] = []

	func _ready() -> void:
		z_index = 22
		var mat := CanvasItemMaterial.new()
		mat.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
		material = mat
		for i in 14:
			_spikes.append(randf_range(0.55, 1.0))

	func _process(delta: float) -> void:
		t += delta
		if t >= life:
			queue_free()
			return
		queue_redraw()

	func _draw() -> void:
		var k: float = clampf(t / life, 0.0, 1.0)
		var a := 1.0 - k
		var r: float = radius * ease(k, 0.4)
		# 不規則毒雲
		var pts := PackedVector2Array()
		for i in _spikes.size():
			var ang := TAU * float(i) / float(_spikes.size())
			pts.append(Vector2(cos(ang), sin(ang)) * r * _spikes[i])
		draw_colored_polygon(pts, Color(col.r, col.g * 0.6, col.b, a * 0.55))
		draw_colored_polygon(Fx.star(Vector2.ZERO, 6, r * 0.8, r * 0.3, t * 3.0),
			Color(0.6, 1.0, 0.7, a * 0.4))
		draw_circle(Vector2.ZERO, r * 0.35, Color(1, 0.9, 1, a * 0.7))
