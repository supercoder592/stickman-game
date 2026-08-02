class_name Enemy
extends Fighter
##
## 對手火柴人（1v1）。
## 擁有和玩家完全相同的三招元素招式，會依距離挑選合適的招式：
##   近距離 → 突進／近戰型（招式一）
##   中距離 → 彈道型（招式二）
##   任何距離 → 增益／場域型（招式三，冷卻好就放）
##
## AI 難度由 reaction（決策間隔）與 aggression（施放意願）控制。
##

enum AI { CHASE, WINDUP, RECOVER, KEEP_DISTANCE }

const ATTACK_RANGE := 64.0
const WINDUP_TIME := 0.28
const RECOVER_TIME := 0.5
const ATTACK_DAMAGE := 11.0

var target: Fighter
var ai_enabled := true          # 開場倒數期間與截圖工具會關掉
var state: int = AI.CHASE
var state_t := 0.0
var reaction := 0.55
var aggression := 0.7
var preferred_range := 250.0

var _jump_cd := 0.0
var _decide_t := 0.0
var _strafe := 1.0
var _strafe_t := 0.0


func _ready() -> void:
	team = 1
	body_color = Color(1.0, 0.45, 0.45)
	max_hp = 200.0
	move_speed = 250.0
	jump_speed = 620.0
	super()
	_strafe = 1.0 if randf() < 0.5 else -1.0


## 由 Arena 呼叫，設定對手的元素與強度
func configure(element: String, difficulty := 1.0) -> void:
	equip_element(element)
	# 對手固定是「鬼」的外型（骷髏臉 + 雙角），再依元素染色以便辨識
	var ec := Game.element_color(element)
	body_color = ec.lerp(Color(1, 0.5, 0.5), 0.35)
	# 對手固定是「鬼」的外型，並和玩家一樣戴上元素色拳套
	skin = {
		"body": body_color, "accent": ec,
		"head": "horned", "hands": "basic", "chest": "haori",
		"width": 5.5, "build": 1.06, "limb_w": 1.1, "glow": false, "trail": false,
	}
	max_hp = 200.0
	hp = max_hp
	move_speed = 230.0 + 40.0 * difficulty
	reaction = clampf(0.75 - 0.25 * difficulty, 0.22, 0.9)
	aggression = clampf(0.45 + 0.35 * difficulty, 0.3, 0.95)


func _physics_process(delta: float) -> void:
	_jump_cd = maxf(0.0, _jump_cd - delta)
	_strafe_t = maxf(0.0, _strafe_t - delta)
	tick_moves(delta)
	super(delta)


func _control(delta: float) -> void:
	if not ai_enabled or target == null or not is_instance_valid(target) or target.is_dead:
		velocity.x = move_toward(velocity.x, 0.0, 1200.0 * delta)
		return

	state_t += delta
	var to_target := target.global_position - global_position
	var dist := absf(to_target.x)
	if dist > 1.0:
		facing = int(signf(to_target.x))

	_think(delta, dist, to_target)

	match state:
		AI.CHASE:
			if dist > ATTACK_RANGE:
				var want := signf(to_target.x) * effective_speed()
				if _strafe_t <= 0.0 and dist < 140.0:
					want += _strafe * 50.0
				velocity.x = move_toward(velocity.x, want, 1400.0 * delta)
			else:
				velocity.x = move_toward(velocity.x, 0.0, 1800.0 * delta)
				state = AI.WINDUP
				state_t = 0.0
				set_pose("punch", WINDUP_TIME + 0.15)

			# 對手在上方 → 嘗試跳躍追擊
			if is_on_floor() and _jump_cd <= 0.0 and to_target.y < -60.0 and dist < 220.0:
				velocity.y = -jump_speed
				_jump_cd = 1.2

		AI.KEEP_DISTANCE:
			# 拉開到偏好距離施放遠程招式
			var away := -signf(to_target.x) * effective_speed() * 0.8
			if dist > preferred_range * 1.3:
				away = signf(to_target.x) * effective_speed() * 0.6
			velocity.x = move_toward(velocity.x, away, 1200.0 * delta)
			if state_t > 1.1:
				state = AI.CHASE
				state_t = 0.0

		AI.WINDUP:
			velocity.x = move_toward(velocity.x, 0.0, 2000.0 * delta)
			if state_t >= WINDUP_TIME:
				_attack()
				state = AI.RECOVER
				state_t = 0.0

		AI.RECOVER:
			velocity.x = move_toward(velocity.x, 0.0, 1500.0 * delta)
			if state_t >= RECOVER_TIME:
				state = AI.CHASE
				state_t = 0.0
				_strafe_t = randf_range(0.4, 1.2)
				_strafe = 1.0 if randf() < 0.5 else -1.0


## 決定要不要放招
func _think(delta: float, dist: float, to_target: Vector2) -> void:
	_decide_t -= delta
	if _decide_t > 0.0 or not can_act():
		return
	_decide_t = reaction
	if randf() > aggression:
		return

	# 招式三：增益／場域類，冷卻好就先開
	if _ready_move(2) and randf() < 0.5:
		use_move(2)
		return

	if dist <= 190.0:
		# 近距離優先本命招
		if _ready_move(0):
			use_move(0)
			return
		if _ready_move(1):
			use_move(1)
			return
	else:
		# 中遠距離優先彈道招
		if _ready_move(1):
			use_move(1)
			return
		if _ready_move(0) and dist < 380.0:
			use_move(0)
			return
		# 沒招可放就拉開距離醞釀
		if state == AI.CHASE and absf(to_target.y) < 120.0 and randf() < 0.3:
			state = AI.KEEP_DISTANCE
			state_t = 0.0


func _ready_move(i: int) -> bool:
	if i >= moves.size():
		return false
	var m = moves[i]
	return is_instance_valid(m) and m.can_use()


func _attack() -> void:
	if arena == null:
		return
	var f := signf(float(facing))
	var origin := global_position + Vector2(f * 36.0, -46.0)
	var rect_x: float = -44.0 if f < 0.0 else -4.0
	var rect := Rect2(origin + Vector2(rect_x, -26.0), Vector2(48.0, 52.0))
	if target and is_instance_valid(target) and target.body_rect().intersects(rect):
		target.take_damage(ATTACK_DAMAGE, Vector2(f * 240.0, -230.0), {"color": Color(1, 0.5, 0.5)})
		arena.shake(4.0, 0.12)
	else:
		Fx.particles(arena.fx_front, origin, {
			"amount": 4, "lifetime": 0.2, "vmin": 50.0, "vmax": 130.0, "spread": 40.0,
			"direction": Vector2(f, 0), "gravity": Vector2(0, 400), "smin": 0.08, "smax": 0.18,
			"colors": [Color(1, 0.7, 0.7, 0.4), Color(1, 0.5, 0.5, 0)],
		})


func interrupt() -> void:
	super()
	state = AI.CHASE
	state_t = 0.0
