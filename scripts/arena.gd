class_name Arena
extends Node2D
##
## 對戰場（1v1）。
## 由 main.gd 建立，負責：世界建構、雙方生成、相機（含震屏）、勝負判定。
## 主畫面／選元素／結算畫面都在 main.gd，這裡只管一場對戰。
##

signal battle_over(player_won: bool)

## 對戰模式：單機（對手為 AI）／連線主機／連線客戶端
enum Mode { SOLO, NET_HOST, NET_CLIENT }

## 姿勢在網路上以索引傳送
const POSES := ["idle", "walk", "air", "hurt", "punch", "punch_up", "cast",
	"slam", "charge", "dash", "cast_hold"]

const WORLD_LEFT := 0.0
const WORLD_RIGHT := 1900.0
const GROUND_Y := 600.0

const PLATFORMS := [
	# [中心 x, 頂面 y, 寬度]
	[430.0, 430.0, 240.0],
	[1180.0, 400.0, 260.0],
	[810.0, 268.0, 190.0],
]

var fx_back: Node2D            # 角色底下的特效層
var fx_front: Node2D           # 角色上方的特效層
var camera: Camera2D
var player: Player
## 對手：單機模式是 Enemy（AI），連線模式是由網路驅動的 Player，故不加型別註記
var opponent = null

var fighters: Array[Fighter] = []
var finished := false
var intro_t := 0.0             # 開場倒數（此期間雙方無法行動）
var mode: int = Mode.SOLO

var _shake_amount := 0.0
var _shake_time := 0.0
var _shake_total := 0.01
var _bg_t := 0.0


func _ready() -> void:
	_build_environment()
	_build_world()
	_build_layers()
	_build_camera()


## 由 main.gd 呼叫：開始一場對戰
func start_battle(player_element: String, opponent_element: String,
		difficulty := 1.0, battle_mode: int = Mode.SOLO) -> void:
	mode = battle_mode

	player = Player.new()
	player.name = "Player"
	player.arena = self
	player.input_enabled = false
	add_child(player)
	player.global_position = Vector2(430.0, GROUND_Y)
	player.equip_element(player_element)
	player.died.connect(_on_fighter_died)
	fighters.append(player)

	if mode == Mode.SOLO:
		var ai := Enemy.new()
		ai.name = "Opponent"
		ai.arena = self
		add_child(ai)
		ai.configure(opponent_element, difficulty)
		ai.target = player
		ai.ai_enabled = false
		opponent = ai
	else:
		# 連線：對手也是一隻 Player，只是輸入來源不同
		var human := Player.new()
		human.name = "Opponent"
		human.arena = self
		human.team = 1
		add_child(human)
		human.equip_element(opponent_element)
		human.skin = Game.skin_data(Net.foe_skin)
		human.body_color = human.skin.get("body", Color(1, 0.6, 0.6))
		human.input_source = Player.InputSource.REMOTE if mode == Mode.NET_HOST \
			else Player.InputSource.NONE
		opponent = human

	opponent.global_position = Vector2(1470.0, GROUND_Y)
	opponent.facing = -1
	opponent.died.connect(_on_fighter_died)
	fighters.append(opponent)

	# 客戶端：兩邊都是傀儡，血量與位置一律以主機快照為準
	if mode == Mode.NET_CLIENT:
		for f in [player, opponent]:
			f.net_puppet = true
			f.net_remote = true
			f.net_target_pos = f.global_position
	if mode != Mode.SOLO:
		Net.arena = self

	camera.position = Vector2(950, 380)
	intro_t = 1.6


# ------------------------------------------------------------------ 連線同步
func apply_remote_input(axis: float, jump: bool, punch: bool, m0: bool, m1: bool, m2: bool) -> void:
	if mode != Mode.NET_HOST or opponent == null or not is_instance_valid(opponent):
		return
	if opponent.has_method("push_remote_input"):
		opponent.push_remote_input(axis, jump, punch, m0, m1, m2)


func _pose_index(p: String) -> int:
	var i := POSES.find(p)
	return i if i >= 0 else 0


func collect_snapshot():
	if player == null or not is_instance_valid(player):
		return null
	if opponent == null or not is_instance_valid(opponent):
		return null
	var out := []
	for f in [player, opponent]:
		out.append_array([
			f.global_position.x, f.global_position.y,
			float(f.facing), float(_pose_index(f.pose)), f.hp,
			f.burn_time, f.freeze_time, f.slow_time, float(f.poison_stacks),
			f.damage_reduction,
		])
	out.append(intro_t)
	return out


func apply_snapshot(snap: Array) -> void:
	if snap.size() < 21:
		return
	var list := [player, opponent]
	for i in 2:
		var f = list[i]
		if f == null or not is_instance_valid(f):
			continue
		var b := i * 10
		f.net_target_pos = Vector2(snap[b], snap[b + 1])
		f.facing = int(snap[b + 2])
		f.set_pose(POSES[int(snap[b + 3])], 0.2)
		f.hp = snap[b + 4]
		f.burn_time = snap[b + 5]
		f.freeze_time = snap[b + 6]
		f.slow_time = snap[b + 7]
		f.poison_stacks = int(snap[b + 8])
		f.damage_reduction = snap[b + 9]
		if f.hp <= 0.0 and not f.is_dead:
			f._die()
	intro_t = snap[20]


## 客戶端收到「對方放招」→ 在本地播放同一招（純特效，傷害由主機判定）
func play_remote_cast(who: int, move_index: int) -> void:
	var f = player if who == 0 else opponent
	if f == null or not is_instance_valid(f):
		return
	if move_index < 0 or move_index >= f.moves.size():
		return
	var m = f.moves[move_index]
	if is_instance_valid(m):
		m.cooldown = 0.0
		m._recover = 0.0
		m._use()


func finish_from_net(player_won: bool) -> void:
	if finished:
		return
	finished = true
	if player and is_instance_valid(player):
		player.input_enabled = false
	battle_over.emit(player_won)


# ------------------------------------------------------------------ 泛光
## 2D 畫布泛光：所有 ADD 混色的招式特效會自動溢光。
## background_canvas_max_layer 留 0 → 只有世界會發光，UI（CanvasLayer）不受影響。
func _build_environment() -> void:
	var env := Environment.new()
	env.background_mode = Environment.BG_CANVAS
	env.background_canvas_max_layer = 0
	env.glow_enabled = true
	env.glow_intensity = 1.15
	env.glow_strength = 1.05
	env.glow_bloom = 0.22
	env.glow_blend_mode = Environment.GLOW_BLEND_MODE_ADDITIVE
	env.glow_hdr_threshold = 0.72
	env.glow_hdr_scale = 2.2
	env.set_glow_level(1, 0.9)
	env.set_glow_level(2, 1.0)
	env.set_glow_level(3, 0.85)
	env.set_glow_level(4, 0.55)
	env.set_glow_level(5, 0.3)

	var we := WorldEnvironment.new()
	we.name = "WorldEnvironment"
	we.environment = env
	add_child(we)


# ------------------------------------------------------------------ 世界
func _build_world() -> void:
	var ground := StaticBody2D.new()
	ground.name = "Ground"
	var cs := CollisionShape2D.new()
	var rect := RectangleShape2D.new()
	rect.size = Vector2(WORLD_RIGHT - WORLD_LEFT + 400.0, 200.0)
	cs.shape = rect
	cs.position = Vector2((WORLD_LEFT + WORLD_RIGHT) * 0.5, GROUND_Y + 100.0)
	ground.add_child(cs)
	add_child(ground)

	for p in PLATFORMS:
		var body := StaticBody2D.new()
		var s := CollisionShape2D.new()
		var r := RectangleShape2D.new()
		r.size = Vector2(p[2], 22.0)
		s.shape = r
		s.position = Vector2(p[0], p[1] + 11.0)
		body.add_child(s)
		add_child(body)

	for x in [WORLD_LEFT - 30.0, WORLD_RIGHT + 30.0]:
		var wall := StaticBody2D.new()
		var s2 := CollisionShape2D.new()
		var r2 := RectangleShape2D.new()
		r2.size = Vector2(60.0, 1600.0)
		s2.shape = r2
		s2.position = Vector2(x, GROUND_Y - 700.0)
		wall.add_child(s2)
		add_child(wall)


func _build_layers() -> void:
	fx_back = Node2D.new()
	fx_back.name = "FxBack"
	fx_back.z_index = 3
	add_child(fx_back)

	fx_front = Node2D.new()
	fx_front.name = "FxFront"
	fx_front.z_index = 15
	add_child(fx_front)


func _build_camera() -> void:
	camera = Camera2D.new()
	camera.name = "Camera"
	camera.position = Vector2(950, 380)
	camera.limit_left = int(WORLD_LEFT - 40.0)
	camera.limit_right = int(WORLD_RIGHT + 40.0)
	camera.limit_top = -400
	camera.limit_bottom = int(GROUND_Y + 130.0)
	camera.position_smoothing_enabled = false
	add_child(camera)
	camera.make_current()


# ------------------------------------------------------------------ 每幀
func _process(delta: float) -> void:
	_bg_t += delta
	if intro_t > 0.0:
		intro_t -= delta
		# 倒數期間雙方都不能動（否則對手會在「3、2、1」時就先出手）
		var go := intro_t <= 0.0
		if opponent and is_instance_valid(opponent):
			# 單機的對手是 Enemy（有 ai_enabled），連線的對手是 Player（有 input_enabled）
			if opponent is Enemy:
				opponent.ai_enabled = go
			else:
				opponent.input_enabled = go
		if go and player and is_instance_valid(player):
			player.input_enabled = true
	_update_camera(delta)
	queue_redraw()


## 相機同時框住雙方：中點為目標，距離越遠拉得越遠
func _update_camera(delta: float) -> void:
	var pts: Array[Vector2] = []
	if player and is_instance_valid(player) and not player.is_dead:
		pts.append(player.global_position)
	if opponent and is_instance_valid(opponent) and not opponent.is_dead:
		pts.append(opponent.global_position)

	if pts.size() > 0:
		var mid := Vector2.ZERO
		for p in pts:
			mid += p
		mid /= float(pts.size())
		var target := mid + Vector2(0, -150.0)
		camera.position = camera.position.lerp(target, clampf(delta * 4.0, 0.0, 1.0))

		var spread := 0.0
		if pts.size() == 2:
			spread = absf(pts[0].x - pts[1].x)
		var want_zoom: float = clampf(1.0 - (spread - 600.0) / 2600.0, 0.72, 1.0)
		camera.zoom = camera.zoom.lerp(Vector2(want_zoom, want_zoom), clampf(delta * 3.0, 0.0, 1.0))

	if _shake_time > 0.0:
		_shake_time -= delta
		var k: float = clampf(_shake_time / _shake_total, 0.0, 1.0)
		var amp := _shake_amount * k
		camera.offset = Vector2(randf_range(-amp, amp), randf_range(-amp, amp))
	else:
		camera.offset = camera.offset.lerp(Vector2.ZERO, clampf(delta * 12.0, 0.0, 1.0))


func shake(amount: float, duration := 0.25) -> void:
	if amount >= _shake_amount * clampf(_shake_time / maxf(_shake_total, 0.001), 0.0, 1.0):
		_shake_amount = amount
		_shake_time = duration
		_shake_total = maxf(duration, 0.001)


# ------------------------------------------------------------------ 勝負
## 由 Fighter.use_move 呼叫：主機把「誰放了第幾招」廣播給客戶端播特效
func notify_cast(who: Fighter, move_index: int) -> void:
	if mode != Mode.NET_HOST:
		return
	Net.broadcast_cast(0 if who == player else 1, move_index)


func _on_fighter_died(who: Fighter) -> void:
	if finished:
		return
	# 客戶端不自行判定勝負，等主機通知
	if mode == Mode.NET_CLIENT:
		return
	if mode == Mode.NET_HOST:
		Net.broadcast_over(who != player)
	finished = true
	shake(14.0, 0.5)
	var player_won := who != player
	if player and is_instance_valid(player):
		player.input_enabled = false
	# 慢動作特寫，再回報結果
	Engine.time_scale = 0.35
	var tm := get_tree().create_timer(0.7, true, false, true)
	tm.timeout.connect(func():
		Engine.time_scale = 1.0
		battle_over.emit(player_won)
	)


# ------------------------------------------------------------------ 查詢
func fighters_of_other_team(team: int) -> Array:
	var out := []
	var still: Array[Fighter] = []
	for f in fighters:
		if not is_instance_valid(f):
			continue
		still.append(f)
		if f.team != team and not f.is_dead:
			out.append(f)
	fighters = still
	return out


## 取得某個 x 座標下方最近的落腳面 y（冰刺、岩漿帶、地刺用）
func ground_y_at(x: float) -> float:
	var best := GROUND_Y
	var ref_y := GROUND_Y
	if player and is_instance_valid(player):
		ref_y = player.global_position.y
	for p in PLATFORMS:
		var half: float = p[2] * 0.5
		if x < p[0] - half or x > p[0] + half:
			continue
		var top: float = p[1]
		if top >= ref_y - 8.0 and top < best:
			best = top
	return best


# ------------------------------------------------------------------ 背景繪製
func _draw() -> void:
	var top := -420.0
	var bottom := GROUND_Y + 140.0
	var left := WORLD_LEFT - 60.0
	var right := WORLD_RIGHT + 60.0

	var bands := 24
	for i in bands:
		var u := float(i) / float(bands - 1)
		var y0: float = lerpf(top, GROUND_Y, u)
		var y1: float = lerpf(top, GROUND_Y, u + 1.0 / float(bands - 1))
		var c := Color(0.05, 0.06, 0.11).lerp(Color(0.16, 0.13, 0.26), u)
		draw_rect(Rect2(left, y0, right - left, y1 - y0 + 2.0), c)

	_draw_mountains(GROUND_Y, 190.0, 320.0, Color(0.10, 0.11, 0.20), 0.0)
	_draw_mountains(GROUND_Y, 120.0, 230.0, Color(0.14, 0.14, 0.26), 137.0)

	for i in 60:
		var sx: float = fposmod(float(i) * 173.0 + sin(float(i)) * 40.0, right - left) + left
		var sy: float = top + fposmod(float(i) * 97.0, GROUND_Y - top - 200.0)
		var tw: float = 0.35 + 0.35 * sin(_bg_t * 1.7 + float(i))
		draw_circle(Vector2(sx, sy), 1.4, Color(1, 1, 1, tw * 0.5))

	draw_rect(Rect2(left, GROUND_Y, right - left, bottom - GROUND_Y), Color(0.11, 0.12, 0.16))
	draw_line(Vector2(left, GROUND_Y), Vector2(right, GROUND_Y), Color(0.35, 0.4, 0.55), 3.0)
	for i in int((right - left) / 46.0):
		var gx := left + float(i) * 46.0
		draw_line(Vector2(gx, GROUND_Y + 6.0), Vector2(gx - 14.0, bottom), Color(0.16, 0.17, 0.23), 1.5)

	for p in PLATFORMS:
		var half: float = p[2] * 0.5
		var r := Rect2(p[0] - half, p[1], p[2], 22.0)
		draw_rect(r, Color(0.15, 0.16, 0.22))
		draw_line(Vector2(r.position.x, r.position.y), Vector2(r.end.x, r.position.y),
			Color(0.4, 0.45, 0.6), 3.0)
		draw_rect(Rect2(r.position.x, r.position.y + 22.0, p[2], 6.0), Color(0.08, 0.09, 0.13, 0.6))


func _draw_mountains(base_y: float, min_h: float, max_h: float, col: Color, phase: float) -> void:
	var left := WORLD_LEFT - 60.0
	var right := WORLD_RIGHT + 60.0
	var pts := PackedVector2Array([Vector2(left, base_y)])
	var step := 150.0
	var x := left
	var i := 0
	while x < right:
		var h: float = lerpf(min_h, max_h, absf(sin((x + phase) * 0.0031 + float(i) * 1.7)))
		pts.append(Vector2(x + step * 0.5, base_y - h))
		x += step
		i += 1
	pts.append(Vector2(right, base_y))
	draw_colored_polygon(pts, col)
