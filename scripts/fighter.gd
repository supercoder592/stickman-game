class_name Fighter
extends CharacterBody2D
##
## 火柴人戰鬥單位基底：移動、狀態異常、受擊、繪製。
## 玩家（Player）與敵人（Enemy）都繼承這個類別。
##

const GRAVITY := 1500.0
const MAX_FALL := 1400.0

## 前幾招不吃冷卻（見 equip_element）
const FREE_MOVE_COUNT := 2

## 全域擊退倍率。調高讓命中更有「打飛」的份量感。
const KNOCKBACK_SCALE := 1.5

signal died(who: Fighter)

@export var max_hp := 100.0

var hp := 100.0
var move_speed := 265.0
var jump_speed := 620.0
var facing := 1
var team := 0                     # 0 = 玩家陣營，1 = 敵人陣營
var body_color := Color(0.92, 0.94, 1.0)
var is_dead := false
## Arena 主場景。刻意不加型別註記：靜態分析不認得 Node2D 上的自訂成員
## （fx_front / shake() / ground_y_at() …），加了註記反而會編譯失敗。
var arena = null

# --- 控制與無敵 ---
var control_lock := 0.0           # > 0 時無法自行操作（衝刺、蓄力中）
var super_armor := 0.0            # > 0 時不會被擊退／硬直（霸體）
var invuln := 0.0
var damage_reduction := 0.0       # 0~1，護盾／護甲類招式使用
var dr_time := 0.0

# --- 狀態異常 ---
var stun_time := 0.0              # 麻痺硬直
var freeze_time := 0.0            # 冰凍
var burn_time := 0.0
var burn_dps := 0.0
var slow_time := 0.0
var slow_factor := 1.0
var poison_stacks := 0
var poison_time := 0.0

# --- 表現 ---
## 元素與三招（玩家與對手共用同一套機制）
var element_id := ""
var moves: Array = []

## 造型（Game.SKINS 的一筆）。空字典時使用預設外觀。
var skin: Dictionary = {}

## --- 連線 ---
## net_puppet：傷害只播特效，血量／狀態一律以主機快照為準（避免雙重扣血）。
## net_remote：位置與速度由快照驅動，不跑本地控制邏輯。
var net_puppet := false
var net_remote := false
var net_target_pos := Vector2.ZERO

var hit_flash := 0.0
var walk_phase := 0.0
var _trail_t := 0.0
var pose := "idle"
var pose_time := 0.0
var pose_hold := 0.0              # 姿勢鎖定剩餘秒數
var _status_particles: CPUParticles2D


func _ready() -> void:
	hp = max_hp
	_make_collision()
	_make_status_particles()
	_make_skin_particles()
	z_index = 5


func _make_collision() -> void:
	var col := CollisionShape2D.new()
	var rect := RectangleShape2D.new()
	rect.size = Vector2(26, 74)
	col.shape = rect
	col.position = Vector2(0, -37)
	add_child(col)


## 發光類造型在戰鬥中持續散發元素微粒，讓花錢買的造型在場上看得出來
func _make_skin_particles() -> void:
	if not skin.get("glow", false):
		return
	var accent: Color = skin.get("accent", body_color)
	var p := Fx.particles(self, Vector2(0, -42), {
		"amount": 22, "lifetime": 0.9, "one_shot": false, "explosiveness": 0.0,
		"direction": Vector2(0, -1), "spread": 40.0,
		"vmin": 6.0, "vmax": 32.0, "gravity": Vector2(0, -34),
		"smin": 0.1, "smax": 0.3, "radius": 22.0,
		"shape": CPUParticles2D.EMISSION_SHAPE_SPHERE,
		"auto_free": false, "additive": true,
		"colors": [Color(accent.r, accent.g, accent.b, 0.75),
			Color(accent.r, accent.g, accent.b, 0.0)],
	})
	p.z_index = -1


func _make_status_particles() -> void:
	_status_particles = Fx.particles(self, Vector2(0, -40), {
		"amount": 18, "lifetime": 0.5, "one_shot": false, "explosiveness": 0.0,
		"vmin": 10.0, "vmax": 40.0, "gravity": Vector2(0, -120),
		"smin": 0.15, "smax": 0.4, "radius": 16.0,
		"shape": CPUParticles2D.EMISSION_SHAPE_SPHERE,
		"additive": true, "auto_free": false,
		"colors": [Color(1, 0.8, 0.2, 0.9), Color(1, 0.2, 0, 0)],
	})
	_status_particles.emitting = false


# ------------------------------------------------------------------ 主迴圈
func _physics_process(delta: float) -> void:
	if is_dead:
		return
	_tick_timers(delta)
	_tick_dots(delta)

	# 網路傀儡：位置直接內插到主機給的座標，不跑重力與控制
	if net_remote:
		global_position = global_position.lerp(net_target_pos, clampf(delta * 18.0, 0.0, 1.0))
		_update_pose(delta)
		_update_trail(delta)
		queue_redraw()
		return

	if not is_on_floor():
		velocity.y = minf(velocity.y + GRAVITY * delta, MAX_FALL)

	if freeze_time > 0.0 or stun_time > 0.0 or control_lock > 0.0:
		# 被控制中：只保留慣性與摩擦
		velocity.x = move_toward(velocity.x, 0.0, 900.0 * delta)
		if freeze_time > 0.0:
			velocity.x = 0.0
	else:
		_control(delta)

	move_and_slide()
	_update_pose(delta)
	_update_trail(delta)
	queue_redraw()


## 部分造型在高速移動時會留下殘影
func _update_trail(delta: float) -> void:
	if not skin.get("trail", false) or arena == null:
		return
	if absf(velocity.x) < 190.0 and absf(velocity.y) < 260.0:
		return
	_trail_t += delta
	if _trail_t < 0.045:
		return
	_trail_t = 0.0
	var accent: Color = skin.get("accent", body_color)
	spawn_afterimage(Color(accent.r, accent.g, accent.b, 0.4), 0.22)


## 子類別覆寫：實際的操作邏輯
func _control(_delta: float) -> void:
	pass


# ------------------------------------------------------------------ 元素招式
## 依元素 id 建立三個招式實例（招式一為本命招）。
func equip_element(new_id: String) -> void:
	for m in moves:
		if is_instance_valid(m):
			m.dispose()
	moves.clear()
	element_id = new_id
	_refresh_look()
	if new_id == "" or not Game.ELEMENTS.has(new_id):
		return
	var classes := Movesets.for_element(new_id)
	for i in classes.size():
		var sk = classes[i].new()
		sk.name = "Move%d_%s" % [i + 1, new_id]
		add_child(sk)
		sk.setup(self, arena)
		sk.move_index = i          # setup() 之後再覆寫，確保索引正確
		# 招式一、二為攻擊招，取消冷卻（只保留一點後搖）；
		# 招式三清一色是防禦／增益／大範圍招，維持冷卻以免破壞平衡。
		if i < FREE_MOVE_COUNT:
			sk.cd_max = 0.0
			sk.cooldown = 0.0
			sk.recovery = maxf(sk.recovery, 0.26)
		moves.append(sk)


## 子類別覆寫：元素改變時重新組出外觀（顏色跟著元素走）
func _refresh_look() -> void:
	pass


func tick_moves(delta: float) -> void:
	for m in moves:
		if is_instance_valid(m):
			m.tick(delta)


func can_act() -> bool:
	return not is_dead and control_lock <= 0.0 and stun_time <= 0.0 and freeze_time <= 0.0


func use_move(index: int) -> bool:
	if index < 0 or index >= moves.size() or not can_act():
		return false
	var m = moves[index]
	if not is_instance_valid(m):
		return false
	var ok: bool = m.try_use()
	if ok and arena and arena.has_method("notify_cast"):
		arena.notify_cast(self, index)
	return ok


func _tick_timers(delta: float) -> void:
	control_lock = maxf(0.0, control_lock - delta)
	super_armor = maxf(0.0, super_armor - delta)
	invuln = maxf(0.0, invuln - delta)
	stun_time = maxf(0.0, stun_time - delta)
	freeze_time = maxf(0.0, freeze_time - delta)
	slow_time = maxf(0.0, slow_time - delta)
	hit_flash = maxf(0.0, hit_flash - delta * 4.0)
	pose_time += delta
	pose_hold = maxf(0.0, pose_hold - delta)
	if slow_time <= 0.0:
		slow_factor = 1.0
	dr_time = maxf(0.0, dr_time - delta)
	if dr_time <= 0.0:
		damage_reduction = 0.0


func _tick_dots(delta: float) -> void:
	# 灼燒
	if burn_time > 0.0:
		burn_time -= delta
		take_damage(burn_dps * delta, Vector2.ZERO, {"silent": true, "color": Color(1, 0.5, 0.1)})
	# 毒素堆疊自然衰減
	if poison_time > 0.0:
		poison_time -= delta
		if poison_time <= 0.0:
			poison_stacks = 0
	_update_status_particles()


func _update_status_particles() -> void:
	if _status_particles == null:
		return
	if burn_time > 0.0:
		_status_particles.emitting = true
		_status_particles.color_ramp = Fx.ramp([Color(1, 0.85, 0.25, 0.9), Color(1, 0.2, 0, 0)])
	elif poison_stacks > 0:
		_status_particles.emitting = true
		_status_particles.color_ramp = Fx.ramp([Color(0.7, 0.35, 1.0, 0.8), Color(0.4, 1.0, 0.6, 0)])
	else:
		_status_particles.emitting = false


func _update_pose(delta: float) -> void:
	if pose_hold > 0.0:
		return
	var new_pose := "idle"
	if freeze_time > 0.0 or stun_time > 0.0:
		new_pose = "hurt"
	elif not is_on_floor():
		new_pose = "air"
	elif absf(velocity.x) > 20.0:
		new_pose = "walk"
	set_pose(new_pose, 0.0)
	walk_phase += delta * (6.0 + absf(velocity.x) * 0.03)


func set_pose(p: String, hold := 0.25) -> void:
	if pose != p:
		pose = p
		pose_time = 0.0
	pose_hold = maxf(pose_hold, hold)


# ------------------------------------------------------------------ 受擊
## opts: {"stun": 秒, "freeze": 秒, "burn": [秒, dps], "slow": [秒, 倍率],
##        "poison": 疊層, "silent": 不跳數字, "color": 特效顏色, "ignore_armor": bool}
func take_damage(amount: float, knockback := Vector2.ZERO, opts: Dictionary = {}) -> void:
	if is_dead:
		return
	var silent: bool = opts.get("silent", false)
	if invuln > 0.0 and not silent:
		return
	var col: Color = opts.get("color", Color(1, 1, 1))
	if damage_reduction > 0.0:
		amount *= (1.0 - clampf(damage_reduction, 0.0, 0.9))

	# 連線的客戶端：只播打擊特效，血量與位移交給主機快照決定
	if net_puppet:
		if not silent and arena:
			hit_flash = 1.0
			Fx.damage_text(arena.fx_front, global_position + Vector2(0, -84), amount, col)
			Fx.spark(arena.fx_front, global_position + Vector2(0, -40), col, 22.0)
		return

	hp -= amount

	if not silent:
		hit_flash = 1.0
		if arena:
			Fx.damage_text(arena.fx_front, global_position + Vector2(0, -84), amount, col)
			Fx.spark(arena.fx_front, global_position + Vector2(0, -40), col, 22.0)
			# 重擊追加：頓幀 + 白閃 + 放射狀火花，讓打擊有份量
			if amount >= 18.0:
				arena.hitstop(clampf(amount / 420.0, 0.03, 0.11))
				Fx.impact_flash(arena.fx_front, center(), col, amount)
				Fx.particles(arena.fx_front, center(), {
					"amount": int(clampf(amount * 0.6, 8, 26)), "lifetime": 0.4,
					"vmin": 140.0, "vmax": 420.0, "spread": 180.0,
					"direction": Vector2(signf(knockback.x), -0.3), "gravity": Vector2(0, 700),
					"smin": 0.12, "smax": 0.4, "additive": true,
					"colors": [Color(1, 1, 1, 1), Color(col.r, col.g, col.b, 0.7),
						Color(col.r, col.g, col.b, 0.0)],
				})

	var armored: bool = super_armor > 0.0 and not opts.get("ignore_armor", false)
	if not armored:
		if knockback != Vector2.ZERO:
			velocity = knockback * KNOCKBACK_SCALE
			# 被打飛時短暫失去控制，讓擊退真的推得動
			control_lock = maxf(control_lock, minf(0.28, knockback.length() / 2600.0))
		if opts.has("stun"):
			stun_time = maxf(stun_time, float(opts["stun"]))
		if opts.has("freeze"):
			freeze_time = maxf(freeze_time, float(opts["freeze"]))
			interrupt()

	# DoT 類狀態即使霸體也會附著
	if opts.has("burn"):
		var b: Array = opts["burn"]
		burn_time = maxf(burn_time, float(b[0]))
		burn_dps = maxf(burn_dps, float(b[1]))
	if opts.has("slow"):
		var s: Array = opts["slow"]
		slow_time = maxf(slow_time, float(s[0]))
		slow_factor = minf(slow_factor, float(s[1]))
	if opts.has("poison"):
		poison_stacks = mini(20, poison_stacks + int(opts["poison"]))
		poison_time = 6.0

	if hp <= 0.0:
		_die()


## 打斷目前動作（水龍咆哮、冰凍等）
func interrupt() -> void:
	control_lock = 0.0
	pose_hold = 0.0


func heal(amount: float) -> void:
	hp = minf(max_hp, hp + amount)


func _die() -> void:
	if is_dead:
		return
	is_dead = true
	hp = 0.0
	set_pose("hurt", 999.0)
	if arena:
		Fx.particles(arena.fx_front, global_position + Vector2(0, -40), {
			"amount": 26, "lifetime": 0.7, "vmin": 80.0, "vmax": 260.0, "spread": 180.0,
			"direction": Vector2(0, -1), "smin": 0.2, "smax": 0.5,
			"colors": [Color(body_color.r, body_color.g, body_color.b, 0.9), Color(0.2, 0.2, 0.3, 0)],
		})
	died.emit(self)
	var tw := create_tween()
	tw.tween_property(self, "modulate:a", 0.0, 0.45)
	tw.tween_callback(queue_free)


# ------------------------------------------------------------------ 查詢
func body_rect() -> Rect2:
	return Rect2(global_position + Vector2(-13, -74), Vector2(26, 74))


func center() -> Vector2:
	return global_position + Vector2(0, -40)


func effective_speed() -> float:
	return move_speed * slow_factor


func current_joints() -> Dictionary:
	return StickFigure.joints(pose, pose_time, walk_phase, facing, not is_on_floor())


func spawn_afterimage(col: Color, life := 0.3) -> void:
	if arena == null:
		return
	var a := StickFigure.Afterimage.new()
	a.joints_data = current_joints()
	a.global_position = global_position
	a.col = col
	a.life = life
	a.skin = skin
	a.width = float(skin.get("width", 5.0))
	arena.fx_back.add_child(a)


# ------------------------------------------------------------------ 繪製
func _draw() -> void:
	var col := body_color
	if freeze_time > 0.0:
		col = col.lerp(Color(0.55, 0.85, 1.0), 0.65)
	if stun_time > 0.0:
		col = col.lerp(Color(1.0, 0.95, 0.4), 0.5)
	if hit_flash > 0.0:
		col = col.lerp(Color(1, 1, 1), clampf(hit_flash, 0.0, 1.0))

	var j := current_joints()

	# 影子
	draw_set_transform(Vector2.ZERO, 0.0, Vector2(1, 0.32))
	draw_circle(Vector2(0, 6), 17.0, Color(0, 0, 0, 0.22))
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)

	var width: float = skin.get("width", 5.0)
	StickFigure.draw_figure(self, j, col, width, 0.55, skin, walk_phase)

	# 面向指示（眼睛）。骷髏頭與面甲自帶五官，就不再畫。
	var head_style: String = skin.get("head", "circle")
	if head_style != "skull" and head_style != "helm":
		var eye: Vector2 = j["head"] + Vector2(4.5 * signf(j["facing"]), -1.5)
		draw_circle(eye, 1.8, Color(0.08, 0.08, 0.12, 0.9))

	if freeze_time > 0.0:
		_draw_ice_encasing()
	if poison_stacks > 0:
		_draw_poison_marks()
	_draw_health_bar()


func _draw_ice_encasing() -> void:
	var pts := PackedVector2Array([
		Vector2(-20, -2), Vector2(-24, -44), Vector2(-13, -84),
		Vector2(3, -90), Vector2(21, -78), Vector2(25, -30), Vector2(17, -2),
	])
	draw_colored_polygon(pts, Color(0.6, 0.85, 1.0, 0.32))
	draw_polyline(pts + PackedVector2Array([pts[0]]), Color(0.85, 0.97, 1.0, 0.8), 2.0, true)


func _draw_poison_marks() -> void:
	for i in mini(poison_stacks, 8):
		var a := TAU * float(i) / 8.0 + float(Time.get_ticks_msec()) * 0.001
		var p := Vector2(cos(a) * 20.0, -42.0 + sin(a) * 26.0)
		draw_circle(p, 2.6, Color(0.75, 0.35, 1.0, 0.75))


func _draw_health_bar() -> void:
	if is_dead:
		return
	var w := 44.0
	var y := -96.0
	var ratio: float = clampf(hp / max_hp, 0.0, 1.0)
	draw_rect(Rect2(-w * 0.5 - 1, y - 1, w + 2, 6), Color(0, 0, 0, 0.55))
	var bar_col: Color = Color(0.35, 0.9, 0.45) if team == 0 else Color(0.95, 0.35, 0.35)
	draw_rect(Rect2(-w * 0.5, y, w * ratio, 4), bar_col)
