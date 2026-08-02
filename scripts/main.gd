extends Node2D
##
## 遊戲流程控制：主畫面 → 選元素 → 1v1 對戰 → 結算 → 回主畫面。
## 這是 scenes/main.tscn 的根節點。
##

enum Screen { TITLE, SHOP, LOBBY, SELECT, BATTLE, RESULT }

const WIN_REWARD := 320
const LOSE_REWARD := 90

var ui: CanvasLayer
var title_screen: Control
var shop_screen: Control
var lobby_screen: Control
var select_screen: Control
var result_screen: Control
var hud: Control
var touch: Control              # 手機模式的觸控操作層
var arena: Arena = null
var state: int = Screen.TITLE


func _ready() -> void:
	randomize()

	# 以 `--relay` 啟動時不進遊戲，只當中繼伺服器（給跨網路對戰用）
	for a in OS.get_cmdline_user_args():
		if a == "--relay":
			Net.start_relay_server()
			return

	ui = CanvasLayer.new()
	ui.name = "UI"
	ui.layer = 10
	add_child(ui)

	title_screen = _add_screen("res://scripts/ui/title_screen.gd", "Title")
	shop_screen = _add_screen("res://scripts/ui/shop_screen.gd", "Shop")
	lobby_screen = _add_screen("res://scripts/ui/lobby_screen.gd", "Lobby")
	select_screen = _add_screen("res://scripts/ui/element_select.gd", "Select")
	result_screen = _add_screen("res://scripts/ui/result_screen.gd", "Result")
	hud = _add_screen("res://scripts/ui/battle_hud.gd", "HUD")
	touch = _add_screen("res://scripts/ui/touch_controls.gd", "Touch")

	title_screen.start_pressed.connect(_goto_select)
	title_screen.online_pressed.connect(_goto_lobby)
	title_screen.shop_pressed.connect(_goto_shop)
	title_screen.quit_pressed.connect(func(): get_tree().quit())
	shop_screen.closed.connect(_goto_title)
	lobby_screen.cancelled.connect(_goto_title)
	lobby_screen.battle_ready.connect(_start_net_battle)
	select_screen.confirmed.connect(_start_battle)
	select_screen.cancelled.connect(_goto_title)
	result_screen.dismissed.connect(_goto_title)

	_goto_title()


func _add_screen(path: String, node_name: String) -> Control:
	var script = load(path)
	var c: Control = script.new()
	c.name = node_name
	c.set_anchors_preset(Control.PRESET_FULL_RECT)
	c.mouse_filter = Control.MOUSE_FILTER_IGNORE
	c.visible = false
	ui.add_child(c)
	if c.has_method("bind"):
		c.bind(self)
	return c


func _clear_screens() -> void:
	for c in [title_screen, shop_screen, lobby_screen, select_screen, result_screen, hud, touch]:
		c.visible = false
		c.set_process_unhandled_input(false)
		c.set_process(false)
	if touch:
		touch.enabled = false


func _show(c: Control) -> void:
	c.visible = true
	c.set_process(true)
	c.set_process_unhandled_input(true)
	if c.has_method("on_shown"):
		c.on_shown()


func _destroy_arena() -> void:
	if arena and is_instance_valid(arena):
		arena.queue_free()
	arena = null


# ------------------------------------------------------------------ 畫面切換
func _goto_title() -> void:
	state = Screen.TITLE
	_destroy_arena()
	if Net.active or Net.role != Net.Role.NONE:
		Net.shutdown()
	_clear_screens()
	_show(title_screen)


func _goto_shop() -> void:
	state = Screen.SHOP
	_clear_screens()
	_show(shop_screen)


func _goto_lobby() -> void:
	state = Screen.LOBBY
	_destroy_arena()
	_clear_screens()
	_show(lobby_screen)


## 連線對戰：主機與客戶端跑同一套 Arena，只是模式不同
func _start_net_battle(my_element: String, foe_element: String, as_host: bool) -> void:
	state = Screen.BATTLE
	_clear_screens()
	_destroy_arena()

	arena = Arena.new()
	arena.name = "Arena"
	add_child(arena)
	arena.battle_over.connect(_on_battle_over)
	var m: int = Arena.Mode.NET_HOST if as_host else Arena.Mode.NET_CLIENT
	arena.start_battle(my_element, foe_element, 1.0, m)

	hud.bind_arena(arena)
	_show(hud)
	_show_touch()


func _goto_select() -> void:
	state = Screen.SELECT
	_clear_screens()
	_show(select_screen)


func _start_battle(player_element: String, opponent_element: String) -> void:
	state = Screen.BATTLE
	_clear_screens()
	_destroy_arena()

	arena = Arena.new()
	arena.name = "Arena"
	add_child(arena)
	arena.battle_over.connect(_on_battle_over)
	arena.start_battle(player_element, opponent_element)

	hud.bind_arena(arena)
	_show(hud)
	_show_touch()


## 手機模式時把觸控層叫出來
func _show_touch() -> void:
	if not Game.mobile_mode or touch == null:
		return
	touch.bind_arena(arena)
	touch.enabled = true
	touch.visible = true
	touch.set_process(true)


func _on_battle_over(player_won: bool) -> void:
	state = Screen.RESULT
	var reward: int = WIN_REWARD if player_won else LOSE_REWARD
	Game.add_coins(reward)
	if player_won:
		Game.wins += 1
	Game.save_game()
	_clear_screens()
	# 對戰畫面留在背景，結算蓋在上面
	hud.visible = true
	result_screen.setup(player_won, reward)
	_show(result_screen)
