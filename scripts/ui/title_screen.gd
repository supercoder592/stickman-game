extends Control
##
## 主畫面。標題、選單、以及一段用程式畫出來的動態背景
## （漸層夜空 + 遠山 + 九顆環繞的元素光球 + 揮拳的火柴人剪影）。
##

signal start_pressed()
signal online_pressed()
signal shop_pressed()
signal quit_pressed()

## 網頁版可透過 WebSocket 中繼連線（區網房號與 P2P 打洞需要 UDP，瀏覽器不支援）；
## 另外網頁版沒有「離開遊戲」的意義，故移除。
static func menu_items() -> Array:
	if OS.has_feature("web"):
		return ["單機對戰", "連線對戰", "商店", "操作說明"]
	return ["單機對戰", "連線對戰", "商店", "操作說明", "離開遊戲"]

var ITEMS: Array = []

var main = null
var index := 0
var t := 0.0
var show_help := false
var tap := TapRouter.new()


func bind(m) -> void:
	main = m
	ITEMS = menu_items()


func on_shown() -> void:
	if ITEMS.is_empty():
		ITEMS = menu_items()
	index = 0
	show_help = false


func _process(delta: float) -> void:
	t += delta
	queue_redraw()


## 觸控／滑鼠：手機上沒有鍵盤，選單必須能點
func _input(event: InputEvent) -> void:
	if not visible:
		return
	if show_help:
		if TapRouter.is_press(event):
			show_help = false
			get_viewport().set_input_as_handled()
		return
	var action := tap.hit(event)
	if action == "":
		return
	index = int(action)
	_activate()
	get_viewport().set_input_as_handled()
	queue_redraw()


func _activate() -> void:
	match str(ITEMS[index]):
		"單機對戰": start_pressed.emit()
		"連線對戰": online_pressed.emit()
		"商店": shop_pressed.emit()
		"操作說明": show_help = true
		"離開遊戲": quit_pressed.emit()


func _unhandled_input(event: InputEvent) -> void:
	if not visible:
		return
	var k := event as InputEventKey
	if k == null or not k.pressed or k.echo:
		return
	if show_help:
		show_help = false
		get_viewport().set_input_as_handled()
		return
	match k.keycode:
		KEY_W, KEY_UP:
			index = (index - 1 + ITEMS.size()) % ITEMS.size()
		KEY_S, KEY_DOWN:
			index = (index + 1) % ITEMS.size()
		KEY_ENTER, KEY_KP_ENTER, KEY_SPACE:
			# 用項目名稱分派，因為網頁版的選單少兩項、索引會位移
			_activate()
		KEY_ESCAPE:
			quit_pressed.emit()
		KEY_F5:
			Game.toggle_mobile_mode()
	get_viewport().set_input_as_handled()
	queue_redraw()


# ------------------------------------------------------------------ 繪製
func _draw() -> void:
	var f: Font = Game.ui_font
	if f == null:
		return
	var w := size.x
	var h := size.y

	tap.begin()
	_draw_background(w, h)
	_draw_orbs(w, h)
	_draw_title(f, w, h)

	if show_help:
		_draw_help(f, w, h)
	else:
		_draw_menu(f, w, h)
	tap.commit()

	var skin_name := str(Game.current_skin().get("name", "白練"))
	var mob: String = "開" if Game.mobile_mode else "關"
	var foot := "%d 勝　·　%d 金幣　·　造型：%s　·　手機模式：%s（F5 切換）" \
		% [Game.wins, Game.coins, skin_name, mob]
	if OS.has_feature("web"):
		foot += "　·　網頁版連線需填 wss:// 中繼位址"
	var fw := f.get_string_size(foot, HORIZONTAL_ALIGNMENT_LEFT, -1, 14).x
	_text(f, Vector2(w * 0.5 - fw * 0.5, h - 30.0), foot, 14, Color(0.6, 0.66, 0.85))


func _draw_background(w: float, h: float) -> void:
	var bands := 26
	for i in bands:
		var u := float(i) / float(bands - 1)
		var c := Color(0.04, 0.05, 0.10).lerp(Color(0.18, 0.14, 0.30), u)
		draw_rect(Rect2(0, h * u, w, h / float(bands) + 2.0), c)

	for i in 90:
		var sx: float = fposmod(float(i) * 137.5, w)
		var sy: float = fposmod(float(i) * 71.3, h * 0.75)
		var tw: float = 0.3 + 0.4 * sin(t * 1.6 + float(i) * 0.7)
		draw_circle(Vector2(sx, sy), 1.3, Color(1, 1, 1, tw * 0.5))

	# 遠山兩層
	for layer in 2:
		var base := h * (0.80 + 0.08 * float(layer))
		var amp := 150.0 - float(layer) * 50.0
		var col: Color = Color(0.09, 0.10, 0.19) if layer == 0 else Color(0.13, 0.13, 0.24)
		var pts := PackedVector2Array([Vector2(-40, h)])
		var x := -40.0
		var i2 := 0
		while x < w + 60.0:
			var hh: float = amp * (0.45 + 0.55 * absf(sin(x * 0.0042 + float(layer) * 2.1 + float(i2))))
			pts.append(Vector2(x + 70.0, base - hh))
			x += 140.0
			i2 += 1
		pts.append(Vector2(w + 40.0, h))
		draw_colored_polygon(pts, col)

	# 地面
	draw_rect(Rect2(0, h * 0.88, w, h * 0.12), Color(0.10, 0.11, 0.15))
	draw_line(Vector2(0, h * 0.88), Vector2(w, h * 0.88), Color(0.34, 0.4, 0.55), 2.5)

	# 揮拳的火柴人剪影
	var pose_t: float = fposmod(t, 2.2)
	var pose := "idle"
	if pose_t > 1.4 and pose_t < 1.7:
		pose = "punch_up"
	elif pose_t > 0.7 and pose_t < 1.0:
		pose = "punch"
	var j := StickFigure.joints(pose, fposmod(pose_t, 0.3), t * 4.0, 1, false)
	draw_set_transform(Vector2(w * 0.80, h * 0.88), 0.0, Vector2(2.1, 2.1))
	StickFigure.draw_figure(self, j, Color(0.05, 0.05, 0.09, 0.92), 5.0, 0.7)
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


## 九顆元素光球繞著標題緩慢公轉
func _draw_orbs(w: float, h: float) -> void:
	var cx := w * 0.5
	var cy := h * 0.42
	for i in Game.ELEMENT_ORDER.size():
		var id: String = Game.ELEMENT_ORDER[i]
		var col: Color = Game.element_color(id)
		var ang := t * 0.32 + TAU * float(i) / float(Game.ELEMENT_ORDER.size())
		var p := Vector2(cx + cos(ang) * w * 0.36, cy + sin(ang) * h * 0.3)
		var pulse := 0.75 + 0.25 * sin(t * 2.2 + float(i))
		draw_circle(p, 26.0 * pulse, Color(col.r, col.g, col.b, 0.10))
		draw_circle(p, 13.0 * pulse, Color(col.r, col.g, col.b, 0.30))
		draw_colored_polygon(Fx.star(p, 6, 11.0 * pulse, 4.4 * pulse, t * 0.8 + float(i)),
			Color(col.r, col.g, col.b, 0.9))
		draw_circle(p, 3.0, Color(1, 1, 1, 0.85))


func _draw_title(f: Font, w: float, h: float) -> void:
	var title := "元素極限"
	var sub := "火柴人大亂鬥"
	var tw := f.get_string_size(title, HORIZONTAL_ALIGNMENT_LEFT, -1, 82).x
	var sw := f.get_string_size(sub, HORIZONTAL_ALIGNMENT_LEFT, -1, 34).x

	# 標題底板（要容得下主標題 + 副標題，否則兩行會疊在一起）
	var panel_w: float = maxf(tw, sw) + 96.0
	draw_rect(Rect2(w * 0.5 - panel_w * 0.5, h * 0.16, panel_w, 172.0),
		Color(0.05, 0.06, 0.12, 0.55))

	var glow := 0.5 + 0.5 * sin(t * 1.8)
	draw_string(f, Vector2(w * 0.5 - tw * 0.5 + 3, h * 0.16 + 88.0), title,
		HORIZONTAL_ALIGNMENT_LEFT, -1, 82, Color(0.7, 0.4, 1.0, 0.35 + glow * 0.25))
	draw_string(f, Vector2(w * 0.5 - tw * 0.5, h * 0.16 + 85.0), title,
		HORIZONTAL_ALIGNMENT_LEFT, -1, 82, Color(0.97, 0.98, 1.0))
	# 分隔線 + 副標題，兩者拉開足夠距離
	draw_line(Vector2(w * 0.5 - panel_w * 0.36, h * 0.16 + 110.0),
		Vector2(w * 0.5 + panel_w * 0.36, h * 0.16 + 110.0),
		Color(0.65, 0.5, 1.0, 0.45), 1.5)
	_text(f, Vector2(w * 0.5 - sw * 0.5, h * 0.16 + 152.0), sub, 34, Color(0.75, 0.8, 1.0))


func _draw_menu(f: Font, w: float, h: float) -> void:
	var y := h * 0.55
	for i in ITEMS.size():
		var label: String = ITEMS[i]
		var sel := i == index
		var sz: int = 26 if sel else 22
		var lw := f.get_string_size(label, HORIZONTAL_ALIGNMENT_LEFT, -1, sz).x
		var x := w * 0.5 - lw * 0.5
		if sel:
			var pulse := 0.55 + 0.35 * sin(t * 5.5)
			draw_rect(Rect2(x - 34.0, y - 26.0, lw + 68.0, 40.0), Color(0.5, 0.4, 0.95, 0.18))
			draw_rect(Rect2(x - 34.0, y - 26.0, lw + 68.0, 40.0), Color(0.75, 0.6, 1.0, pulse), false, 2.0)
			# 左右指示三角
			draw_colored_polygon(PackedVector2Array([
				Vector2(x - 50.0, y - 14.0), Vector2(x - 50.0, y - 0.0), Vector2(x - 40.0, y - 7.0),
			]), Color(0.85, 0.75, 1.0, pulse))
		var item_col: Color = Color(1, 1, 1) if sel else Color(0.68, 0.72, 0.88)
		_text(f, Vector2(x, y), label, sz, item_col)
		# 可點區域刻意放大到整條橫幅，手指才好按
		tap.add(Rect2(w * 0.5 - 220.0, y - 30.0, 440.0, 48.0), str(i))
		y += 52.0

	var hint := "↑↓ 選擇　Enter 確定　（手機可直接點）"
	var hw := f.get_string_size(hint, HORIZONTAL_ALIGNMENT_LEFT, -1, 14).x
	_text(f, Vector2(w * 0.5 - hw * 0.5, h - 56.0), hint, 14, Color(0.55, 0.6, 0.78))


func _draw_help(f: Font, w: float, h: float) -> void:
	var panel := Rect2(w * 0.5 - 320.0, h * 0.5 - 175.0, 640.0, 350.0)
	draw_rect(panel, Color(0.05, 0.06, 0.11, 0.96))
	draw_rect(panel, Color(0.5, 0.55, 0.85, 0.5), false, 2.0)
	_text(f, panel.position + Vector2(28, 48), "操作說明", 26, Color(0.95, 0.97, 1.0))

	var lines := [
		["A / D　（或 ← →）", "左右移動"],
		["W / Space", "跳躍（可變高度）"],
		["J", "普通攻擊"],
		["U　或　1", "元素招式一（本命招）"],
		["I　或　2", "元素招式二"],
		["O　或　3", "元素招式三"],
		["Esc", "返回 / 離開"],
	]
	var y := panel.position.y + 92.0
	for row in lines:
		_text(f, Vector2(panel.position.x + 40.0, y), str(row[0]), 17, Color(1, 0.9, 0.55))
		_text(f, Vector2(panel.position.x + 260.0, y), str(row[1]), 17, Color(0.85, 0.88, 1.0))
		y += 32.0

	var tip := "毒沼引爆與御劍術為二段式：再按一次同一鍵觸發第二段。"
	_text(f, Vector2(panel.position.x + 40.0, panel.end.y - 30.0), tip, 13, Color(0.6, 0.66, 0.85))


func _text(f: Font, pos: Vector2, s: String, sz: int, col: Color) -> void:
	draw_string(f, pos + Vector2(1, 1), s, HORIZONTAL_ALIGNMENT_LEFT, -1, sz, Color(0, 0, 0, 0.7))
	draw_string(f, pos, s, HORIZONTAL_ALIGNMENT_LEFT, -1, sz, col)
