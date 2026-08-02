extends Control
##
## 連線大廳：建立房間（顯示 4 位數房號）／加入房間（輸入房號）／雙方選元素 → 開打。
##

signal cancelled()
signal battle_ready(my_element: String, foe_element: String, is_host: bool)

enum Phase { MENU, CODE_INPUT, IP_INPUT, RELAY_ADDR, RELAY_CODE, WAITING, PICK }

const MENU_ITEMS := [
	"建立房間（區網）",
	"加入房間（區網房號）",
	"跨網連線（P2P，失敗自動轉中繼）",
	"用 IP 連線",
	"返回",
]

var main = null
var phase: int = Phase.MENU
var menu_index := 0
var pick_index := 0
var code_buf := ""
var status := ""
var t := 0.0


func bind(m) -> void:
	main = m
	Net.room_created.connect(_on_room_created)
	Net.peer_joined.connect(_on_peer_joined)
	Net.peer_left.connect(_on_peer_left)
	Net.joined_room.connect(_on_joined)
	Net.join_failed.connect(_on_join_failed)
	Net.lobby_updated.connect(func(): queue_redraw())
	Net.battle_started.connect(_on_battle_started)


func on_shown() -> void:
	phase = Phase.MENU
	menu_index = 0
	code_buf = ""
	status = ""
	pick_index = 0
	for i in Game.ELEMENT_ORDER.size():
		if Game.ELEMENT_ORDER[i] == Game.equipped:
			pick_index = i
			break


func _process(delta: float) -> void:
	t += delta
	queue_redraw()


# ------------------------------------------------------------------ 網路事件
func _on_room_created(code: String) -> void:
	phase = Phase.WAITING
	status = "房號 %s　等待對手加入…" % code


func _on_joined() -> void:
	phase = Phase.PICK
	status = "已連線！請選擇元素"
	_push_pick()


func _on_peer_joined() -> void:
	phase = Phase.PICK
	status = "對手已加入！請選擇元素"
	_push_pick()


func _on_peer_left() -> void:
	phase = Phase.MENU
	status = "對手已離開"


func _on_join_failed(reason: String) -> void:
	phase = Phase.MENU
	status = reason


func _on_battle_started(mine: String, foe: String) -> void:
	battle_ready.emit(mine, foe, Net.is_host())


func _push_pick() -> void:
	var id: String = Game.ELEMENT_ORDER[pick_index]
	if Game.is_unlocked(id):
		Game.equip(id)
		Net.set_my_element(id)


# ------------------------------------------------------------------ 輸入
func _unhandled_input(event: InputEvent) -> void:
	if not visible:
		return
	var k := event as InputEventKey
	if k == null or not k.pressed or k.echo:
		return
	match phase:
		Phase.MENU:
			_input_menu(k)
		Phase.CODE_INPUT:
			_input_code(k)
		Phase.IP_INPUT:
			_input_ip(k)
		Phase.RELAY_ADDR:
			_input_relay_addr(k)
		Phase.RELAY_CODE:
			_input_relay_code(k)
		Phase.WAITING:
			if k.keycode == KEY_ESCAPE:
				Net.shutdown()
				phase = Phase.MENU
				status = ""
		Phase.PICK:
			_input_pick(k)
	get_viewport().set_input_as_handled()
	queue_redraw()


func _input_menu(k: InputEventKey) -> void:
	match k.keycode:
		KEY_W, KEY_UP:
			menu_index = (menu_index - 1 + MENU_ITEMS.size()) % MENU_ITEMS.size()
		KEY_S, KEY_DOWN:
			menu_index = (menu_index + 1) % MENU_ITEMS.size()
		KEY_ENTER, KEY_KP_ENTER, KEY_SPACE:
			match menu_index:
				0:
					status = "建立房間中…"
					Net.host_room()
				1:
					phase = Phase.CODE_INPUT
					code_buf = ""
					status = "輸入 4 位數房號"
				2:
					phase = Phase.RELAY_ADDR
					code_buf = Game.relay_address
					status = "輸入中繼伺服器位址（雙方輸入同一台）"
				3:
					phase = Phase.IP_INPUT
					code_buf = ""
					status = "輸入主機的 IP（房號搜尋失敗時用這個）"
				4:
					Net.shutdown()
					cancelled.emit()
		KEY_ESCAPE:
			Net.shutdown()
			cancelled.emit()


func _input_code(k: InputEventKey) -> void:
	if k.keycode >= KEY_0 and k.keycode <= KEY_9 and code_buf.length() < 4:
		code_buf += str(k.keycode - KEY_0)
	elif k.keycode >= KEY_KP_0 and k.keycode <= KEY_KP_9 and code_buf.length() < 4:
		code_buf += str(k.keycode - KEY_KP_0)
	elif k.keycode == KEY_BACKSPACE:
		code_buf = code_buf.substr(0, maxi(0, code_buf.length() - 1))
	elif k.keycode == KEY_ENTER or k.keycode == KEY_KP_ENTER:
		if code_buf.length() == 4:
			status = "搜尋房號 %s …" % code_buf
			Net.join_room(code_buf)
		else:
			status = "房號需要 4 位數"
	elif k.keycode == KEY_ESCAPE:
		phase = Phase.MENU
		status = ""


## IP 直連：跨網段、開了 AP 隔離、或做了連接埠轉發時使用
func _input_ip(k: InputEventKey) -> void:
	if k.keycode >= KEY_0 and k.keycode <= KEY_9 and code_buf.length() < 15:
		code_buf += str(k.keycode - KEY_0)
	elif k.keycode >= KEY_KP_0 and k.keycode <= KEY_KP_9 and code_buf.length() < 15:
		code_buf += str(k.keycode - KEY_KP_0)
	elif (k.keycode == KEY_PERIOD or k.keycode == KEY_KP_PERIOD) and code_buf.length() < 15:
		code_buf += "."
	elif k.keycode == KEY_BACKSPACE:
		code_buf = code_buf.substr(0, maxi(0, code_buf.length() - 1))
	elif k.keycode == KEY_ENTER or k.keycode == KEY_KP_ENTER:
		if code_buf.count(".") == 3:
			status = "連線到 %s …" % code_buf
			Net.join_by_ip(code_buf)
		else:
			status = "IP 格式不正確（例如 192.168.1.23）"
	elif k.keycode == KEY_ESCAPE:
		phase = Phase.MENU
		status = ""


## 跨網連線第一步：中繼伺服器位址（記住，下次不用再打）
func _input_relay_addr(k: InputEventKey) -> void:
	if k.keycode >= KEY_0 and k.keycode <= KEY_9 and code_buf.length() < 60:
		code_buf += str(k.keycode - KEY_0)
	elif k.keycode >= KEY_KP_0 and k.keycode <= KEY_KP_9 and code_buf.length() < 60:
		code_buf += str(k.keycode - KEY_KP_0)
	elif k.keycode >= KEY_A and k.keycode <= KEY_Z and code_buf.length() < 60:
		code_buf += char(k.keycode + 32)          # 網域名稱用小寫
	elif (k.keycode == KEY_PERIOD or k.keycode == KEY_KP_PERIOD) and code_buf.length() < 60:
		code_buf += "."
	elif k.keycode == KEY_MINUS and code_buf.length() < 60:
		code_buf += "-"
	elif k.keycode == KEY_BACKSPACE:
		code_buf = code_buf.substr(0, maxi(0, code_buf.length() - 1))
	elif k.keycode == KEY_ENTER or k.keycode == KEY_KP_ENTER:
		if code_buf.strip_edges() == "":
			status = "請輸入中繼伺服器的 IP 或網域"
			return
		Game.relay_address = code_buf
		Game.save_game()
		phase = Phase.RELAY_CODE
		code_buf = ""
		status = "輸入 4 位數房號 —— 雙方輸入同一組即可配對"
	elif k.keycode == KEY_ESCAPE:
		phase = Phase.MENU
		status = ""


## 跨網連線第二步：房號（先到的人自動成為主機）
func _input_relay_code(k: InputEventKey) -> void:
	if k.keycode >= KEY_0 and k.keycode <= KEY_9 and code_buf.length() < 4:
		code_buf += str(k.keycode - KEY_0)
	elif k.keycode >= KEY_KP_0 and k.keycode <= KEY_KP_9 and code_buf.length() < 4:
		code_buf += str(k.keycode - KEY_KP_0)
	elif k.keycode == KEY_BACKSPACE:
		code_buf = code_buf.substr(0, maxi(0, code_buf.length() - 1))
	elif k.keycode == KEY_ENTER or k.keycode == KEY_KP_ENTER:
		if code_buf.length() == 4:
			status = "P2P 打洞中…（失敗會自動改用中繼）"
			Net.join_via_p2p(Game.relay_address, code_buf)
		else:
			status = "房號需要 4 位數"
	elif k.keycode == KEY_ESCAPE:
		phase = Phase.RELAY_ADDR
		code_buf = Game.relay_address
		status = ""


func _input_pick(k: InputEventKey) -> void:
	var count := Game.ELEMENT_ORDER.size()
	match k.keycode:
		KEY_W, KEY_UP:
			pick_index = (pick_index - 1 + count) % count
			_push_pick()
		KEY_S, KEY_DOWN:
			pick_index = (pick_index + 1) % count
			_push_pick()
		KEY_ENTER, KEY_KP_ENTER, KEY_SPACE:
			var id: String = Game.ELEMENT_ORDER[pick_index]
			if not Game.is_unlocked(id):
				status = "%s 尚未解鎖 —— 請到商店購買" % Game.element_name(id)
				return
			Net.set_my_element(id)
			Net.set_ready(not Net.my_ready)
			status = "已準備，等待對手…" if Net.my_ready else "已取消準備"
			if Net.is_host() and Net.both_ready():
				Net.start_battle()
		KEY_ESCAPE:
			Net.shutdown()
			phase = Phase.MENU
			status = ""


# ------------------------------------------------------------------ 繪製
func _draw() -> void:
	var f: Font = Game.ui_font
	if f == null:
		return
	var w := size.x
	var h := size.y

	var bands := 20
	for i in bands:
		var u := float(i) / float(bands - 1)
		draw_rect(Rect2(0, h * u, w, h / float(bands) + 2.0),
			Color(0.04, 0.05, 0.09).lerp(Color(0.10, 0.13, 0.22), u))

	_text(f, Vector2(46, 62), "連線對戰", 32, Color(0.96, 0.97, 1.0))
	_text(f, Vector2(46, 90), "同一個區域網路（或同一個手機熱點）內用房號配對", 14,
		Color(0.58, 0.64, 0.84))

	match phase:
		Phase.MENU:
			_draw_menu(f, w, h)
		Phase.CODE_INPUT:
			_draw_code(f, w, h)
		Phase.IP_INPUT:
			_draw_ip(f, w, h)
		Phase.RELAY_ADDR:
			_draw_text_entry(f, w, h, "牽線伺服器位址", "例如 203.0.113.5 或 relay.example.com", [
				"跨網路對戰需要一台雙方都連得到的伺服器來交換位址。",
				"用 `godot --headless --path . -- --relay` 就能把它跑起來。",
				"連線會先嘗試 P2P 直連（流量不經過伺服器、延遲最低）；",
				"若你的網路是 symmetric NAT 或電信商 CGNAT 打不通，會自動改走中繼。",
			])
		Phase.RELAY_CODE:
			_draw_code(f, w, h)
		Phase.WAITING:
			_draw_waiting(f, w, h)
		Phase.PICK:
			_draw_pick(f, w, h)

	if status != "":
		var sw := f.get_string_size(status, HORIZONTAL_ALIGNMENT_LEFT, -1, 16).x
		_text(f, Vector2(w * 0.5 - sw * 0.5, h - 52.0), status, 16, Color(0.9, 0.86, 0.6))


func _draw_menu(f: Font, w: float, h: float) -> void:
	var y := h * 0.44
	for i in MENU_ITEMS.size():
		var sel := i == menu_index
		var sz: int = 26 if sel else 22
		var lw := f.get_string_size(MENU_ITEMS[i], HORIZONTAL_ALIGNMENT_LEFT, -1, sz).x
		var x := w * 0.5 - lw * 0.5
		if sel:
			var pulse := 0.55 + 0.35 * sin(t * 5.5)
			draw_rect(Rect2(x - 34.0, y - 26.0, lw + 68.0, 40.0), Color(0.4, 0.5, 0.95, 0.18))
			draw_rect(Rect2(x - 34.0, y - 26.0, lw + 68.0, 40.0), Color(0.6, 0.7, 1.0, pulse), false, 2.0)
		var col: Color = Color(1, 1, 1) if sel else Color(0.68, 0.72, 0.88)
		_text(f, Vector2(x, y), MENU_ITEMS[i], sz, col)
		y += 54.0


## 4 位數房號輸入格
func _draw_code(f: Font, w: float, h: float) -> void:
	var box := 78.0
	var gap := 16.0
	var total := box * 4.0 + gap * 3.0
	var x0 := w * 0.5 - total * 0.5
	var y := h * 0.40
	for i in 4:
		var r := Rect2(x0 + float(i) * (box + gap), y, box, box * 1.15)
		var filled := i < code_buf.length()
		var active := i == code_buf.length()
		draw_rect(r, Color(0.07, 0.08, 0.14, 0.95))
		var edge := Color(0.3, 0.35, 0.5, 0.6)
		if active:
			edge = Color(0.6, 0.8, 1.0, 0.5 + 0.4 * sin(t * 6.0))
		elif filled:
			edge = Color(0.5, 0.9, 0.7, 0.85)
		draw_rect(r, edge, false, 2.4)
		if filled:
			var ch := code_buf[i]
			var cw := f.get_string_size(ch, HORIZONTAL_ALIGNMENT_LEFT, -1, 52).x
			_text(f, Vector2(r.position.x + box * 0.5 - cw * 0.5, r.position.y + box * 0.86),
				ch, 52, Color(0.95, 0.98, 1.0))

	var hint := "輸入數字　Backspace 刪除　Enter 連線　Esc 返回"
	var hw := f.get_string_size(hint, HORIZONTAL_ALIGNMENT_LEFT, -1, 15).x
	_text(f, Vector2(w * 0.5 - hw * 0.5, y + box * 1.15 + 46.0), hint, 15,
		Color(0.6, 0.66, 0.85))


## 通用的單行文字輸入框（中繼位址用）
func _draw_text_entry(f: Font, w: float, h: float, title: String, placeholder: String,
		lines: Array) -> void:
	var y := h * 0.36
	var tw := f.get_string_size(title, HORIZONTAL_ALIGNMENT_LEFT, -1, 20).x
	_text(f, Vector2(w * 0.5 - tw * 0.5, y - 18.0), title, 20, Color(0.8, 0.86, 1.0))

	var box := Rect2(w * 0.5 - 300.0, y, 600.0, 64.0)
	draw_rect(box, Color(0.07, 0.08, 0.14, 0.95))
	draw_rect(box, Color(0.6, 0.8, 1.0, 0.5 + 0.4 * sin(t * 6.0)), false, 2.4)
	var shown := code_buf
	var col := Color(0.95, 0.98, 1.0)
	if shown == "":
		shown = placeholder
		col = Color(0.45, 0.5, 0.65)
	var cw := f.get_string_size(shown, HORIZONTAL_ALIGNMENT_LEFT, -1, 26).x
	_text(f, Vector2(w * 0.5 - cw * 0.5, y + 42.0), shown, 26, col)

	var ly := y + 100.0
	for line in lines:
		var lw := f.get_string_size(str(line), HORIZONTAL_ALIGNMENT_LEFT, -1, 14).x
		_text(f, Vector2(w * 0.5 - lw * 0.5, ly), str(line), 14, Color(0.62, 0.68, 0.86))
		ly += 24.0

	var hint := "可輸入英數字、點、減號　Backspace 刪除　Enter 下一步　Esc 返回"
	var hw := f.get_string_size(hint, HORIZONTAL_ALIGNMENT_LEFT, -1, 15).x
	_text(f, Vector2(w * 0.5 - hw * 0.5, ly + 18.0), hint, 15, Color(0.6, 0.66, 0.85))


func _draw_ip(f: Font, w: float, h: float) -> void:
	var y := h * 0.40
	var box := Rect2(w * 0.5 - 240.0, y, 480.0, 68.0)
	draw_rect(box, Color(0.07, 0.08, 0.14, 0.95))
	draw_rect(box, Color(0.6, 0.8, 1.0, 0.5 + 0.4 * sin(t * 6.0)), false, 2.4)
	var shown := code_buf
	if shown == "":
		shown = "192.168.___.___"
	var cw := f.get_string_size(shown, HORIZONTAL_ALIGNMENT_LEFT, -1, 34).x
	var col := Color(0.95, 0.98, 1.0) if code_buf != "" else Color(0.45, 0.5, 0.65)
	_text(f, Vector2(w * 0.5 - cw * 0.5, y + 46.0), shown, 34, col)

	var lines := [
		"房號搜尋只在同一個區域網路有效。連不到時改用這個。",
		"主機的 IP 會顯示在它的等待畫面上。",
		"若主機在別的網路，需要它先在路由器把連接埠 24565 轉發出來。",
	]
	var ly := y + 108.0
	for line in lines:
		var lw := f.get_string_size(line, HORIZONTAL_ALIGNMENT_LEFT, -1, 14).x
		_text(f, Vector2(w * 0.5 - lw * 0.5, ly), line, 14, Color(0.62, 0.68, 0.86))
		ly += 24.0

	var hint := "輸入數字與小數點　Backspace 刪除　Enter 連線　Esc 返回"
	var hw := f.get_string_size(hint, HORIZONTAL_ALIGNMENT_LEFT, -1, 15).x
	_text(f, Vector2(w * 0.5 - hw * 0.5, ly + 18.0), hint, 15, Color(0.6, 0.66, 0.85))


func _draw_waiting(f: Font, w: float, h: float) -> void:
	var label := "你的房號"
	var lw := f.get_string_size(label, HORIZONTAL_ALIGNMENT_LEFT, -1, 18).x
	_text(f, Vector2(w * 0.5 - lw * 0.5, h * 0.32), label, 18, Color(0.7, 0.76, 0.94))

	# 大房號
	var box := 88.0
	var gap := 18.0
	var total := box * 4.0 + gap * 3.0
	var x0 := w * 0.5 - total * 0.5
	var y := h * 0.36
	for i in 4:
		var r := Rect2(x0 + float(i) * (box + gap), y, box, box * 1.1)
		draw_rect(r, Color(0.07, 0.09, 0.16, 0.95))
		draw_rect(r, Color(0.5, 0.85, 1.0, 0.75), false, 2.6)
		if i < Net.room_code.length():
			var ch := Net.room_code[i]
			var cw := f.get_string_size(ch, HORIZONTAL_ALIGNMENT_LEFT, -1, 58).x
			_text(f, Vector2(r.position.x + box * 0.5 - cw * 0.5, r.position.y + box * 0.85),
				ch, 58, Color(0.95, 0.99, 1.0))

	var dots := ".".repeat(1 + int(fposmod(t * 2.0, 3.0)))
	var wait := "等待對手加入" + dots
	var ww := f.get_string_size(wait, HORIZONTAL_ALIGNMENT_LEFT, -1, 20).x
	_text(f, Vector2(w * 0.5 - ww * 0.5, y + box * 1.1 + 56.0), wait, 20, Color(0.85, 0.9, 1.0))

	var tip := "請對手在「加入房間」輸入這組房號（需在同一個區網／熱點）"
	var tw := f.get_string_size(tip, HORIZONTAL_ALIGNMENT_LEFT, -1, 14).x
	_text(f, Vector2(w * 0.5 - tw * 0.5, y + box * 1.1 + 86.0), tip, 14, Color(0.6, 0.66, 0.85))

	# 顯示本機 IP，讓房號搜尋失敗時可以改用 IP 直連
	var addrs := Net.local_addresses()
	if addrs.size() > 0:
		var ip_line := "搜尋不到？請對手改用「用 IP 連線」輸入：" + str(addrs[0])
		var iw := f.get_string_size(ip_line, HORIZONTAL_ALIGNMENT_LEFT, -1, 15).x
		_text(f, Vector2(w * 0.5 - iw * 0.5, y + box * 1.1 + 118.0), ip_line, 15,
			Color(0.75, 0.88, 1.0))


func _draw_pick(f: Font, w: float, h: float) -> void:
	# 雙方狀態列
	_draw_side(f, Vector2(46, 126), Net.my_element, "你", Net.my_ready, Color(0.55, 0.9, 1.0))
	_draw_side(f, Vector2(w - 300.0, 126), Net.foe_element, "對手", Net.foe_ready,
		Color(1.0, 0.55, 0.55))
	var vs := "VS"
	var vw := f.get_string_size(vs, HORIZONTAL_ALIGNMENT_LEFT, -1, 26).x
	_text(f, Vector2(w * 0.5 - vw * 0.5, 158.0), vs, 26, Color(1, 0.75, 0.35))

	# 元素列表
	var y := 210.0
	for i in Game.ELEMENT_ORDER.size():
		var id: String = Game.ELEMENT_ORDER[i]
		var data: Dictionary = Game.ELEMENTS[id]
		var col: Color = data["color"]
		var owned := Game.is_unlocked(id)
		var r := Rect2(w * 0.5 - 300.0, y, 600.0, 44.0)
		var sel := i == pick_index

		var bg := Color(0.08, 0.09, 0.14, 0.9)
		if sel:
			bg = Color(col.r * 0.22, col.g * 0.22, col.b * 0.26, 0.95)
		draw_rect(r, bg)
		if sel:
			draw_rect(r, Color(col.r, col.g, col.b, 0.55 + 0.3 * sin(t * 6.0)), false, 2.2)
		else:
			draw_rect(r, Color(0.28, 0.32, 0.46, 0.3), false, 1.0)

		var dim: float = 1.0 if owned else 0.4
		var c := r.position + Vector2(28, r.size.y * 0.5)
		draw_colored_polygon(Fx.star(c, 6, 12.0, 5.0, t * 0.8), Color(col.r, col.g, col.b, dim))
		var name_col: Color = col if owned else Color(0.5, 0.53, 0.64)
		_text(f, r.position + Vector2(56, r.size.y * 0.5 + 6.0),
			"%s　%s" % [data["name"], data["tagline"]], 17, name_col)
		if not owned:
			var lk := "商店未解鎖"
			var lw2 := f.get_string_size(lk, HORIZONTAL_ALIGNMENT_LEFT, -1, 12).x
			_text(f, Vector2(r.end.x - lw2 - 12.0, r.position.y + r.size.y * 0.5 + 5.0),
				lk, 12, Color(0.75, 0.5, 0.5))
		y += 48.0

	var hint := "↑↓ 選擇　Enter 準備／取消準備　Esc 離開房間"
	if Net.is_host():
		hint += "　（雙方準備後主機自動開打）"
	var hw := f.get_string_size(hint, HORIZONTAL_ALIGNMENT_LEFT, -1, 14).x
	_text(f, Vector2(w * 0.5 - hw * 0.5, h - 78.0), hint, 14, Color(0.6, 0.66, 0.85))


func _draw_side(f: Font, pos: Vector2, id: String, label: String, ready: bool, tint: Color) -> void:
	_text(f, pos, label, 13, tint)
	var name_text := "選擇中…"
	var col := Color(0.6, 0.64, 0.8)
	if id != "" and Game.ELEMENTS.has(id):
		name_text = Game.element_name(id)
		col = Game.element_color(id)
	draw_circle(pos + Vector2(12, 22), 11.0, Color(col.r, col.g, col.b, 0.25))
	draw_colored_polygon(Fx.star(pos + Vector2(12, 22), 6, 9.0, 3.6, t * 0.7), col)
	_text(f, pos + Vector2(32, 30), name_text, 22, col)
	if ready:
		_text(f, pos + Vector2(32, 50), "已準備", 14, Color(0.5, 1.0, 0.65))


func _text(f: Font, pos: Vector2, s: String, sz: int, col: Color) -> void:
	draw_string(f, pos + Vector2(1, 1), s, HORIZONTAL_ALIGNMENT_LEFT, -1, sz, Color(0, 0, 0, 0.7))
	draw_string(f, pos, s, HORIZONTAL_ALIGNMENT_LEFT, -1, sz, col)
