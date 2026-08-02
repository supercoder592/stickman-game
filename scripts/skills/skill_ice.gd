class_name SkillIce
extends Skill
##
## 🧊 冰霜 —— 【極寒·地表冰刺】（售價 750 金幣）
##
## 機制：手掌擊地，前方地面順序刺出 3~5 道巨大冰柱，被刺中的敵人凍結 1.5 秒無法移動。
##
## 特效（純 GDScript）：
##   1. 冰晶生成：draw_colored_polygon() 動態生成尖銳多邊形頂點（藍白色 0.8/0.95/1.0），
##      用 create_tween() 讓 scale.y 在 0.1 秒內由 0 拉到 1，呈現突刺感。
##   2. 冰屑碎裂：冰柱消失時在頂點釋放帶重力的白色方形小粒子。
##

const SPIKE_COUNT := 5
const SPIKE_GAP := 78.0
const SPIKE_DELAY := 0.06
const DAMAGE := 18.0
const FREEZE := 1.5

var _pending: Array = []          # [剩餘延遲, 生成位置]


func _on_setup() -> void:
	id = "ice"
	cd_max = 2.4
	color = Game.element_color(id)


func _use() -> void:
	user.set_pose("slam", 0.45)
	user.control_lock = 0.25
	user.velocity.x = 0.0

	var f := signf(float(user.facing))
	var base := user.global_position
	_pending.clear()
	for i in SPIKE_COUNT:
		var x := base.x + f * (72.0 + float(i) * SPIKE_GAP)
		x = clampf(x, arena.WORLD_LEFT + 20.0, arena.WORLD_RIGHT - 20.0)
		_pending.append([float(i) * SPIKE_DELAY, Vector2(x, arena.ground_y_at(x))])

	Fx.shockwave(arena.fx_back, base, 90.0, Color(0.7, 0.92, 1.0, 0.85), 0.3, 0.35)
	Fx.particles(arena.fx_back, base, {
		"amount": 18, "lifetime": 0.5, "vmin": 60.0, "vmax": 200.0, "spread": 55.0,
		"direction": Vector2(f, -0.6).normalized(), "gravity": Vector2(0, 700),
		"smin": 0.15, "smax": 0.4, "texture": Fx.tex_square(),
		"colors": [Color(1, 1, 1, 0.9), Color(0.6, 0.85, 1.0, 0)],
	})
	start_cooldown()
	shake(6.0, 0.2)


func _tick(delta: float) -> void:
	if _pending.is_empty():
		return
	var still := []
	for entry in _pending:
		entry[0] -= delta
		if entry[0] > 0.0:
			still.append(entry)
			continue
		_spawn_spike(entry[1])
	_pending = still


func _spawn_spike(at: Vector2) -> void:
	var s := Spike.new()
	s.global_position = at
	s.col = color
	s.height = randf_range(96.0, 136.0)
	s.width = randf_range(26.0, 38.0)
	arena.fx_front.add_child(s)

	var hit := enemies_in_circle(at + Vector2(0, -s.height * 0.5), s.width * 0.9)
	for e in hit:
		e.take_damage(DAMAGE, Vector2(0, -240.0), {
			"color": color, "freeze": FREEZE,
		})
	if hit.size() > 0:
		Fx.speed_lines(arena.fx_back, at + Vector2(0, -s.height * 0.6),
			Color(0.85, 0.97, 1.0), 120.0, 14, 0.24)

	# 地面霜華：貼地擴散的冰紋
	var frost := Frost.new()
	frost.col = color
	frost.global_position = at
	arena.fx_back.add_child(frost)

	Fx.particles(arena.fx_front, at, {
		"amount": 12, "lifetime": 0.45, "vmin": 90.0, "vmax": 260.0, "spread": 60.0,
		"direction": Vector2(0, -1), "gravity": Vector2(0, 900),
		"smin": 0.12, "smax": 0.3, "texture": Fx.tex_square(),
		"colors": [Color(0.95, 1, 1, 1), Color(0.6, 0.85, 1.0, 0)],
	})


# ================================================================== 特效節點

## 地面霜華：以冰柱為中心向外擴散的六向冰紋（乘龍「絕對零度」的地面殘留）
class Frost extends Node2D:
	var col := Color(0.8, 0.95, 1.0)
	var life := 1.6
	var t := 0.0
	var _branches: Array[float] = []

	func _ready() -> void:
		z_index = 2
		var mat := CanvasItemMaterial.new()
		mat.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
		material = mat
		for i in 7:
			_branches.append(randf_range(0.6, 1.0))

	func _process(delta: float) -> void:
		t += delta
		if t >= life:
			queue_free()
			return
		queue_redraw()

	func _draw() -> void:
		var k: float = clampf(t / life, 0.0, 1.0)
		var grow: float = ease(clampf(t / 0.28, 0.0, 1.0), 0.4)
		var a := (1.0 - k * k) * 0.7
		draw_set_transform(Vector2.ZERO, 0.0, Vector2(1.0, 0.3))
		draw_circle(Vector2.ZERO, 62.0 * grow, Color(col.r, col.g, col.b, a * 0.16))
		for i in _branches.size():
			var ang := TAU * float(i) / float(_branches.size())
			var d := Vector2(cos(ang), sin(ang))
			var len_: float = 78.0 * grow * _branches[i]
			draw_line(Vector2.ZERO, d * len_, Color(col.r, col.g, col.b, a * 0.8), 2.6, true)
			# 每條主枝再長出兩根小分枝，做出結霜的樹枝狀
			for s in 2:
				var at: float = len_ * (0.45 + 0.28 * float(s))
				var off := 0.55 - float(s) * 0.15
				var sub := len_ * (0.3 - float(s) * 0.1)
				draw_line(d * at, d * at + d.rotated(off) * sub, Color(col.r, col.g, col.b, a * 0.55), 1.6, true)
				draw_line(d * at, d * at + d.rotated(-off) * sub, Color(col.r, col.g, col.b, a * 0.55), 1.6, true)
		draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


## 一根冰柱：尖銳多邊形 + scale.y tween 突刺 + 消失時噴出冰屑
class Spike extends Node2D:
	var col := Color(0.8, 0.95, 1.0)
	var height := 110.0
	var width := 32.0
	var t := 0.0
	var hold := 1.4
	var _dying := false
	var _shape: PackedVector2Array
	var _facets: Array[PackedVector2Array] = []

	func _ready() -> void:
		z_index = 12
		_build_shape()
		scale.y = 0.0
		# 0.1 秒內由 0 拉高 → 突刺感
		var tw := create_tween()
		tw.set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_BACK)
		tw.tween_property(self, "scale:y", 1.0, 0.1)

	func _build_shape() -> void:
		var w := width * 0.5
		_shape = PackedVector2Array([
			Vector2(-w, 0),
			Vector2(-w * 0.78, -height * 0.42),
			Vector2(-w * 0.34, -height * 0.72),
			Vector2(randf_range(-4, 4), -height),          # 尖端
			Vector2(w * 0.42, -height * 0.66),
			Vector2(w * 0.86, -height * 0.36),
			Vector2(w, 0),
		])
		# 內部反光切面
		_facets.append(PackedVector2Array([
			Vector2(-w * 0.3, -2), Vector2(-w * 0.12, -height * 0.85),
			Vector2(w * 0.2, -height * 0.55), Vector2(w * 0.34, -4),
		]))
		_facets.append(PackedVector2Array([
			Vector2(w * 0.42, -6), Vector2(w * 0.3, -height * 0.5), Vector2(w * 0.78, -height * 0.2),
		]))

	func _process(delta: float) -> void:
		t += delta
		if not _dying and t >= hold:
			_dying = true
			_shatter()
		queue_redraw()

	func _shatter() -> void:
		# 冰屑：白色方形小粒子，帶重力向下掉落
		Fx.particles(get_parent(), global_position + Vector2(0, -height), {
			"amount": 22, "lifetime": 0.7, "vmin": 40.0, "vmax": 230.0, "spread": 180.0,
			"direction": Vector2(0, -1), "gravity": Vector2(0, 1100),
			"smin": 0.12, "smax": 0.38, "texture": Fx.tex_square(),
			"spin_min": -6.0, "spin_max": 6.0,
			"colors": [Color(1, 1, 1, 1), Color(0.75, 0.9, 1.0, 0.9), Color(0.6, 0.8, 1.0, 0)],
		})
		var tw := create_tween()
		tw.set_ease(Tween.EASE_IN).set_trans(Tween.TRANS_QUAD)
		tw.tween_property(self, "scale:y", 0.0, 0.22)
		tw.parallel().tween_property(self, "modulate:a", 0.0, 0.22)
		tw.tween_callback(queue_free)

	func _draw() -> void:
		# 主體（半透明冰藍）
		draw_colored_polygon(_shape, Color(col.r, col.g, col.b, 0.82))
		# 內部切面高光
		for f in _facets:
			draw_colored_polygon(f, Color(1, 1, 1, 0.28))
		# 輪廓
		var outline := _shape + PackedVector2Array([_shape[0]])
		draw_polyline(outline, Color(0.95, 1.0, 1.0, 0.95), 2.2, true)
		# 底部寒氣
		draw_circle(Vector2(0, -4), width * 0.75, Color(0.7, 0.9, 1.0, 0.15))
