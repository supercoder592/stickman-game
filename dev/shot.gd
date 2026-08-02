extends Node
## 臨時截圖腳本：主畫面、選元素、對戰、結算，以及各元素的招式演出。驗完即刪。

const OUT := "res://dev/shots/"

var main
var n := 0


func _ready() -> void:
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(OUT))
	Game.unlock_all_debug()
	Game.coins = 5000
	Game.wins = 7
	main = load("res://scenes/main.tscn").instantiate()
	add_child(main)
	await get_tree().create_timer(1.2).timeout
	await _run()


func _shot(tag: String) -> void:
	await RenderingServer.frame_post_draw
	n += 1
	var path := "%s%02d_%s.png" % [OUT, n, tag]
	get_viewport().get_texture().get_image().save_png(path)
	print("[shot] 已存 ", path)


func _run() -> void:
	# 主畫面
	await _shot("title")
	main.title_screen.index = 1
	main.title_screen.show_help = true
	await get_tree().create_timer(0.3).timeout
	await _shot("title_help")

	# 商店：屬性分頁
	main.title_screen.show_help = false
	main._goto_shop()
	await get_tree().create_timer(0.4).timeout
	main.shop_screen.index = 6
	await get_tree().create_timer(0.3).timeout
	await _shot("shop_element")

	# 商店：造型分頁，每個造型各截一張預覽
	main.shop_screen.tab = main.shop_screen.Tab.SKIN
	for si in Game.SKIN_ORDER.size():
		main.shop_screen.index = si
		main.shop_screen._preview_t = 2.0      # 固定在勾拳姿勢，看得到拳套與配件
		await get_tree().create_timer(0.35).timeout
		await _shot("skin_%s" % Game.SKIN_ORDER[si])

	# 換上「鴉羽」再進戰場
	Game.coins = 99999
	main.shop_screen.index = 5
	main.shop_screen._confirm()
	await get_tree().create_timer(0.2).timeout

	# 選元素（玩家）
	main._goto_select()
	await get_tree().create_timer(0.4).timeout
	main.select_screen.index = 8          # 龍之力：展示三招
	await get_tree().create_timer(0.3).timeout
	await _shot("select_player")

	# 選對手
	main.select_screen._confirm()
	await get_tree().create_timer(0.3).timeout
	main.select_screen.index = 1
	await get_tree().create_timer(0.3).timeout
	await _shot("select_opponent")

	# 對戰：開場倒數
	main._start_battle("fire", "ice")
	await get_tree().create_timer(0.5).timeout
	await _shot("battle_intro")

	# 各元素招式演出
	var plan := [
		["electric", 1, 0.9], ["electric", 2, 0.5],
		["fire", 1, 0.25], ["fire", 2, 0.5],
		["water", 1, 0.35], ["water", 2, 0.3],
		["wind", 1, 0.3], ["wind", 2, 0.35],
		["ice", 1, 0.4], ["ice", 2, 0.4],
		["poison", 1, 0.6], ["poison", 2, 0.5],
		["lava", 1, 0.5], ["lava", 2, 0.35],
		["metal", 1, 0.25], ["metal", 2, 0.5],
		["dragon", 1, 0.8], ["dragon", 2, 1.0],
	]
	var p = main.arena.player
	var o = main.arena.opponent
	main.arena.intro_t = 0.0
	p.input_enabled = true
	if o and is_instance_valid(o):
		o.ai_enabled = false          # 讓招式演出不被對手干擾
	for entry in plan:
		var id: String = entry[0]
		var mi: int = entry[1]
		var wait: float = entry[2]
		p.equip_element(id)
		p.heal(999.0)
		p.control_lock = 0.0
		p.global_position = Vector2(560.0, main.arena.GROUND_Y)
		p.facing = 1
		if o and is_instance_valid(o):
			o.heal(999.0)
			o.global_position = Vector2(880.0, main.arena.GROUND_Y)
		await get_tree().create_timer(0.35).timeout
		p.facing = 1
		p.use_move(mi)
		await get_tree().create_timer(wait).timeout
		await _shot("%s_m%d" % [id, mi + 1])

	# 手機模式：叫出觸控層再截一張
	Game.mobile_mode = true
	main._show_touch()
	p.equip_element("dragon")
	await get_tree().create_timer(0.3).timeout
	p.use_move(2)
	await get_tree().create_timer(0.45).timeout
	await _shot("mobile_touch")
	Game.mobile_mode = false
	main.touch.enabled = false
	main.touch.visible = false

	# 結算
	if o and is_instance_valid(o):
		o.take_damage(99999.0, Vector2.ZERO, {})
	await get_tree().create_timer(1.6).timeout
	await _shot("result")

	print("[shot] 完成")
	get_tree().quit(0)
