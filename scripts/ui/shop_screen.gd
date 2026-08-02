extends Control
##
## 商店：兩個分頁 —— 屬性（元素）與造型。
## 左側清單、右側預覽。造型分頁的預覽是一隻會走路／揮拳的火柴人，直接用 StickFigure 畫。
##

signal closed()

enum Tab { ELEMENT, SKIN }

var main = null
var tab: int = Tab.ELEMENT
var index := 0
var t := 0.0
var message := ""
var message_t := 0.0
var _preview_pose := "idle"
var _preview_t := 0.0
var tap := TapRouter.new()
## 造型分頁：目前正在編輯哪個部位
var slot_index := 0


func _slot() -> String:
	return Game.PART_SLOTS[slot_index]


func _slot_options() -> Array:
	return Game.PARTS[_slot()].keys()


## 觸控：點分頁切換、點清單選取、再點一次同項＝購買／裝備
func _input(event: InputEvent) -> void:
	if not visible:
		return
	var action := tap.hit(event)
	if action == "":
		return
	match action:
		"tab0":
			tab = Tab.ELEMENT
			index = 0
		"tab1":
			tab = Tab.SKIN
			index = 0
		"slot0", "slot1", "slot2", "slot3", "slot4":
			slot_index = int(action.substr(4))
			index = 0
		"ok":
			_confirm()
		"back":
			closed.emit()
		_:
			var i := int(action)
			if i == index:
				_confirm()
			else:
				index = i
	get_viewport().set_input_as_handled()
	queue_redraw()


func bind(m) -> void:
	main = m


func on_shown() -> void:
	tab = Tab.ELEMENT
	index = 0
	message = ""


func _process(delta: float) -> void:
	t += delta
	message_t = maxf(0.0, message_t - delta)
	# 預覽動作循環：站立 → 走路 → 勾拳
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


func _entries() -> PackedStringArray:
	if tab == Tab.ELEMENT:
		return Game.ELEMENT_ORDER
	var out := PackedStringArray()
	for o in _slot_options():
		out.append(str(o))
	return out


func _unhandled_input(event: InputEvent) -> void:
	if not visible:
		return
	var k := event as InputEventKey
	if k == null or not k.pressed or k.echo:
		return
	var count := _entries().size()
	match k.keycode:
		KEY_W, KEY_UP:
			index = (index - 1 + count) % count
		KEY_S, KEY_DOWN:
			index = (index + 1) % count
		KEY_A, KEY_LEFT, KEY_Q:
			# 造型分頁：左右切換部位；屬性分頁：切回屬性
			if tab == Tab.SKIN:
				slot_index = (slot_index - 1 + Game.PART_SLOTS.size()) % Game.PART_SLOTS.size()
				index = 0
			else:
				tab = Tab.ELEMENT
				index = 0
		KEY_D, KEY_RIGHT, KEY_E:
			if tab == Tab.SKIN:
				slot_index = (slot_index + 1) % Game.PART_SLOTS.size()
				index = 0
			else:
				tab = Tab.SKIN
				index = 0
		KEY_TAB:
			tab = Tab.SKIN if tab == Tab.ELEMENT else Tab.ELEMENT
			index = 0
		KEY_ENTER, KEY_KP_ENTER, KEY_SPACE:
			_confirm()
		KEY_ESCAPE:
			closed.emit()
	get_viewport().set_input_as_handled()
	queue_redraw()


func _toast(msg: String) -> void:
	message = msg
	message_t = 2.0


func _confirm() -> void:
	var id: String = _entries()[index]
	if tab == Tab.ELEMENT:
		if Game.is_unlocked(id):
			Game.equip(id)
			_toast("已選用 %s" % Game.element_name(id))
			return
		var price := Game.price_of(id)
		if Game.coins < price:
			_toast("金幣不足：還差 %d" % (price - Game.coins))
			return
		if Game.try_unlock(id):
			Game.equip(id)
			_toast("解鎖 %s！" % Game.element_name(id))
	else:
		var slot := _slot()
		var data: Dictionary = Game.part_data(slot, id)
		var label := "%s・%s" % [Game.SLOT_NAMES[slot], str(data.get("name", id))]
		if Game.is_part_unlocked(slot, id):
			Game.equip_part(slot, id)
			_toast("已換上 %s" % label)
			return
		var price2 := Game.part_price(slot, id)
		if Game.coins < price2:
			_toast("金幣不足：還差 %d" % (price2 - Game.coins))
			return
		if Game.try_unlock_part(slot, id):
			Game.equip_part(slot, id)
			_toast("解鎖並換上 %s！" % label)


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
			Color(0.04, 0.05, 0.09).lerp(Color(0.13, 0.11, 0.21), u))

	_text(f, Vector2(46, 62), "商店", 32, Color(0.96, 0.97, 1.0))
	_text(f, Vector2(46, 90), "↑↓ 選擇　←→ / Tab 切換分頁　Enter 購買或裝備　Esc 返回", 14,
		Color(0.58, 0.64, 0.84))

	var coin_text := "%d" % Game.coins
	var cw := f.get_string_size(coin_text, HORIZONTAL_ALIGNMENT_LEFT, -1, 22).x
	draw_circle(Vector2(w - cw - 76.0, 56.0), 10.0, Color(1, 0.82, 0.25))
	_text(f, Vector2(w - cw - 58.0, 64.0), coin_text, 22, Color(1, 0.9, 0.45))

	_draw_tabs(f)

	# 造型分頁：先畫五個部位的切換列
	var list_top := 176.0
	if tab == Tab.SKIN:
		_draw_slot_bar(f, 46.0, 176.0)
		list_top = 232.0

	var list := Rect2(46, list_top, 520, h - list_top - 110.0)
	var rows := _entries()
	var row_h: float = minf(56.0, (list.size.y - 8.0) / float(maxi(rows.size(), 1)))
	for i in rows.size():
		var r := Rect2(list.position.x, list.position.y + float(i) * row_h,
			list.size.x, row_h - 6.0)
		if tab == Tab.ELEMENT:
			_draw_element_row(f, r, rows[i], i == index)
		else:
			_draw_skin_row(f, r, rows[i], i == index)
		tap.add(r.grow(3.0), str(i))

	_draw_preview(f, Rect2(w - 620.0, 176, 574.0, h - 240.0))

	# 觸控用的按鈕
	var ok_r := Rect2(w - 250.0, h - 84.0, 200.0, 52.0)
	draw_rect(ok_r, Color(0.2, 0.45, 0.32, 0.9))
	draw_rect(ok_r, Color(0.5, 1.0, 0.7, 0.75), false, 2.0)
	var okl := "購買 / 裝備"
	var okw := f.get_string_size(okl, HORIZONTAL_ALIGNMENT_LEFT, -1, 20).x
	_text(f, ok_r.position + Vector2(ok_r.size.x * 0.5 - okw * 0.5, 34.0), okl, 20,
		Color(0.9, 1.0, 0.95))
	tap.add(ok_r, "ok")

	var back_r := Rect2(46.0, h - 84.0, 150.0, 52.0)
	draw_rect(back_r, Color(0.16, 0.17, 0.24, 0.9))
	draw_rect(back_r, Color(0.5, 0.55, 0.72, 0.6), false, 1.6)
	var bkl := "返回"
	var bkw := f.get_string_size(bkl, HORIZONTAL_ALIGNMENT_LEFT, -1, 20).x
	_text(f, back_r.position + Vector2(back_r.size.x * 0.5 - bkw * 0.5, 34.0), bkl, 20,
		Color(0.8, 0.84, 0.95))
	tap.add(back_r, "back")

	if message_t > 0.0:
		var a: float = clampf(message_t / 0.5, 0.0, 1.0)
		var mw := f.get_string_size(message, HORIZONTAL_ALIGNMENT_LEFT, -1, 18).x
		draw_rect(Rect2(w * 0.5 - mw * 0.5 - 18.0, h - 148.0, mw + 36.0, 34.0),
			Color(0.05, 0.06, 0.1, 0.85 * a))
		_text(f, Vector2(w * 0.5 - mw * 0.5, h - 124.0), message, 18, Color(1, 0.85, 0.5, a))

	tap.commit()


func _draw_tabs(f: Font) -> void:
	var labels := ["屬性", "造型"]
	var x := 46.0
	for i in labels.size():
		var sel := tab == i
		var lw := f.get_string_size(labels[i], HORIZONTAL_ALIGNMENT_LEFT, -1, 20).x
		var r := Rect2(x, 118.0, lw + 44.0, 40.0)
		var bg: Color = Color(0.5, 0.45, 0.9, 0.22) if sel else Color(0.08, 0.09, 0.14, 0.85)
		draw_rect(r, bg)
		if sel:
			draw_rect(r, Color(0.8, 0.7, 1.0, 0.55 + 0.3 * sin(t * 5.0)), false, 2.0)
			draw_line(Vector2(r.position.x + 6, r.end.y - 2), Vector2(r.end.x - 6, r.end.y - 2),
				Color(0.85, 0.75, 1.0, 0.9), 2.5)
		else:
			draw_rect(r, Color(0.3, 0.34, 0.5, 0.35), false, 1.0)
		var lc: Color = Color(1, 1, 1) if sel else Color(0.65, 0.7, 0.86)
		_text(f, Vector2(r.position.x + 22.0, r.position.y + 27.0), labels[i], 20, lc)
		tap.add(r, "tab%d" % i)
		x += r.size.x + 10.0


func _row_frame(r: Rect2, col: Color, selected: bool) -> void:
	var bg := Color(0.08, 0.09, 0.14, 0.9)
	if selected:
		bg = Color(col.r * 0.2, col.g * 0.2, col.b * 0.24, 0.95)
	draw_rect(r, bg)
	if selected:
		draw_rect(r, Color(col.r, col.g, col.b, 0.55 + 0.3 * sin(t * 6.0)), false, 2.4)
	else:
		draw_rect(r, Color(0.28, 0.32, 0.46, 0.35), false, 1.0)


func _draw_element_row(f: Font, r: Rect2, id: String, selected: bool) -> void:
	var data: Dictionary = Game.ELEMENTS[id]
	var col: Color = data["color"]
	var owned := Game.is_unlocked(id)
	_row_frame(r, col, selected)

	var dim: float = 1.0 if owned else 0.4
	var c := r.position + Vector2(32, r.size.y * 0.5)
	draw_circle(c, 18.0, Color(col.r, col.g, col.b, 0.14 * dim))
	draw_colored_polygon(Fx.star(c, 6, 12.5, 5.2, t * 0.8), Color(col.r, col.g, col.b, dim))
	draw_circle(c, 3.8, Color(1, 1, 1, 0.85 * dim))

	var name_col: Color = col if owned else Color(0.5, 0.53, 0.64)
	_text(f, r.position + Vector2(62, r.size.y * 0.5 - 2.0), str(data["name"]), 18, name_col)
	_text(f, r.position + Vector2(62, r.size.y * 0.5 + 16.0), str(data["tagline"]), 12,
		Color(0.72, 0.76, 0.9))

	var label := ""
	var lc := Color.WHITE
	if Game.equipped == id:
		label = "使用中"
		lc = Color(0.5, 1.0, 0.65)
	elif owned:
		label = "已擁有"
		lc = Color(0.75, 0.85, 1.0)
	else:
		var price := Game.price_of(id)
		label = "%d 金幣" % price
		if price == 0:
			label = "免費"
		lc = Color(1, 0.85, 0.4) if Game.coins >= price else Color(0.9, 0.45, 0.45)
	var lw := f.get_string_size(label, HORIZONTAL_ALIGNMENT_LEFT, -1, 14).x
	_text(f, Vector2(r.end.x - lw - 14.0, r.position.y + r.size.y * 0.5 + 5.0), label, 14, lc)


## 五個部位的切換列（頭／胸／腹／腳／手）
func _draw_slot_bar(f: Font, x0: float, y: float) -> void:
	var x := x0
	for i in Game.PART_SLOTS.size():
		var slot: String = Game.PART_SLOTS[i]
		var sel := i == slot_index
		var r := Rect2(x, y, 96.0, 44.0)
		draw_rect(r, Color(0.3, 0.35, 0.6, 0.3) if sel else Color(0.08, 0.09, 0.14, 0.9))
		draw_rect(r, Color(0.7, 0.8, 1.0, 0.8) if sel else Color(0.3, 0.34, 0.5, 0.35),
			false, 2.0 if sel else 1.0)
		var nm: String = Game.SLOT_NAMES[slot]
		var cur: String = Game.equipped_part(slot)
		var cur_name: String = str(Game.part_data(slot, cur).get("name", cur))
		_text(f, r.position + Vector2(10, 20), nm, 18,
			Color(1, 1, 1) if sel else Color(0.7, 0.74, 0.88))
		_text(f, r.position + Vector2(10, 36), cur_name, 11, Color(0.68, 0.76, 0.95))
		tap.add(r, "slot%d" % i)
		x += r.size.x + 8.0


func _draw_skin_row(f: Font, r: Rect2, id: String, selected: bool) -> void:
	var slot := _slot()
	var data: Dictionary = Game.part_data(slot, id)
	var col: Color = Game.element_color(Game.equipped)
	var owned := Game.is_part_unlocked(slot, id)
	_row_frame(r, col, selected)

	var dim: float = 1.0 if owned else 0.45
	# 圖示：只戴這一件部位的火柴人，讓玩家一眼看出差別
	var preview := Game.build_look(Game.equipped)
	for s in Game.PART_SLOTS:
		preview[s] = Game.DEFAULT_PARTS[s]
	preview[slot] = id
	var sc: float = clampf((r.size.y - 6.0) / 88.0, 0.26, 0.46)
	var c := r.position + Vector2(32, r.size.y - 4.0)
	var j := StickFigure.joints("idle", 0.0, t * 3.0, 1, false)
	draw_set_transform(c, 0.0, Vector2(sc, sc))
	StickFigure.draw_figure(self, j, Color(col.r, col.g, col.b, dim), 5.2 * 1.5, 0.55, preview, t)
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)

	var name_col: Color = col if owned else Color(0.5, 0.53, 0.64)
	_text(f, r.position + Vector2(66, r.size.y * 0.5 - 2.0), str(data.get("name", id)), 18, name_col)
	_text(f, r.position + Vector2(66, r.size.y * 0.5 + 16.0), str(data.get("desc", "")), 12,
		Color(0.72, 0.76, 0.9))

	var label := ""
	var lc := Color.WHITE
	if Game.equipped_part(slot) == id:
		label = "穿戴中"
		lc = Color(0.5, 1.0, 0.65)
	elif owned:
		label = "已擁有"
		lc = Color(0.75, 0.85, 1.0)
	else:
		var price := Game.part_price(slot, id)
		label = "%d 金幣" % price
		lc = Color(1, 0.85, 0.4) if Game.coins >= price else Color(0.9, 0.45, 0.45)
	var lw := f.get_string_size(label, HORIZONTAL_ALIGNMENT_LEFT, -1, 14).x
	_text(f, Vector2(r.end.x - lw - 14.0, r.position.y + r.size.y * 0.5 + 5.0), label, 14, lc)


func _draw_preview(f: Font, r: Rect2) -> void:
	draw_rect(r, Color(0.06, 0.07, 0.12, 0.92))
	draw_rect(r, Color(0.4, 0.45, 0.7, 0.4), false, 1.6)

	var id: String = _entries()[index]
	if tab == Tab.ELEMENT:
		_draw_element_preview(f, r, id)
	else:
		_draw_skin_preview(f, r, id)


func _draw_element_preview(f: Font, r: Rect2, id: String) -> void:
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
		var badge := Rect2(r.position.x + 28.0, y - 22.0, 62.0, 26.0)
		draw_rect(badge, Color(col.r, col.g, col.b, 0.18))
		draw_rect(badge, Color(col.r, col.g, col.b, 0.6), false, 1.2)
		_text(f, badge.position + Vector2(9, 19), keys[i], 13, Color(1, 0.95, 0.8))
		_text(f, Vector2(r.position.x + 102.0, y), str(m["name"]), 19, col)

		var title_w := f.get_string_size(str(m["name"]), HORIZONTAL_ALIGNMENT_LEFT, -1, 19).x
		if i < Fighter.FREE_MOVE_COUNT:
			var tag := Rect2(r.position.x + 112.0 + title_w, y - 17.0, 56.0, 20.0)
			draw_rect(tag, Color(0.35, 0.85, 0.55, 0.18))
			draw_rect(tag, Color(0.45, 0.95, 0.6, 0.6), false, 1.0)
			_text(f, tag.position + Vector2(7, 15), "無冷卻", 11, Color(0.6, 1.0, 0.75))
		_text(f, Vector2(r.position.x + 30.0, y + 26.0), str(m["desc"]), 13, Color(0.8, 0.84, 0.96))
		y += 76.0


func _draw_skin_preview(f: Font, r: Rect2, id: String) -> void:
	var slot := _slot()
	var part: Dictionary = Game.part_data(slot, id)
	# 預覽 = 目前完整穿著，但把正在挑選的部位換成游標所指的選項
	var data := Game.build_look(Game.equipped)
	data[slot] = id
	var col: Color = data["body"]

	_text(f, r.position + Vector2(28, 44), "%s・%s" % [Game.SLOT_NAMES[slot],
		str(part.get("name", id))], 26, col)
	_text(f, r.position + Vector2(28, 70), str(part.get("desc", "")), 14, Color(0.72, 0.76, 0.92))
	draw_line(r.position + Vector2(28, 88), r.position + Vector2(r.size.x - 28, 88),
		Color(col.r, col.g, col.b, 0.35), 1.5)

	# 目前完整搭配一覽
	var parts_line := ""
	for s in Game.PART_SLOTS:
		var opt: String = id if s == slot else Game.equipped_part(s)
		parts_line += "%s %s　" % [Game.SLOT_NAMES[s],
			str(Game.part_data(s, opt).get("name", opt))]
	_text(f, r.position + Vector2(28, 112), parts_line, 13, Color(0.68, 0.74, 0.9))

	# 站台
	var stage := Vector2(r.position.x + r.size.x * 0.5, r.position.y + r.size.y * 0.72)
	draw_set_transform(stage, 0.0, Vector2(1.0, 0.3))
	draw_circle(Vector2.ZERO, 92.0, Color(col.r, col.g, col.b, 0.10))
	draw_arc(Vector2.ZERO, 92.0, 0, TAU, 40, Color(col.r, col.g, col.b, 0.35), 2.0, true)
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)

	# 大張的動態預覽。
	# draw_set_transform 的縮放會連線寬一起放大，直接用原始寬度四肢會糊成一團，
	# 因此把線寬除回去，只留下略粗於實戰的視覺。
	const PREVIEW_SCALE := 2.3
	var j := StickFigure.joints(_preview_pose, fposmod(_preview_t, 0.5), t * 5.0, 1, false)
	draw_set_transform(stage, 0.0, Vector2(PREVIEW_SCALE, PREVIEW_SCALE))
	StickFigure.draw_figure(self, j, col,
		float(data.get("width", 5.0)) * 1.25 / PREVIEW_SCALE, 0.55, data, t)
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)

	# 特性標籤
	var tags := []
	if data.get("glow", false):
		tags.append(["發光輪廓", Color(1, 0.9, 0.5)])
	if float(data.get("limb_w", 1.0)) > 1.1:
		tags.append(["體格強化", Color(1, 0.75, 0.6)])
	if slot == "hands" and id == "heavy":
		tags.append(["普攻更重", Color(1, 0.7, 0.5)])

	var x := r.position.x + 28.0
	var ty := r.end.y - 34.0
	for tag in tags:
		var label: String = tag[0]
		var tc: Color = tag[1]
		var tw := f.get_string_size(label, HORIZONTAL_ALIGNMENT_LEFT, -1, 13).x
		var rect := Rect2(x, ty - 18.0, tw + 20.0, 24.0)
		draw_rect(rect, Color(tc.r, tc.g, tc.b, 0.16))
		draw_rect(rect, Color(tc.r, tc.g, tc.b, 0.6), false, 1.0)
		_text(f, Vector2(x + 10.0, ty), label, 13, tc)
		x += rect.size.x + 8.0


func _text(f: Font, pos: Vector2, s: String, sz: int, col: Color) -> void:
	draw_string(f, pos + Vector2(1, 1), s, HORIZONTAL_ALIGNMENT_LEFT, -1, sz, Color(0, 0, 0, col.a * 0.7))
	draw_string(f, pos, s, HORIZONTAL_ALIGNMENT_LEFT, -1, sz, col)
