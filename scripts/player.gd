class_name Player
extends Fighter
##
## 玩家角色。
## 為了不依賴 project.godot 的 InputMap（避免專案設定出錯），
## 這裡直接讀取實體鍵盤按鍵狀態。
##
## 操作：A/D 移動、W 跳躍、J 普攻、U/I/O（或 1/2/3）三個元素招式。
##

const PUNCH_CD := 0.34
const PUNCH_DAMAGE := 13.0
const COYOTE := 0.1

## 輸入來源：
##   LOCAL  = 這台機器的鍵盤／觸控
##   REMOTE = 由網路對手推進來（主機端用來驅動客戶端角色）
##   NONE   = 完全不吃輸入（客戶端上的傀儡）
enum InputSource { LOCAL, REMOTE, NONE }

var punch_cd := 0.0
var input_enabled := true
var input_source: int = InputSource.LOCAL

# 這一幀的輸入意圖（無論來源為何，控制邏輯都只讀這些欄位）
var in_axis := 0.0
var in_jump_held := false
var _in_jump_edge := false
var _in_punch_edge := false
var _in_move_edge := [false, false, false]

var _coyote := 0.0
var _jump_buffer := 0.0
var _punch_t := -1.0


func _ready() -> void:
	max_hp = 200.0
	move_speed = 300.0
	jump_speed = 660.0
	team = 0
	skin = Game.current_skin()
	body_color = skin.get("body", Color(0.95, 0.97, 1.0))
	super()


# ------------------------------------------------------------------ 輸入蒐集
## 由主機呼叫，把客戶端送來的輸入灌進來
func push_remote_input(axis: float, jump: bool, punch: bool, m0: bool, m1: bool, m2: bool) -> void:
	in_axis = axis
	in_jump_held = jump
	if jump:
		_jump_buffer = 0.12
	if punch:
		_in_punch_edge = true
	if m0:
		_in_move_edge[0] = true
	if m1:
		_in_move_edge[1] = true
	if m2:
		_in_move_edge[2] = true


## 觸控／虛擬搖桿也走這裡（由 TouchControls 呼叫）
func push_touch_axis(axis: float, jump_held: bool) -> void:
	in_axis = axis
	in_jump_held = jump_held


func press_jump() -> void:
	_jump_buffer = 0.12
	in_jump_held = true


func press_punch() -> void:
	_in_punch_edge = true


func press_move(i: int) -> void:
	if i >= 0 and i < 3:
		_in_move_edge[i] = true


func _gather_local_input() -> void:
	var dir := 0.0
	if Input.is_key_pressed(KEY_A) or Input.is_key_pressed(KEY_LEFT):
		dir -= 1.0
	if Input.is_key_pressed(KEY_D) or Input.is_key_pressed(KEY_RIGHT):
		dir += 1.0
	# 鍵盤沒有輸入時保留觸控搖桿推進來的值
	if dir != 0.0:
		in_axis = dir
	if Input.is_key_pressed(KEY_W) or Input.is_key_pressed(KEY_UP) or Input.is_key_pressed(KEY_SPACE):
		in_jump_held = true


## 消化這一幀累積的按鍵邊緣事件
func _consume_edges() -> void:
	if _in_punch_edge:
		_in_punch_edge = false
		_punch()
	for i in 3:
		if _in_move_edge[i]:
			_in_move_edge[i] = false
			use_move(i)


# ------------------------------------------------------------------ 操作
func _control(delta: float) -> void:
	if not input_enabled or input_source == InputSource.NONE:
		velocity.x = move_toward(velocity.x, 0.0, 2000.0 * delta)
		in_axis = 0.0
		return

	if input_source == InputSource.LOCAL:
		_gather_local_input()

	var dir := in_axis
	var accel: float = 2400.0 if is_on_floor() else 1500.0
	if dir != 0.0:
		velocity.x = move_toward(velocity.x, dir * effective_speed(), accel * delta)
		facing = int(signf(dir))
	else:
		var friction: float = 2600.0 if is_on_floor() else 700.0
		velocity.x = move_toward(velocity.x, 0.0, friction * delta)

	# 跳躍（含土狼時間與預輸入緩衝）
	if is_on_floor():
		_coyote = COYOTE
	else:
		_coyote = maxf(0.0, _coyote - delta)
	_jump_buffer = maxf(0.0, _jump_buffer - delta)

	var jump_held := in_jump_held
	if jump_held and _jump_buffer > 0.0 and _coyote > 0.0:
		velocity.y = -jump_speed
		_coyote = 0.0
		_jump_buffer = 0.0
		if arena:
			Fx.particles(arena.fx_back, global_position, {
				"amount": 8, "lifetime": 0.3, "vmin": 40.0, "vmax": 120.0, "spread": 70.0,
				"direction": Vector2(0, 1), "gravity": Vector2(0, 300), "smin": 0.1, "smax": 0.3,
				"colors": [Color(1, 1, 1, 0.5), Color(1, 1, 1, 0)],
			})
	# 可變跳躍高度
	if not jump_held and velocity.y < -150.0:
		velocity.y = -150.0

	# 下落加速，手感較俐落
	if velocity.y > 0.0:
		velocity.y += 700.0 * delta

	# 本地輸入每幀重置，觸控／遠端則由推送方負責維持
	if input_source == InputSource.LOCAL:
		in_jump_held = false


func _physics_process(delta: float) -> void:
	punch_cd = maxf(0.0, punch_cd - delta)
	if net_remote and input_source == InputSource.LOCAL:
		# 連線客戶端：讀本地輸入但不在本地執行，送給主機由它模擬
		_gather_local_input()
		Net.send_input(in_axis, in_jump_held, _in_punch_edge,
			_in_move_edge[0], _in_move_edge[1], _in_move_edge[2])
		_in_punch_edge = false
		_in_move_edge = [false, false, false]
		in_jump_held = false
	elif input_enabled and input_source != InputSource.NONE:
		_consume_edges()
	if _punch_t >= 0.0:
		_punch_t += delta
		if _punch_t >= 0.09:
			_punch_t = -1.0
			_punch_hit()
	tick_moves(delta)
	super(delta)


func _unhandled_input(event: InputEvent) -> void:
	if is_dead or not input_enabled or input_source != InputSource.LOCAL:
		return
	var k := event as InputEventKey
	if k == null or not k.pressed or k.echo:
		return
	match k.keycode:
		KEY_W, KEY_UP, KEY_SPACE:
			_jump_buffer = 0.12
		KEY_J, KEY_K:
			_in_punch_edge = true
		KEY_U, KEY_1:
			_in_move_edge[0] = true
		KEY_I, KEY_2:
			_in_move_edge[1] = true
		KEY_O, KEY_3:
			_in_move_edge[2] = true


func _punch() -> void:
	if punch_cd > 0.0 or not can_act():
		return
	punch_cd = PUNCH_CD
	_punch_t = 0.0
	set_pose("punch", 0.22)
	if is_on_floor():
		velocity.x = signf(float(facing)) * 90.0


func _punch_hit() -> void:
	if arena == null:
		return
	var f := signf(float(facing))
	var origin := global_position + Vector2(f * 40.0, -46.0)
	var rect_x: float = -46.0 if f < 0.0 else -6.0
	var rect := Rect2(origin + Vector2(rect_x, -26.0), Vector2(52.0, 52.0))
	var hit := false
	for e in arena.fighters_of_other_team(team):
		if e.body_rect().intersects(rect):
			e.take_damage(PUNCH_DAMAGE, Vector2(f * 260.0, -180.0), {"color": Color(1, 1, 1), "stun": 0.1})
			hit = true
	if hit:
		Fx.spark(arena.fx_front, origin, Color(1, 1, 1), 24.0)
		arena.shake(3.0, 0.1)
	else:
		Fx.particles(arena.fx_front, origin, {
			"amount": 5, "lifetime": 0.2, "vmin": 60.0, "vmax": 160.0, "spread": 40.0,
			"direction": Vector2(f, 0), "gravity": Vector2(0, 400), "smin": 0.08, "smax": 0.2,
			"colors": [Color(1, 1, 1, 0.4), Color(1, 1, 1, 0)],
		})
