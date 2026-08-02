extends Node
## 臨時煙霧測試：跑過主畫面 → 選元素 → 對戰，並讓雙方輪流施放全部 27 招。
## 只用於 headless 驗證，驗完即刪。

class DrawProbe extends Node2D:
	var hit := false
	func _draw() -> void:
		hit = true
		draw_circle(Vector2.ZERO, 4.0, Color.WHITE)

var main
var probe: DrawProbe
var idx := -1
var t := 0.0
var switch_at := 0.0
var fire_at := 0.0
const PER_ELEMENT := 3.4


func _ready() -> void:
	Game.unlock_all_debug()
	main = load("res://scenes/main.tscn").instantiate()
	add_child(main)
	probe = DrawProbe.new()
	add_child(probe)
	print("[smoke] 主畫面建立完成，元素數 = ", Game.ELEMENT_ORDER.size())

	# 逐一繪製三個選單畫面，確保 _draw 全部走過
	await get_tree().create_timer(0.4).timeout
	main.title_screen.show_help = true
	await get_tree().create_timer(0.2).timeout
	main.title_screen.show_help = false

	# 商店：兩個分頁都走一遍，並實際購買一個造型
	main._goto_shop()
	await get_tree().create_timer(0.3).timeout
	main.shop_screen.index = 4
	await get_tree().create_timer(0.2).timeout
	main.shop_screen.tab = main.shop_screen.Tab.SKIN
	main.shop_screen.index = 3
	await get_tree().create_timer(0.3).timeout
	Game.coins = 9999
	main.shop_screen._confirm()
	print("[smoke] 購買造型後 equipped_skin = ", Game.equipped_skin)
	await get_tree().create_timer(0.2).timeout

	main._goto_select()
	await get_tree().create_timer(0.3).timeout
	main.select_screen.index = 5
	await get_tree().create_timer(0.2).timeout
	main.select_screen._confirm()          # 選定玩家元素 → 進入選對手
	await get_tree().create_timer(0.3).timeout
	print("[smoke] 選單畫面 OK，開始對戰")
	main._start_battle("electric", "fire")


func _process(delta: float) -> void:
	t += delta
	probe.queue_redraw()
	if main.arena == null or not is_instance_valid(main.arena):
		return
	var p = main.arena.player
	var o = main.arena.opponent
	if p == null or not is_instance_valid(p):
		return

	# 兩邊都保持存活，讓測試跑完全部元素
	p.heal(500.0)
	if o and is_instance_valid(o):
		o.heal(500.0)

	if t >= switch_at:
		switch_at = t + PER_ELEMENT
		idx += 1
		if idx >= Game.ELEMENT_ORDER.size():
			_finish()
			return
		var id: String = Game.ELEMENT_ORDER[idx]
		p.equip_element(id)
		if o and is_instance_valid(o):
			var other: String = Game.ELEMENT_ORDER[(idx + 4) % Game.ELEMENT_ORDER.size()]
			o.equip_element(other)
		print("[smoke] t=%.1f 玩家元素 → %s（三招）" % [t, id])

	# 輪流施放三招，涵蓋二段式招式的第二階段
	if t >= fire_at:
		fire_at = t + 0.4
		p.facing = 1 if int(t * 2.0) % 2 == 0 else -1
		p.control_lock = 0.0
		p.use_move(int(t * 2.5) % 3)
		p._punch()


func _finish() -> void:
	print("[smoke] _draw 是否被呼叫：", probe.hit)
	print("[smoke] 觸發勝負判定 …")
	var o = main.arena.opponent
	if o and is_instance_valid(o):
		o.take_damage(99999.0, Vector2.ZERO, {})
	await get_tree().create_timer(2.0).timeout
	print("[smoke] 結算畫面：", main.result_screen.visible)
	main._goto_title()
	await get_tree().create_timer(0.4).timeout
	print("[smoke] 完成，無錯誤則以 0 結束")
	get_tree().quit(0)
