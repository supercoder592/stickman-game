extends Node
## 連線測試：同一台機器開兩個實例，一個當主機一個當客戶端，
## 驗證「房號廣播探索 → ENet 連線 → 大廳同步 → 開打 → 狀態快照」整條路。
##   godot --headless --path . res://dev/net_test.tscn -- --role=host
##   godot --headless --path . res://dev/net_test.tscn -- --role=client
## 驗完即刪。

const CODE := "1234"

var role := "host"
var relay_addr := "127.0.0.1"
var t := 0.0
var started := false
var main = null
var reported := {}


func _ready() -> void:
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--role="):
			role = a.split("=")[1]
		elif a.begins_with("--addr="):
			relay_addr = a.split("=", true, 1)[1]
	print("[net] 角色 = ", role)

	Game.unlock_all_debug()
	main = load("res://scenes/main.tscn").instantiate()
	add_child(main)

	Net.room_created.connect(func(c): print("[net] 房號建立 = ", c))
	Net.peer_joined.connect(func(): print("[net] 對手已加入"))
	Net.joined_room.connect(func(): print("[net] 已連上主機"))
	Net.join_failed.connect(func(r): print("[net] 失敗：", r))
	Net.battle_started.connect(func(a, b): print("[net] 開打！我方=", a, " 對手=", b))

	await get_tree().create_timer(0.5).timeout
	match role:
		"host":
			Net.host_room()
			Net.room_code = CODE          # 測試用固定房號
			print("[net] 主機就緒，房號固定為 ", CODE)
		"client":
			await get_tree().create_timer(1.5).timeout
			print("[net] 客戶端開始搜尋房號 ", CODE)
			Net.join_room(CODE)
		# --- 跨網（中繼）路徑：兩邊都連同一台中繼、同一組房號，先到的當主機 ---
		"relay_a":
			print("[net] A 連往中繼 %s（實際 URL：%s）房號 %s"
				% [relay_addr, Net.relay_url(relay_addr), CODE])
			Net.join_via_relay(relay_addr, CODE)
		"relay_b":
			await get_tree().create_timer(1.5).timeout
			print("[net] B 連往中繼 %s（實際 URL：%s）房號 %s"
				% [relay_addr, Net.relay_url(relay_addr), CODE])
			Net.join_via_relay(relay_addr, CODE)
		# --- P2P 打洞路徑（本機只能驗協定流程，無法驗真實 NAT）---
		"p2p_a":
			print("[net] A 透過牽線伺服器打洞，房號 ", CODE)
			Net.join_via_p2p("127.0.0.1", CODE)
		"p2p_b":
			await get_tree().create_timer(1.0).timeout
			print("[net] B 透過牽線伺服器打洞，房號 ", CODE)
			Net.join_via_p2p("127.0.0.1", CODE)


func _process(delta: float) -> void:
	t += delta

	# 連上之後兩邊各自選元素並準備
	if Net.active and not started and t > 4.0:
		if Net.my_element == "":
			var e: String = "fire" if Net.is_host() else "ice"
			Net.set_my_element(e)
			print("[net] 選擇元素 ", e)
		elif Net.foe_element != "" and not Net.my_ready:
			Net.set_ready(true)
			print("[net] 已準備")
		elif Net.is_host() and Net.both_ready():
			started = true
			print("[net] 主機開打")
			Net.start_battle()

	# 對戰中：印出雙方血量，確認快照有同步
	if main and main.arena and is_instance_valid(main.arena):
		var a = main.arena
		# 主機在 t=9 主動改變狀態；客戶端若有收到快照，數值應跟著變
		if Net.is_host() and t > 9.0 and not reported.has("mutated"):
			reported["mutated"] = true
			a.player.global_position.x = 900.0
			a.opponent.take_damage(37.0, Vector2.ZERO, {"color": Color.RED})
			print("[net] 主機改動：player.x=900, 對手扣 37 血")
		if a.player and is_instance_valid(a.player) and a.opponent and is_instance_valid(a.opponent):
			var key := int(t)
			if key % 3 == 0 and not reported.has(key):
				reported[key] = true
				print("[net] t=%d 模式=%d 我方HP=%.0f 對手HP=%.0f 我方x=%.0f 對手x=%.0f"
					% [key, a.mode, a.player.hp, a.opponent.hp,
						a.player.global_position.x, a.opponent.global_position.x])

	if t > 22.0:
		print("[net] 測試結束（", role, "）")
		get_tree().quit(0)
