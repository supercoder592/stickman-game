extends Control
##
## 對戰前的角色選擇（單機）。
## 第一階段選自己，第二階段選對手（含「隨機」）。
## 左側是 10 位角色的卡片格，右側即時顯示該角色的數值、被動與三招。
##

signal confirmed(player_character: String, opponent_character: String)
signal cancelled()

enum Phase { PLAYER, OPPONENT }

const COLS := 2
const ROWS := 6
const CARD_W := 290.0
const CARD_H := 76.0
const GRID_X := 40.0
const GRID_Y := 160.0

## 右側面板要畫的數值列：[鍵, 顯示名, 單位說明]
const STAT_ROWS := [
	["hp", "血量"], ["speed", "移速"], ["jump", "跳躍"],
	["atk", "攻擊"], ["def", "耐打"],
]

var main = null
var phase: int = Phase.PLAYER
var index := 0
var player_pick := ""
var t := 0.0
var message := ""
var message_t := 0.0
var tap := TapRouter.new()
var _preview_pose := "idle"
var _preview_t := 0.0


func bind(m) -> void:
	main = m


func on_shown() -> void:
	phase = Phase.PLAYER
	player_pick = ""
	message = ""
	index = 0
	# 預設停在目前選用的角色上
	for i in Characters.ORDER.size():
		if Characters.ORDER[i] == Game.equipped_char:
			index = i
			break


func _process(delta: float) -> void:
	t += delta
	message_t = maxf(0.0, message_t - delta)
	# 右側預覽的動作循環：走路 → 上勾拳 → 勾拳 → 站立
	_preview_t += delta
	var cycle := fposmod(_preview_t, 4.0)
	if cycle < 1.6:
		_preview_pose = "walk"
	elif cycle < 2.2:
		_preview_pose = "punch_up"
	elif cycle < 2.8:
		_preview_pose = "punch"
	else:
		_preview_pose = "idle"
	queue_redraw()


## 選對手時多一格「隨機」
func _option_count() -> int:
	var extra: int = 1 if phase == Phase.OPPONENT else 0
	return Characters.ORDER.size() + extra


func _is_random(i: int) -> bool:
	return i >= Characters.ORDER.size()


func _id_at(i: int) -> String:
	return "" if _is_random(i) else str(Characters.ORDER[i])


# ------------------------------------------------------------------ 輸入
## 觸控：點卡片選取，點同一張或右下「確定」鈕即確認
func _input(event: InputEvent) -> void:
	if not visible:
		return
	var action := tap.hit(event)
	if action == "":
		return
	if action == "ok":
		_confirm()
	elif action == "back":
		_back()
	else:
		var i := int(action)
		if i == index:
			_confirm()
		else:
			index = i
	get_viewport().set_input_as_handled()
	queue_redraw()


func _unhandled_input(event: InputEvent) -> void:
	if not visible:
		return
	var k := event as InputEventKey
	if k == null or not k.pressed or k.echo:
		return
	var count := _option_count()
	match k.keycode:
		KEY_W, KEY_UP:
			index = _step(index, -1, count)
		KEY_S, KEY_DOWN:
			index = _step(index, 1, count)
		KEY_A, KEY_LEFT:
			index = _step(index, -ROWS, count)
		KEY_D, KEY_RIGHT:
			index = _step(index, ROWS, count)
		KEY_ENTER, KEY_KP_ENTER, KEY_SPACE:
			_confirm()
		KEY_ESCAPE:
			_back()
	get_viewport().set_input_as_handled()
	queue_redraw()


## 卡片是直向排列（先填滿左欄再填右欄），所以上下 = ±1、左右 = ±ROWS。
## 右欄比左欄短（10 或 11 張卡片），所以左右移動要夾在名單範圍內，
## 不然游標會跳到看起來毫無關聯的位置。
func _step(from: int, delta: int, count: int) -> int:
	if absi(delta) == 1:
		return (from + delta + count) % count      # 上下：整份名單循環
	var target := from + delta
	if target >= count:                            # 右欄那一列沒有卡片 → 停在最後一張
		return count - 1
	if target < 0:                                 # 從左欄往左 → 繞到右欄的同一列
		return mini(from + ROWS, count - 1)
	return target


func _back() -> void:
	if phase == Phase.OPPONENT:
		phase = Phase.PLAYER
		index = 0
		for i in Characters.ORDER.size():
			if Characters.ORDER[i] == player_pick:
				index = i
				break
	else:
		cancelled.emit()


func _toast(msg: String) -> void:
	message = msg
	message_t = 2.0


func _confirm() -> void:
	if phase == Phase.PLAYER:
		var id := _id_at(index)
		if id == "":
			return
		Game.equip_character(id)
		player_pick = id
		phase = Phase.OPPONENT
		index = Characters.ORDER.size()      # 預設停在「隨機」
		return

	var opp := _id_at(index)
	if opp == "":
		opp = Characters.random_id()
	confirmed.emit(player_pick, opp)


# ------------------------------------------------------------------ 繪製
func _draw() -> void:
	var f: Font = Game.ui_font
	if f == null:
		return
	var w := size.x
	var h := size.y
	tap.begin()

	var bands := 20
	for i in bands:
		var u := float(i) / float(bands - 1)
		draw_rect(Rect2(0, h * u, w, h / float(bands) + 2.0),
			Color(0.04, 0.05, 0.09).lerp(Color(0.12, 0.11, 0.20), u))

	var header: String = "選擇你的角色" if phase == Phase.PLAYER else "選擇對手"
	_text(f, Vector2(46, 56), header, 30, Color(0.96, 0.97, 1.0))
	_text(f, Vector2(46, 82), "↑↓←→ 選擇　Enter 確定　Esc 返回", 14, Color(0.58, 0.64, 0.84))

	var coin_text := "%d" % Game.coins
	var cw := f.get_string_size(coin_text, HORIZONTAL_ALIGNMENT_LEFT, -1, 22).x
	draw_circle(Vector2(w - cw - 76.0, 50.0), 10.0, Color(1, 0.82, 0.25))
	_text(f, Vector2(w - cw - 58.0, 58.0), coin_text, 22, Color(1, 0.9, 0.45))

	_draw_matchup(f, w)

	for i in _option_count():
		var col := i / ROWS
		var row := i % ROWS
		var r := Rect2(GRID_X + float(col) * (CARD_W + 12.0),
			GRID_Y + float(row) * (CARD_H + 4.0), CARD_W, CARD_H)
		_draw_card(f, r, i)
		tap.add(r.grow(2.0), str(i))

	_draw_detail(f, Rect2(GRID_X + 2.0 * (CARD_W + 12.0) + 10.0, GRID_Y,
		w - (GRID_X + 2.0 * (CARD_W + 12.0) + 10.0) - 40.0, h - GRID_Y - 36.0))

	# 觸控用的確定／返回鈕（鍵盤玩家用 Enter / Esc 即可）
	var ok_r := Rect2(GRID_X + CARD_W + 12.0, h - 66.0, CARD_W, 48.0)
	draw_rect(ok_r, Color(0.2, 0.45, 0.32, 0.9))
	draw_rect(ok_r, Color(0.5, 1.0, 0.7, 0.75), false, 2.0)
	_centered(f, ok_r, "確定", 20, Color(0.9, 1.0, 0.95))
	tap.add(ok_r, "ok")

	var back_r := Rect2(GRID_X, h - 66.0, CARD_W, 48.0)
	draw_rect(back_r, Color(0.16, 0.17, 0.24, 0.9))
	draw_rect(back_r, Color(0.5, 0.55, 0.72, 0.6), false, 1.6)
	_centered(f, back_r, "返回", 20, Color(0.8, 0.84, 0.95))
	tap.add(back_r, "back")

	if message_t > 0.0:
		var a: float = clampf(message_t / 0.5, 0.0, 1.0)
		var mw := f.get_string_size(message, HORIZONTAL_ALIGNMENT_LEFT, -1, 17).x
		draw_rect(Rect2(w * 0.5 - mw * 0.5 - 18.0, h - 118.0, mw + 36.0, 32.0),
			Color(0.05, 0.06, 0.1, 0.8 * a))
		_text(f, Vector2(w * 0.5 - mw * 0.5, h - 96.0), message, 17, Color(1, 0.85, 0.5, a))

	tap.commit()


## 上方的「你 VS 對手」配對條
func _draw_matchup(f: Font, w: float) -> void:
	var y := 108.0
	var left_id := player_pick
	if phase == Phase.PLAYER:
		left_id = _id_at(index)
	var right_id := ""
	if phase == Phase.OPPONENT:
		right_id = _id_at(index)

	_draw_side(f, Vector2(46.0, y), left_id, "你", Color(0.55, 0.9, 1.0))
	var vs := "VS"
	var vw := f.get_string_size(vs, HORIZONTAL_ALIGNMENT_LEFT, -1, 24).x
	_text(f, Vector2(w * 0.5 - vw * 0.5, y + 26.0), vs, 24, Color(1, 0.75, 0.35))
	_draw_side(f, Vector2(w - 320.0, y), right_id, "對手", Color(1.0, 0.5, 0.5))


func _draw_side(f: Font, pos: Vector2, id: String, label: String, tint: Color) -> void:
	_text(f, pos, label, 12, tint)
	var name_text := "？隨機"
	var col := Color(0.6, 0.64, 0.8)
	if Characters.has(id):
		name_text = "%s　%s" % [Characters.name_of(id), Characters.title_of(id)]
		col = Characters.color_of(id)
	draw_colored_polygon(Fx.star(pos + Vector2(10, 20), 6, 9.0, 3.6, t * 0.7), col)
	_text(f, pos + Vector2(28, 27), name_text, 19, col)


func _draw_card(f: Font, r: Rect2, i: int) -> void:
	var selected := i == index
	var is_random := _is_random(i)
	var id := _id_at(i)
	var col: Color = Characters.color_of(id) if not is_random else Color(0.7, 0.74, 0.9)

	var bg := Color(0.08, 0.09, 0.14, 0.9)
	if selected:
		bg = Color(col.r * 0.22, col.g * 0.22, col.b * 0.26, 0.95)
	draw_rect(r, bg)
	if selected:
		draw_rect(r, Color(col.r, col.g, col.b, 0.55 + 0.3 * sin(t * 6.0)), false, 2.4)
	else:
		draw_rect(r, Color(0.28, 0.32, 0.46, 0.35), false, 1.0)

	if is_random:
		draw_circle(r.position + Vector2(42, r.size.y * 0.5), 20.0, Color(col.r, col.g, col.b, 0.12))
		_text(f, r.position + Vector2(34, r.size.y * 0.5 + 9.0), "？", 26, Color(0.85, 0.88, 1.0))
		_text(f, r.position + Vector2(78, r.size.y * 0.5 - 2.0), "隨機對手", 18, col)
		_text(f, r.position + Vector2(78, r.size.y * 0.5 + 18.0), "由系統抽一位", 12,
			Color(0.66, 0.7, 0.86))
		return

	# 縮小版的角色剪影：剪影本身就是辨識度，比文字更快認出是誰
	var look := Game.character_look(id, false)
	var j := StickFigure.joints("idle", 0.0, t * 2.4 + float(i), 1, false)
	var sc := 0.42
	draw_set_transform(r.position + Vector2(44, r.size.y - 8.0), 0.0, Vector2(sc, sc))
	StickFigure.draw_figure(self, j, look.get("body", col),
		float(look.get("width", 5.0)) * 1.4, 0.55, look, t)
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)

	_text(f, r.position + Vector2(84, r.size.y * 0.5 - 4.0),
		"%s　%s" % [Characters.name_of(id), Characters.title_of(id)], 18, col)
	_text(f, r.position + Vector2(84, r.size.y * 0.5 + 16.0),
		"%s　·　%s" % [Game.element_name(Characters.element_of(id)),
			str(Characters.passive_of(id).get("name", ""))], 12, Color(0.72, 0.76, 0.92))

	if phase == Phase.PLAYER and Game.equipped_char == id:
		var tag := "上次使用"
		var tw := f.get_string_size(tag, HORIZONTAL_ALIGNMENT_LEFT, -1, 11).x
		_text(f, Vector2(r.end.x - tw - 10.0, r.position.y + 18.0), tag, 11,
			Color(0.55, 0.85, 1.0))


## 右側詳情：大張預覽 + 數值條 + 被動 + 三招
func _draw_detail(f: Font, r: Rect2) -> void:
	draw_rect(r, Color(0.06, 0.07, 0.12, 0.92))
	draw_rect(r, Color(0.4, 0.45, 0.7, 0.4), false, 1.6)

	var id := _id_at(index)
	if id == "":
		_text(f, r.position + Vector2(28, 58), "對手將於開戰時抽選", 20, Color(0.7, 0.74, 0.9))
		_text(f, r.position + Vector2(28, 88), "想針對特定角色練習就直接指定。", 14,
			Color(0.55, 0.6, 0.78))
		return

	var d := Characters.data(id)
	var col: Color = Characters.color_of(id)
	var element: String = Characters.element_of(id)

	_text(f, r.position + Vector2(26, 44), "%s" % Characters.name_of(id), 27, col)
	var nw := f.get_string_size(Characters.name_of(id), HORIZONTAL_ALIGNMENT_LEFT, -1, 27).x
	_text(f, r.position + Vector2(34 + nw, 42), Characters.title_of(id), 14,
		Color(0.8, 0.84, 0.96))
	_text(f, r.position + Vector2(26, 68), "%s　%s" % [Game.element_name(element),
		str(d.get("tagline", ""))], 13, Color(0.7, 0.75, 0.9))
	draw_line(r.position + Vector2(26, 82), r.position + Vector2(r.size.x - 26, 82),
		Color(col.r, col.g, col.b, 0.35), 1.5)

	# 角色立繪（動態）
	var look := Game.character_look(id, true)
	var stage := r.position + Vector2(r.size.x - 100.0, 286.0)
	draw_set_transform(stage, 0.0, Vector2(1.0, 0.3))
	draw_circle(Vector2.ZERO, 58.0, Color(col.r, col.g, col.b, 0.10))
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
	var scale_k := 1.7
	var j := StickFigure.joints(_preview_pose, fposmod(_preview_t, 0.5), t * 5.0, -1, false)
	draw_set_transform(stage, 0.0, Vector2(scale_k, scale_k))
	StickFigure.draw_figure(self, j, look.get("body", col),
		float(look.get("width", 5.0)) * 1.2 / scale_k, 0.55, look, t)
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)

	# 數值條
	var y := r.position.y + 108.0
	for row in STAT_ROWS:
		var key: String = row[0]
		_text(f, Vector2(r.position.x + 26.0, y + 11.0), str(row[1]), 13,
			Color(0.75, 0.8, 0.94))
		var bar := Rect2(r.position.x + 74.0, y, 170.0, 12.0)
		draw_rect(bar, Color(0.12, 0.13, 0.2, 0.9))
		var ratio := Characters.stat_ratio(id, key)
		draw_rect(Rect2(bar.position, Vector2(bar.size.x * ratio, bar.size.y)),
			Color(col.r, col.g, col.b, 0.85))
		draw_rect(bar, Color(0.35, 0.4, 0.55, 0.5), false, 1.0)
		var raw := _stat_label(d, key)
		_text(f, Vector2(bar.end.x + 10.0, y + 11.0), raw, 12, Color(0.66, 0.72, 0.88))
		y += 22.0

	# 被動
	var passive: Dictionary = Characters.passive_of(id)
	# 被動欄的寬度刻意留白 170：右邊是立繪，蓋過去會兩邊都看不清楚
	var pbox := Rect2(r.position.x + 26.0, y + 8.0, r.size.x - 52.0 - 170.0, 56.0)
	draw_rect(pbox, Color(col.r * 0.2, col.g * 0.2, col.b * 0.24, 0.85))
	draw_rect(pbox, Color(col.r, col.g, col.b, 0.5), false, 1.2)
	_text(f, pbox.position + Vector2(12, 22), "被動・%s" % str(passive.get("name", "")), 16, col)
	_text(f, pbox.position + Vector2(12, 43), str(passive.get("desc", "")), 12.5,
		Color(0.82, 0.86, 0.98))

	# 三招
	var keys := ["U / 1", "I / 2", "O / 3"]
	var moves: Array = Game.ELEMENTS.get(element, {}).get("moves", [])
	var my := pbox.end.y + 30.0
	for i in moves.size():
		var m: Dictionary = moves[i]
		var badge := Rect2(r.position.x + 26.0, my - 20.0, 58.0, 24.0)
		draw_rect(badge, Color(col.r, col.g, col.b, 0.18))
		draw_rect(badge, Color(col.r, col.g, col.b, 0.6), false, 1.2)
		_text(f, badge.position + Vector2(8, 17), keys[i], 12, Color(1, 0.95, 0.8))

		_text(f, Vector2(r.position.x + 94.0, my), str(m.get("name", "")), 17, col)
		var title_w := f.get_string_size(str(m.get("name", "")),
			HORIZONTAL_ALIGNMENT_LEFT, -1, 17).x
		if i < Fighter.FREE_MOVE_COUNT:
			var tag := Rect2(r.position.x + 102.0 + title_w, my - 15.0, 52.0, 19.0)
			draw_rect(tag, Color(0.35, 0.85, 0.55, 0.18))
			draw_rect(tag, Color(0.45, 0.95, 0.6, 0.6), false, 1.0)
			_text(f, tag.position + Vector2(6, 14), "無冷卻", 11, Color(0.6, 1.0, 0.75))
		_text(f, Vector2(r.position.x + 28.0, my + 22.0), str(m.get("desc", "")), 12.5,
			Color(0.8, 0.84, 0.96))
		my += 62.0


## 數值條右邊的實際數字（倍率類換成百分比，比較好讀）
func _stat_label(d: Dictionary, key: String) -> String:
	match key:
		"hp":
			return "%d" % int(d.get("hp", 200.0))
		"speed":
			return "%d" % int(d.get("speed", 300.0))
		"jump":
			return "%d" % int(d.get("jump", 720.0))
		"atk":
			return "%+d%%" % int(round((float(d.get("atk", 1.0)) - 1.0) * 100.0))
		"def":
			return "%+d%%" % int(round((1.0 - float(d.get("def", 1.0))) * 100.0))
	return ""


func _centered(f: Font, r: Rect2, s: String, sz: int, col: Color) -> void:
	var tw := f.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, sz).x
	_text(f, r.position + Vector2(r.size.x * 0.5 - tw * 0.5, r.size.y * 0.5 + float(sz) * 0.36),
		s, sz, col)


func _text(f: Font, pos: Vector2, s: String, sz: float, col: Color) -> void:
	draw_string(f, pos + Vector2(1, 1), s, HORIZONTAL_ALIGNMENT_LEFT, -1, int(sz),
		Color(0, 0, 0, col.a * 0.7))
	draw_string(f, pos, s, HORIZONTAL_ALIGNMENT_LEFT, -1, int(sz), col)
