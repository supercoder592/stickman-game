extends Control
##
## 對戰前的元素選擇。
## 第一階段選自己的元素（未解鎖的可用金幣購買），第二階段選對手的元素（含「隨機」）。
## 右側面板即時顯示該元素的三個招式。
##

signal confirmed(player_element: String, opponent_element: String)
signal cancelled()

enum Phase { PLAYER, OPPONENT }

var main = null
var phase: int = Phase.PLAYER
var index := 0
var player_pick := ""
var t := 0.0
var message := ""
var message_t := 0.0


func bind(m) -> void:
	main = m


func on_shown() -> void:
	phase = Phase.PLAYER
	player_pick = ""
	message = ""
	index = 0
	# 預設停在目前裝備的元素上
	for i in Game.ELEMENT_ORDER.size():
		if Game.ELEMENT_ORDER[i] == Game.equipped:
			index = i
			break


func _process(delta: float) -> void:
	t += delta
	message_t = maxf(0.0, message_t - delta)
	queue_redraw()


func _option_count() -> int:
	# 選對手時多一個「隨機」
	var extra: int = 1 if phase == Phase.OPPONENT else 0
	return Game.ELEMENT_ORDER.size() + extra


func _unhandled_input(event: InputEvent) -> void:
	if not visible:
		return
	var k := event as InputEventKey
	if k == null or not k.pressed or k.echo:
		return
	var count := _option_count()
	match k.keycode:
		KEY_W, KEY_UP:
			index = (index - 1 + count) % count
		KEY_S, KEY_DOWN:
			index = (index + 1) % count
		KEY_ENTER, KEY_KP_ENTER, KEY_SPACE:
			_confirm()
		KEY_ESCAPE:
			if phase == Phase.OPPONENT:
				phase = Phase.PLAYER
				index = 0
			else:
				cancelled.emit()
	get_viewport().set_input_as_handled()
	queue_redraw()


func _toast(msg: String) -> void:
	message = msg
	message_t = 2.0


func _confirm() -> void:
	if phase == Phase.PLAYER:
		var id: String = Game.ELEMENT_ORDER[index]
		# 購買一律在商店進行，這裡只負責從已解鎖的元素中挑選
		if not Game.is_unlocked(id):
			_toast("%s 尚未解鎖 —— 請到主畫面的商店購買" % Game.element_name(id))
			return
		Game.equip(id)
		player_pick = id
		phase = Phase.OPPONENT
		index = Game.ELEMENT_ORDER.size()      # 預設停在「隨機」
		return

	# 選對手
	var opp := ""
	if index >= Game.ELEMENT_ORDER.size():
		opp = Game.ELEMENT_ORDER[randi() % Game.ELEMENT_ORDER.size()]
	else:
		opp = Game.ELEMENT_ORDER[index]
	confirmed.emit(player_pick, opp)


# ------------------------------------------------------------------ 繪製
func _draw() -> void:
	var f: Font = Game.ui_font
	if f == null:
		return
	var w := size.x
	var h := size.y

	# 背景
	var bands := 20
	for i in bands:
		var u := float(i) / float(bands - 1)
		draw_rect(Rect2(0, h * u, w, h / float(bands) + 2.0),
			Color(0.04, 0.05, 0.09).lerp(Color(0.12, 0.11, 0.20), u))

	var header: String = "選擇你的元素" if phase == Phase.PLAYER else "選擇對手的元素"
	_text(f, Vector2(46, 62), header, 32, Color(0.96, 0.97, 1.0))
	var sub: String = "↑↓ 選擇　Enter 確定　Esc 返回"
	_text(f, Vector2(46, 90), sub, 14, Color(0.58, 0.64, 0.84))

	# 金幣
	var coin_text := "%d" % Game.coins
	var cw := f.get_string_size(coin_text, HORIZONTAL_ALIGNMENT_LEFT, -1, 22).x
	draw_circle(Vector2(w - cw - 76.0, 56.0), 10.0, Color(1, 0.82, 0.25))
	_text(f, Vector2(w - cw - 58.0, 64.0), coin_text, 22, Color(1, 0.9, 0.45))

	# 對戰配對條
	_draw_matchup(f, w)

	# 左側列表
	var list_x := 46.0
	var list_y := 168.0
	var row_h := 46.0
	for i in _option_count():
		_draw_row(f, Rect2(list_x, list_y + float(i) * row_h, 470.0, row_h - 6.0), i)

	# 右側招式面板
	_draw_moves_panel(f, Rect2(w - 590.0, 168.0, 544.0, h - 240.0))

	if message_t > 0.0:
		var a: float = clampf(message_t / 0.5, 0.0, 1.0)
		var mw := f.get_string_size(message, HORIZONTAL_ALIGNMENT_LEFT, -1, 18).x
		draw_rect(Rect2(w * 0.5 - mw * 0.5 - 18.0, h - 86.0, mw + 36.0, 34.0),
			Color(0.05, 0.06, 0.1, 0.8 * a))
		_text(f, Vector2(w * 0.5 - mw * 0.5, h - 62.0), message, 18, Color(1, 0.85, 0.5, a))


func _draw_matchup(f: Font, w: float) -> void:
	var y := 118.0
	var left_id: String = player_pick
	if phase == Phase.PLAYER and index < Game.ELEMENT_ORDER.size():
		left_id = Game.ELEMENT_ORDER[index]
	var right_id := ""
	if phase == Phase.OPPONENT and index < Game.ELEMENT_ORDER.size():
		right_id = Game.ELEMENT_ORDER[index]

	_draw_side(f, Vector2(46.0, y), left_id, "你", Color(0.55, 0.9, 1.0))
	var vs := "VS"
	var vw := f.get_string_size(vs, HORIZONTAL_ALIGNMENT_LEFT, -1, 26).x
	_text(f, Vector2(w * 0.5 - vw * 0.5, y + 10.0), vs, 26, Color(1, 0.75, 0.35))
	_draw_side(f, Vector2(w - 300.0, y), right_id, "對手", Color(1.0, 0.5, 0.5))


func _draw_side(f: Font, pos: Vector2, id: String, label: String, tint: Color) -> void:
	_text(f, pos, label, 13, tint)
	var name_text := "？隨機"
	var col := Color(0.6, 0.64, 0.8)
	if id != "" and Game.ELEMENTS.has(id):
		name_text = Game.element_name(id)
		col = Game.element_color(id)
	draw_circle(pos + Vector2(12, 22), 11.0, Color(col.r, col.g, col.b, 0.25))
	draw_colored_polygon(Fx.star(pos + Vector2(12, 22), 6, 9.0, 3.6, t * 0.7), col)
	_text(f, pos + Vector2(32, 30), name_text, 22, col)


func _draw_row(f: Font, r: Rect2, i: int) -> void:
	var selected := i == index
	var is_random := i >= Game.ELEMENT_ORDER.size()

	var id := ""
	var col := Color(0.7, 0.74, 0.9)
	var label := "隨機對手"
	var right_label := "由系統抽選"
	var right_col := Color(0.65, 0.7, 0.86)

	if not is_random:
		id = Game.ELEMENT_ORDER[i]
		var data: Dictionary = Game.ELEMENTS[id]
		col = data["color"]
		label = "%s　%s" % [data["name"], data["tagline"]]
		if phase == Phase.OPPONENT or Game.is_unlocked(id):
			right_label = "已解鎖"
			right_col = Color(0.6, 0.9, 0.7)
			if phase == Phase.PLAYER and Game.equipped == id:
				right_label = "上次使用"
				right_col = Color(0.55, 0.85, 1.0)
		else:
			right_label = "商店未解鎖"
			right_col = Color(0.75, 0.5, 0.5)

	var locked := (not is_random) and phase == Phase.PLAYER and not Game.is_unlocked(id)
	var dim: float = 0.4 if locked else 1.0

	var bg := Color(0.08, 0.09, 0.14, 0.9)
	if selected:
		bg = Color(col.r * 0.22, col.g * 0.22, col.b * 0.26, 0.95)
	draw_rect(r, bg)
	if selected:
		var pulse := 0.55 + 0.3 * sin(t * 6.0)
		draw_rect(r, Color(col.r, col.g, col.b, pulse), false, 2.4)
	else:
		draw_rect(r, Color(0.28, 0.32, 0.46, 0.35), false, 1.0)

	var c := r.position + Vector2(30, r.size.y * 0.5)
	if is_random:
		_text(f, c + Vector2(-6, 7), "？", 22, Color(0.8, 0.84, 1.0))
	else:
		draw_circle(c, 17.0, Color(col.r, col.g, col.b, 0.14 * dim))
		draw_colored_polygon(Fx.star(c, 6, 12.0, 5.0, t * 0.8 + float(i)),
			Color(col.r, col.g, col.b, dim))
		draw_circle(c, 3.6, Color(1, 1, 1, 0.85 * dim))

	var name_col: Color = col if not locked else Color(0.5, 0.53, 0.64)
	_text(f, r.position + Vector2(58, r.size.y * 0.5 + 7), label, 17, name_col)

	var rw := f.get_string_size(right_label, HORIZONTAL_ALIGNMENT_LEFT, -1, 13).x
	_text(f, Vector2(r.end.x - rw - 14.0, r.position.y + r.size.y * 0.5 + 5.0),
		right_label, 13, right_col)


## 右側：目前游標所指元素的三個招式
func _draw_moves_panel(f: Font, r: Rect2) -> void:
	draw_rect(r, Color(0.06, 0.07, 0.12, 0.92))
	draw_rect(r, Color(0.4, 0.45, 0.7, 0.4), false, 1.6)

	var id := ""
	if index < Game.ELEMENT_ORDER.size():
		id = Game.ELEMENT_ORDER[index]
	if id == "":
		_text(f, r.position + Vector2(28, 60), "對手元素將於開戰時抽選", 18, Color(0.7, 0.74, 0.9))
		_text(f, r.position + Vector2(28, 92), "想針對特定元素練習就直接指定。", 14, Color(0.55, 0.6, 0.78))
		return

	var data: Dictionary = Game.ELEMENTS[id]
	var col: Color = data["color"]
	_text(f, r.position + Vector2(28, 48), str(data["name"]), 28, col)
	_text(f, r.position + Vector2(28, 74), str(data["tagline"]), 14, Color(0.72, 0.76, 0.92))
	draw_line(r.position + Vector2(28, 92), r.position + Vector2(r.size.x - 28, 92),
		Color(col.r, col.g, col.b, 0.35), 1.5)

	var keys := ["U / 1", "I / 2", "O / 3"]
	var moves: Array = data["moves"]
	var y := r.position.y + 128.0
	for i in moves.size():
		var m: Dictionary = moves[i]
		# 招式編號徽章
		var badge := Rect2(r.position.x + 28.0, y - 22.0, 62.0, 26.0)
		draw_rect(badge, Color(col.r, col.g, col.b, 0.18))
		draw_rect(badge, Color(col.r, col.g, col.b, 0.6), false, 1.2)
		_text(f, badge.position + Vector2(9, 19), keys[i], 13, Color(1, 0.95, 0.8))

		var title_w := f.get_string_size(str(m["name"]), HORIZONTAL_ALIGNMENT_LEFT, -1, 19).x
		if i < Fighter.FREE_MOVE_COUNT:
			var tag := Rect2(r.position.x + 112.0 + title_w, y - 17.0, 56.0, 20.0)
			draw_rect(tag, Color(0.35, 0.85, 0.55, 0.18))
			draw_rect(tag, Color(0.45, 0.95, 0.6, 0.6), false, 1.0)
			_text(f, tag.position + Vector2(7, 15), "無冷卻", 11, Color(0.6, 1.0, 0.75))

		_text(f, Vector2(r.position.x + 102.0, y), str(m["name"]), 19, col)
		_text(f, Vector2(r.position.x + 30.0, y + 26.0), str(m["desc"]), 13,
			Color(0.8, 0.84, 0.96))
		y += 76.0


func _text(f: Font, pos: Vector2, s: String, sz: int, col: Color) -> void:
	draw_string(f, pos + Vector2(1, 1), s, HORIZONTAL_ALIGNMENT_LEFT, -1, sz, Color(0, 0, 0, 0.7))
	draw_string(f, pos, s, HORIZONTAL_ALIGNMENT_LEFT, -1, sz, col)
