extends Control
##
## 手機模式的觸控操作層：左側虛擬搖桿、右側跳躍／普攻／三個招式鍵。
##
## 全部用 _draw() 畫，並直接處理 InputEventScreenTouch / ScreenDrag；
## 桌機上也接受滑鼠事件，方便不用真手機就能測。
##

const STICK_R := 92.0        # 搖桿活動半徑
const KNOB_R := 40.0
const BTN_R := 44.0
const SKILL_R := 40.0

var arena = null
var enabled := false

var _stick_touch := -1       # 正在操作搖桿的觸控 index
var _stick_origin := Vector2.ZERO
var _stick_pos := Vector2.ZERO
var _btn_touches := {}       # 觸控 index -> 按鈕 id
var _flash := {}             # 按鈕 id -> 剩餘高亮秒數
var t := 0.0


func bind_arena(a) -> void:
	arena = a


func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	z_index = 50


func _process(delta: float) -> void:
	t += delta
	for k in _flash.keys():
		_flash[k] = maxf(0.0, _flash[k] - delta)
	queue_redraw()


## 把目前的搖桿與跳躍狀態寫進玩家。
## 只在觸控事件發生時呼叫（不是每幀）—— 每幀推送會和物理幀率不同步，
## 造成跳躍被可變高度邏輯砍掉、軸值閃爍。
func _sync_state() -> void:
	var p = _player()
	if p == null:
		return
	var dx := 0.0
	if _stick_touch != -1:
		dx = clampf((_stick_pos.x - _stick_origin.x) / STICK_R, -1.0, 1.0)
		if absf(dx) < 0.16:
			dx = 0.0
	p.push_touch_axis(dx, _btn_touches.values().has("jump"))


func _player():
	if arena == null or not is_instance_valid(arena):
		return null
	if arena.player == null or not is_instance_valid(arena.player):
		return null
	return arena.player


# ------------------------------------------------------------------ 版面
func _stick_center() -> Vector2:
	return Vector2(STICK_R + 56.0, size.y - STICK_R - 46.0)


## 回傳 [ [id, 圓心, 半徑], ... ]
func _buttons() -> Array:
	var right := size.x - 62.0
	var bottom := size.y - 56.0
	return [
		["jump", Vector2(right - 190.0, bottom - 34.0), BTN_R],
		["punch", Vector2(right - 82.0, bottom - 8.0), BTN_R + 6.0],
		["m0", Vector2(right - 210.0, bottom - 152.0), SKILL_R],
		["m1", Vector2(right - 110.0, bottom - 190.0), SKILL_R],
		["m2", Vector2(right - 8.0, bottom - 152.0), SKILL_R],
	]


func _hit_button(pos: Vector2) -> String:
	for b in _buttons():
		if pos.distance_to(b[1]) <= float(b[2]) * 1.15:
			return str(b[0])
	return ""


# ------------------------------------------------------------------ 輸入
func _input(event: InputEvent) -> void:
	if not enabled or not visible:
		return

	var touch := event as InputEventScreenTouch
	if touch:
		_handle_press(touch.index, touch.position, touch.pressed)
		return
	var drag := event as InputEventScreenDrag
	if drag:
		if drag.index == _stick_touch:
			_stick_pos = drag.position
			_sync_state()
			get_viewport().set_input_as_handled()
		return

	# 桌機用滑鼠模擬，方便測試
	var mb := event as InputEventMouseButton
	if mb and mb.button_index == MOUSE_BUTTON_LEFT:
		_handle_press(-2, mb.position, mb.pressed)
		return
	var mm := event as InputEventMouseMotion
	if mm and _stick_touch == -2:
		_stick_pos = mm.position
		_sync_state()


func _handle_press(index: int, pos: Vector2, pressed: bool) -> void:
	var p = _player()
	if pressed:
		var btn := _hit_button(pos)
		if btn != "":
			_btn_touches[index] = btn
			_flash[btn] = 0.18
			if p:
				match btn:
					"jump": p.press_jump()
					"punch": p.press_punch()
					"m0": p.press_move(0)
					"m1": p.press_move(1)
					"m2": p.press_move(2)
			_sync_state()
			get_viewport().set_input_as_handled()
			return
		# 左半邊當作搖桿（按下的位置即為搖桿原點，手指落在哪都能操作）
		if pos.x < size.x * 0.55 and _stick_touch == -1:
			_stick_touch = index
			_stick_origin = pos
			_stick_pos = pos
			_sync_state()
			get_viewport().set_input_as_handled()
	else:
		if index == _stick_touch:
			_stick_touch = -1
		var was: String = _btn_touches.get(index, "")
		_btn_touches.erase(index)
		if was == "jump" and p:
			p.release_jump()
		_sync_state()


# ------------------------------------------------------------------ 繪製
func _draw() -> void:
	if not enabled:
		return
	var f: Font = Game.ui_font
	var p = _player()

	# 搖桿
	var c: Vector2 = _stick_center() if _stick_touch == -1 else _stick_origin
	draw_circle(c, STICK_R, Color(0.6, 0.7, 1.0, 0.07))
	draw_arc(c, STICK_R, 0, TAU, 40, Color(0.7, 0.8, 1.0, 0.28), 2.5, true)
	var knob := c
	if _stick_touch != -1:
		var d := _stick_pos - _stick_origin
		if d.length() > STICK_R:
			d = d.normalized() * STICK_R
		knob = c + Vector2(d.x, d.y * 0.35)
	draw_circle(knob, KNOB_R, Color(0.65, 0.8, 1.0, 0.2))
	draw_arc(knob, KNOB_R, 0, TAU, 28, Color(0.85, 0.92, 1.0, 0.6), 2.5, true)
	draw_line(c + Vector2(-STICK_R * 0.55, 0), c + Vector2(STICK_R * 0.55, 0),
		Color(0.8, 0.88, 1.0, 0.18), 2.0, true)

	# 按鈕
	for b in _buttons():
		var id: String = b[0]
		var pos: Vector2 = b[1]
		var r: float = b[2]
		var col := Color(0.75, 0.82, 1.0)
		var label := ""
		var ready := true
		match id:
			"jump":
				label = "跳"
			"punch":
				label = "攻"
			_:
				var mi := int(id.substr(1))
				label = ["一", "二", "三"][mi]
				if p and mi < p.moves.size() and is_instance_valid(p.moves[mi]):
					col = p.moves[mi].color
					ready = p.moves[mi].can_use()

		var glow: float = _flash.get(id, 0.0) / 0.18
		var ready_mul: float = 1.0 if ready else 0.4
		var a: float = (0.16 + glow * 0.3) * ready_mul
		draw_circle(pos, r, Color(col.r, col.g, col.b, a))
		draw_arc(pos, r, 0, TAU, 30,
			Color(col.r, col.g, col.b, (0.55 + glow * 0.45) * ready_mul), 2.6, true)
		if f:
			var lw := f.get_string_size(label, HORIZONTAL_ALIGNMENT_LEFT, -1, 20).x
			draw_string(f, pos + Vector2(-lw * 0.5, 7), label, HORIZONTAL_ALIGNMENT_LEFT, -1, 20,
				Color(1, 1, 1, 0.55 + 0.45 * ready_mul))

		# 招式冷卻：沿按鈕外緣的進度弧
		if id.begins_with("m") and p:
			var mi2 := int(id.substr(1))
			if mi2 < p.moves.size() and is_instance_valid(p.moves[mi2]):
				var m = p.moves[mi2]
				if m.cooldown > 0.0:
					var k: float = clampf(m.cooldown / maxf(m.cd_max, 0.001), 0.0, 1.0)
					draw_arc(pos, r + 5.0, -PI * 0.5, -PI * 0.5 + TAU * k, 32,
						Color(0.1, 0.12, 0.2, 0.85), 6.0, true)
