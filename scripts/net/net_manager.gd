extends Node
##
## 連線管理（Autoload 名稱：Net）
##
## 架構選擇：
##   * 房號 → 主機位址：用 UDP 廣播在區域網路內探索，不需要任何外部伺服器。
##     主機綁 DISCOVERY_PORT 監聽查詢；客戶端把 4 位數房號廣播出去，
##     房號相符的主機回覆，客戶端從封包來源取得 IP。
##   * 對戰本體：ENetMultiplayerPeer。
##
## 同步模型：**主機權威（host authoritative）**。
##   主機跑完整模擬（雙方角色、所有招式、所有傷害判定）。
##   客戶端只送輸入，並把收到的狀態快照套用到畫面上。
##   客戶端本地仍會播放招式特效，但角色為 net_puppet，
##   血量／位置一律以主機快照為準，因此不會有雙重扣血或分歧。
##
## 這是為區網對戰設計的；跨網際網路需要自備轉發伺服器或連接埠轉發。
##

const GAME_PORT := 24565
const DISCOVERY_PORT := 24566
const RELAY_PORT := 24570
const RENDEZVOUS_PORT := 24571     # P2P 打洞用的牽線連接埠（同一台伺服器）
const PUNCH_ATTEMPTS := 14
const PUNCH_INTERVAL := 0.12
const P2P_TIMEOUT := 7.0
const MAX_PLAYERS := 2
const MAX_RELAY_PEERS := 64
const SNAPSHOT_HZ := 30.0
const DISCOVERY_TIMEOUT := 5.0

## 傳輸方式：
##   LAN   — 兩台直連（房號 UDP 廣播探索，或 IP 直連）。同一個區網才行。
##   RELAY — 雙方都連到一台中繼伺服器，由它轉送封包。可跨網路，
##           但需要有人把 relay_server 跑在一台雙方都連得到的機器上。
##   P2P   — 透過牽線伺服器交換彼此的外部位址後直接打洞連線。
##           連上之後流量完全不經過伺服器，延遲最低、伺服器負擔幾乎為零。
##           但 symmetric NAT / 電信商 CGNAT 會打不通，故失敗時自動退回 RELAY。
enum Transport { LAN, RELAY, P2P }

signal room_created(code: String)
signal peer_joined()
signal peer_left()
signal join_failed(reason: String)
signal joined_room()
signal lobby_updated()
signal battle_started(my_element: String, foe_element: String)

enum Role { NONE, HOST, CLIENT }

var role: int = Role.NONE
var transport: int = Transport.LAN
var room_code := ""
var active := false

## --- 中繼／牽線伺服器端狀態（只有以 --relay 啟動的行程會用到）---
var relay_mode := false
var _rooms := {}              # 房號 -> [peer_id, ...]
var _peer_room := {}          # peer_id -> 房號
var _rv: PacketPeerUDP = null # 牽線用 UDP socket
var _rv_rooms := {}           # 房號 -> [{ip, port}, ...]

## --- P2P 打洞狀態（玩家端）---
var _p2p_udp: PacketPeerUDP = null
var _p2p_local_port := 0
var _p2p_server := ""
var _p2p_peer_ip := ""
var _p2p_peer_port := 0
var _p2p_is_host := false
var _p2p_phase := ""          # "" / "register" / "punch"
var _p2p_t := 0.0
var _p2p_tick := 0.0
var _p2p_punches := 0
var _p2p_got_reply := false

## 大廳狀態：兩邊各自選的元素與造型
var my_element := ""
var foe_element := ""
var foe_skin := "plain"
var foe_ready := false
var my_ready := false

var arena = null                    # 目前的對戰場，由 main.gd 設定

var _udp: PacketPeerUDP = null
var _discovery_t := 0.0
var _searching_code := ""
var _snapshot_t := 0.0
var _connect_timeout := 0.0        # ENet 連線階段的逾時（IP 打錯／被防火牆擋時會用到）


func _ready() -> void:
	multiplayer.peer_connected.connect(_on_peer_connected)
	multiplayer.peer_disconnected.connect(_on_peer_disconnected)
	multiplayer.connected_to_server.connect(_on_connected)
	multiplayer.connection_failed.connect(_on_connection_failed)
	multiplayer.server_disconnected.connect(_on_server_disconnected)


func is_host() -> bool:
	return role == Role.HOST


## 安全地解析 UDP 封包。
## 打洞過程中對方可能已經切換到 ENet，其二進位封包會被我們的 socket 收到；
## 直接丟給 JSON.parse_string() 會噴出解析錯誤，因此先確認長得像 JSON 再解析。
func _parse_json_packet(raw: PackedByteArray):
	if raw.size() < 2 or raw[0] != 0x7B:       # '{'
		return null
	var parsed = JSON.parse_string(raw.get_string_from_utf8())
	if typeof(parsed) != TYPE_DICTIONARY:
		return null
	return parsed


# ------------------------------------------------------------------ 開房
func host_room() -> bool:
	shutdown()
	room_code = "%04d" % (randi() % 9000 + 1000)

	var peer := ENetMultiplayerPeer.new()
	var err := peer.create_server(GAME_PORT, MAX_PLAYERS)
	if err != OK:
		join_failed.emit("無法建立房間（連接埠 %d 可能被占用）" % GAME_PORT)
		return false
	multiplayer.multiplayer_peer = peer

	# 開始監聽房號查詢
	_udp = PacketPeerUDP.new()
	if _udp.bind(DISCOVERY_PORT) != OK:
		push_warning("無法綁定探索連接埠，房號搜尋將無法使用（仍可用 IP 直連）")
		_udp = null

	role = Role.HOST
	active = true
	my_element = ""
	foe_element = ""
	my_ready = false
	foe_ready = false
	set_process(true)
	room_created.emit(room_code)
	return true


# ------------------------------------------------------------------ 加入
func join_room(code: String) -> void:
	shutdown()
	_searching_code = code
	room_code = code
	role = Role.CLIENT

	_udp = PacketPeerUDP.new()
	if _udp.bind(0) != OK:
		join_failed.emit("無法開啟網路連接埠")
		shutdown()
		return
	_udp.set_broadcast_enabled(true)
	_udp.set_dest_address("255.255.255.255", DISCOVERY_PORT)
	_discovery_t = DISCOVERY_TIMEOUT
	set_process(true)
	_send_query()


func _send_query() -> void:
	if _udp == null:
		return
	_udp.put_packet(JSON.stringify({"q": _searching_code}).to_utf8_buffer())


func _connect_to(ip: String) -> void:
	var peer := ENetMultiplayerPeer.new()
	var err := peer.create_client(ip, GAME_PORT)
	if err != OK:
		join_failed.emit("無法連線到 %s" % ip)
		shutdown()
		return
	multiplayer.multiplayer_peer = peer
	_connect_timeout = 8.0
	if _udp:
		_udp.close()
		_udp = null


## 直接用 IP 連線（跨網段或探索失敗時的後備手段）
func join_by_ip(ip: String) -> void:
	shutdown()
	role = Role.CLIENT
	room_code = ip
	set_process(true)
	_connect_to(ip)


# ==================================================================
# 中繼模式（跨網路）
# ==================================================================
##
## 為什麼需要中繼：家用路由器的 NAT 不會把外部連線轉進內網，
## 所以兩台位於不同網路的機器無法直接互連。解法只有兩種 ——
## 其中一方做連接埠轉發（見 join_by_ip），或雙方都連到同一台中繼伺服器。
##
## 中繼伺服器就是本專案自己，以 `--relay` 參數啟動：
##     godot --headless --path . -- --relay
## 它只做一件事：把同一個房號裡 A 送來的封包原封不動轉給 B。
## 遊戲協定完全不變，主機權威模型照舊 —— 房內第一位是主機，第二位是客戶端。

## 以中繼伺服器身分啟動（由 main.gd 在偵測到 --relay 時呼叫）
##
## 中繼採用 WebSocket 而非 ENet，理由是瀏覽器只能用 WebSocket ——
## 統一成一種傳輸後，桌機與網頁版走同一條路，不必維護兩套中繼。
## ENet 只保留給區網直連與 P2P 打洞（那兩者本來就只在原生平台可用）。
func start_relay_server() -> bool:
	relay_mode = true
	# 雲端平台（Render / Railway / Fly.io…）會用 PORT 環境變數指定要監聽的連接埠
	var port := RELAY_PORT
	var env_port := OS.get_environment("PORT")
	if env_port != "" and env_port.is_valid_int():
		port = int(env_port)

	var peer := WebSocketMultiplayerPeer.new()
	var err := peer.create_server(port)
	if err != OK:
		push_error("中繼伺服器無法綁定連接埠 %d" % port)
		return false
	multiplayer.multiplayer_peer = peer

	# 同一個行程順便當 P2P 牽線伺服器：只負責告訴雙方對方的外部位址
	_rv = PacketPeerUDP.new()
	if _rv.bind(RENDEZVOUS_PORT) != OK:
		push_warning("牽線連接埠 %d 綁定失敗，P2P 將無法使用（中繼仍可用）" % RENDEZVOUS_PORT)
		_rv = null

	set_process(true)
	print("[relay] 中繼伺服器已啟動（WebSocket），連接埠 ", port)
	if _rv:
		print("[relay] P2P 牽線伺服器已啟動，連接埠 ", RENDEZVOUS_PORT)
	return true


## 牽線伺服器：收到 {"p2p": 房號} 就記下來源外部位址；湊滿兩人就互相告知
func _poll_rendezvous() -> void:
	if _rv == null:
		return
	while _rv.get_available_packet_count() > 0:
		var raw := _rv.get_packet()
		var ip := _rv.get_packet_ip()
		var port := _rv.get_packet_port()
		var parsed = _parse_json_packet(raw)
		if parsed == null or not parsed.has("p2p"):
			continue
		var code := str(parsed["p2p"])
		if not _rv_rooms.has(code):
			_rv_rooms[code] = []
		var members: Array = _rv_rooms[code]

		var known := false
		for m in members:
			if m["ip"] == ip and m["port"] == port:
				known = true
				break
		if not known and members.size() < 2:
			members.append({"ip": ip, "port": port})
			print("[rv] %s:%d 登記房號 %s（%d/2）" % [ip, port, code, members.size()])

		# 兩人到齊 → 各自告知對方位址，順便指派誰當主機
		if members.size() == 2:
			for i in 2:
				var me: Dictionary = members[i]
				var other: Dictionary = members[1 - i]
				_rv.set_dest_address(me["ip"], me["port"])
				_rv.put_packet(JSON.stringify({
					"peer_ip": other["ip"],
					"peer_port": other["port"],
					"host": i == 0,
				}).to_utf8_buffer())


# ------------------------------------------------------------------ P2P 打洞（玩家端）
## 流程：
##   1. 綁一個本地 UDP 連接埠 L，用它向牽線伺服器登記房號
##      → 伺服器看到的來源位址就是本機在 NAT 上的外部映射
##   2. 伺服器回傳對方的外部位址
##   3. 兩邊用「同一個」socket 互相狂送封包 → 各自的 NAT 打開回程通道
##   4. 收到對方封包後關閉 UDP，改用同一個本地連接埠 L 建立 ENet 連線
func join_via_p2p(server_addr: String, code: String) -> void:
	# 瀏覽器沒有 UDP，打不了洞；直接走 WebSocket 中繼
	if OS.has_feature("web"):
		join_via_relay(server_addr, code)
		return
	shutdown()
	transport = Transport.P2P
	room_code = code
	_p2p_server = server_addr

	_p2p_udp = PacketPeerUDP.new()
	if _p2p_udp.bind(0) != OK:
		join_failed.emit("無法開啟本地連接埠")
		shutdown()
		return
	_p2p_local_port = _p2p_udp.get_local_port()
	_p2p_phase = "register"
	_p2p_t = P2P_TIMEOUT
	_p2p_tick = 0.0
	_p2p_punches = 0
	_p2p_got_reply = false
	set_process(true)


func _p2p_process(delta: float) -> void:
	if _p2p_udp == null or _p2p_phase == "":
		return

	_p2p_t -= delta
	if _p2p_t <= 0.0:
		# 打洞失敗（多半是 symmetric NAT 或 CGNAT）→ 自動退回中繼
		print("[p2p] 打洞逾時，改用中繼伺服器")
		var addr := _p2p_server
		var code := room_code
		_p2p_cleanup()
		join_via_relay(addr, code)
		return

	# 讀取封包
	while _p2p_udp.get_available_packet_count() > 0:
		var raw := _p2p_udp.get_packet()
		var from_ip := _p2p_udp.get_packet_ip()
		var parsed = _parse_json_packet(raw)
		if parsed == null:
			continue
		if parsed.has("peer_ip") and _p2p_phase == "register":
			_p2p_peer_ip = str(parsed["peer_ip"])
			_p2p_peer_port = int(parsed["peer_port"])
			_p2p_is_host = bool(parsed["host"])
			_p2p_phase = "punch"
			_p2p_tick = 0.0
			_p2p_punches = 0
			print("[p2p] 對方外部位址 %s:%d，我方角色=%s"
				% [_p2p_peer_ip, _p2p_peer_port, "主機" if _p2p_is_host else "客戶端"])
		elif parsed.has("punch") and _p2p_phase == "punch":
			if from_ip == _p2p_peer_ip:
				_p2p_got_reply = true

	_p2p_tick -= delta
	if _p2p_tick > 0.0:
		return
	_p2p_tick = PUNCH_INTERVAL

	match _p2p_phase:
		"register":
			_p2p_udp.set_dest_address(_p2p_server, RENDEZVOUS_PORT)
			_p2p_udp.put_packet(JSON.stringify({"p2p": room_code}).to_utf8_buffer())
		"punch":
			_p2p_punches += 1
			_p2p_udp.set_dest_address(_p2p_peer_ip, _p2p_peer_port)
			_p2p_udp.put_packet(JSON.stringify({"punch": _p2p_punches}).to_utf8_buffer())
			# 收到對方回應，或送滿一定次數後，就把通道交給 ENet
			if _p2p_got_reply or _p2p_punches >= PUNCH_ATTEMPTS:
				_p2p_establish()


## 關鍵一步：釋放 UDP socket，改讓 ENet 綁同一個本地連接埠，
## 這樣剛剛打通的 NAT 映射才能被沿用。
func _p2p_establish() -> void:
	var peer_ip := _p2p_peer_ip
	var peer_port := _p2p_peer_port
	var as_host := _p2p_is_host
	var local_port := _p2p_local_port

	_p2p_udp.close()
	_p2p_udp = null
	_p2p_phase = ""

	var peer := ENetMultiplayerPeer.new()
	var err: int
	if as_host:
		err = peer.create_server(local_port, MAX_PLAYERS)
		role = Role.HOST
	else:
		err = peer.create_client(peer_ip, peer_port, 0, 0, 0, local_port)
		role = Role.CLIENT
	if err != OK:
		print("[p2p] ENet 建立失敗，改用中繼")
		var addr := _p2p_server
		var code := room_code
		_p2p_cleanup()
		join_via_relay(addr, code)
		return

	# 連上之後就是一般的點對點連線，遊戲協定與區網模式完全相同
	transport = Transport.LAN
	multiplayer.multiplayer_peer = peer
	_connect_timeout = 6.0
	print("[p2p] 打洞成功，改由 ENet 直連（本地埠 %d）" % local_port)


func _p2p_cleanup() -> void:
	if _p2p_udp:
		_p2p_udp.close()
		_p2p_udp = null
	_p2p_phase = ""
	_p2p_t = 0.0


## 把使用者輸入的位址轉成 WebSocket 網址。
## 允許三種寫法：
##   example.com            → ws://example.com:24570
##   wss://relay.foo.com    → 原樣使用（雲端平台通常是 443 埠的 wss）
##   192.168.1.5:9000       → ws://192.168.1.5:9000
## 網頁版若由 HTTPS 提供，瀏覽器會拒絕不加密的 ws://，必須填 wss:// 開頭的網址。
static func relay_url(addr: String) -> String:
	var a := addr.strip_edges()
	if a.begins_with("ws://") or a.begins_with("wss://"):
		return a
	if a.contains(":"):
		return "ws://" + a
	return "ws://%s:%d" % [a, RELAY_PORT]


func _relay_connect(addr: String, code: String) -> void:
	shutdown()
	transport = Transport.RELAY
	room_code = code
	var url := relay_url(addr)
	var peer := WebSocketMultiplayerPeer.new()
	var err := peer.create_client(url)
	if err != OK:
		join_failed.emit("無法連線到中繼伺服器 %s" % url)
		shutdown()
		return
	multiplayer.multiplayer_peer = peer
	_connect_timeout = 12.0        # WebSocket 握手較久，逾時放寬
	set_process(true)


## 玩家端：透過中繼建立／加入房間（同一個入口，先到的成為主機）
func join_via_relay(addr: String, code: String) -> void:
	_relay_connect(addr, code)


## 連上中繼後，回報自己要進哪個房間
func _relay_announce() -> void:
	_rpc_relay_join.rpc_id(1, room_code)


@rpc("any_peer", "reliable", "call_remote")
func _rpc_relay_join(code: String) -> void:
	if not relay_mode:
		return
	var id := multiplayer.get_remote_sender_id()
	if not _rooms.has(code):
		_rooms[code] = []
	var members: Array = _rooms[code]
	if members.size() >= 2:
		_rpc_relay_full.rpc_id(id)
		return
	members.append(id)
	_peer_room[id] = code
	# 房內第一位當主機
	_rpc_relay_role.rpc_id(id, members.size() == 1)
	print("[relay] peer %d 進入房間 %s（%d/2）" % [id, code, members.size()])
	if members.size() == 2:
		for m in members:
			_rpc_relay_paired.rpc_id(m)
		print("[relay] 房間 %s 配對完成" % code)


@rpc("authority", "reliable", "call_remote")
func _rpc_relay_full() -> void:
	join_failed.emit("房號 %s 已經有兩個人了" % room_code)
	shutdown()


@rpc("authority", "reliable", "call_remote")
func _rpc_relay_role(as_host: bool) -> void:
	role = Role.HOST if as_host else Role.CLIENT
	if as_host:
		room_created.emit(room_code)
	else:
		joined_room.emit()


@rpc("authority", "reliable", "call_remote")
func _rpc_relay_paired() -> void:
	active = true
	_connect_timeout = 0.0
	peer_joined.emit()
	_sync_lobby()


## 找出同房間的另一個人
func _relay_partner(id: int) -> int:
	if not _peer_room.has(id):
		return 0
	for m in _rooms.get(_peer_room[id], []):
		if m != id:
			return m
	return 0


## 中繼模式下所有遊戲訊息都包成這一層，由伺服器原樣轉給房內另一位
@rpc("any_peer", "reliable", "call_remote")
func _rpc_relay_msg(kind: String, args: Array) -> void:
	if relay_mode:
		var partner := _relay_partner(multiplayer.get_remote_sender_id())
		if partner != 0:
			_rpc_relay_msg.rpc_id(partner, kind, args)
		return
	_dispatch(kind, args)


@rpc("any_peer", "unreliable_ordered", "call_remote")
func _rpc_relay_msg_u(kind: String, args: Array) -> void:
	if relay_mode:
		var partner := _relay_partner(multiplayer.get_remote_sender_id())
		if partner != 0:
			_rpc_relay_msg_u.rpc_id(partner, kind, args)
		return
	_dispatch(kind, args)


## 把轉送過來的訊息交回原本的處理函式，遊戲協定因此完全不用改
func _dispatch(kind: String, a: Array) -> void:
	match kind:
		"lobby":
			_rpc_lobby(a[0])
		"start":
			_rpc_start(a[0], a[1])
		"input":
			_rpc_input(a[0], a[1], a[2], a[3], a[4], a[5])
		"state":
			_rpc_state(a[0])
		"cast":
			_rpc_cast(a[0], a[1])
		"over":
			_rpc_over(a[0])


func _send(kind: String, args: Array, reliable := true) -> void:
	if transport == Transport.RELAY:
		if reliable:
			_rpc_relay_msg.rpc_id(1, kind, args)
		else:
			_rpc_relay_msg_u.rpc_id(1, kind, args)
		return
	# 區網直連：走原本的點對點 RPC
	match kind:
		"lobby":
			_rpc_lobby.rpc(args[0])
		"start":
			_rpc_start.rpc(args[0], args[1])
		"input":
			_rpc_input.rpc_id(1, args[0], args[1], args[2], args[3], args[4], args[5])
		"state":
			_rpc_state.rpc(args[0])
		"cast":
			_rpc_cast.rpc(args[0], args[1])
		"over":
			_rpc_over.rpc(args[0])


# ------------------------------------------------------------------ 關閉
func shutdown() -> void:
	if _udp:
		_udp.close()
		_udp = null
	_p2p_cleanup()
	if multiplayer.multiplayer_peer != null:
		multiplayer.multiplayer_peer.close()
		multiplayer.multiplayer_peer = null
	role = Role.NONE
	transport = Transport.LAN
	active = false
	room_code = ""
	my_element = ""
	foe_element = ""
	my_ready = false
	foe_ready = false
	arena = null
	_discovery_t = 0.0
	_connect_timeout = 0.0
	set_process(false)


## 本機在區網中的位址，顯示給對方用 IP 直連
func local_addresses() -> Array:
	var out := []
	for a in IP.get_local_addresses():
		var s := str(a)
		# 只留 IPv4、排除迴路位址
		if s.count(".") == 3 and not s.begins_with("127."):
			out.append(s)
	return out


# ------------------------------------------------------------------ 每幀
func _process(delta: float) -> void:
	if relay_mode:
		_poll_rendezvous()
		return
	_poll_udp(delta)
	_p2p_process(delta)

	# ENet 連線逾時：IP 打錯、對方防火牆擋住、或根本不在同一個網路時會走到這裡
	if _connect_timeout > 0.0 and not active:
		_connect_timeout -= delta
		if _connect_timeout <= 0.0:
			join_failed.emit("連線逾時 —— 對方可能不在同一個網路，或防火牆擋住了連接埠 %d" % GAME_PORT)
			shutdown()
			return

	if active and is_host() and arena != null and is_instance_valid(arena):
		_snapshot_t += delta
		if _snapshot_t >= 1.0 / SNAPSHOT_HZ:
			_snapshot_t = 0.0
			_broadcast_state()


func _poll_udp(delta: float) -> void:
	if _udp == null:
		return

	while _udp.get_available_packet_count() > 0:
		var raw := _udp.get_packet()
		var from_ip := _udp.get_packet_ip()
		var from_port := _udp.get_packet_port()
		var parsed = _parse_json_packet(raw)
		if parsed == null:
			continue

		if role == Role.HOST and parsed.has("q"):
			# 有人在找房號，相符就回覆
			if str(parsed["q"]) == room_code:
				_udp.set_dest_address(from_ip, from_port)
				_udp.put_packet(JSON.stringify({"a": room_code}).to_utf8_buffer())
		elif role == Role.CLIENT and parsed.has("a"):
			if str(parsed["a"]) == _searching_code:
				_discovery_t = 0.0
				_connect_to(from_ip)
				return

	# 客戶端：每 0.5 秒重送一次查詢，直到逾時
	if role == Role.CLIENT and _discovery_t > 0.0:
		_discovery_t -= delta
		if fposmod(_discovery_t, 0.5) < delta:
			_send_query()
		if _discovery_t <= 0.0:
			join_failed.emit("找不到房號 %s —— 請確認雙方在同一個區域網路" % _searching_code)
			shutdown()


# ------------------------------------------------------------------ 連線事件
func _on_peer_connected(_id: int) -> void:
	if relay_mode:
		return                      # 中繼伺服器要等對方回報房號才配對
	active = true
	peer_joined.emit()
	if is_host():
		_sync_lobby()


func _on_peer_disconnected(id: int) -> void:
	if relay_mode:
		# 有人離開，把他從房間移除，並通知同房的另一位
		if _peer_room.has(id):
			var code: String = _peer_room[id]
			var members: Array = _rooms.get(code, [])
			members.erase(id)
			_peer_room.erase(id)
			if members.is_empty():
				_rooms.erase(code)
			else:
				for m in members:
					_rpc_relay_partner_left.rpc_id(m)
			print("[relay] peer %d 離開房間 %s" % [id, code])
		return
	peer_left.emit()


@rpc("authority", "reliable", "call_remote")
func _rpc_relay_partner_left() -> void:
	active = false
	peer_left.emit()


## P2P 打洞成功後主機端會收到對方連入，走的是一般點對點流程
func _on_connected() -> void:
	if transport == Transport.RELAY:
		# 連上的是中繼伺服器，還要回報房號才算進房
		_relay_announce()
		return
	active = true
	joined_room.emit()
	_sync_lobby()


func _on_connection_failed() -> void:
	join_failed.emit("連線失敗")
	shutdown()


func _on_server_disconnected() -> void:
	peer_left.emit()
	shutdown()


# ------------------------------------------------------------------ 大廳同步
func set_my_element(id: String) -> void:
	my_element = id
	_sync_lobby()


func set_ready(v: bool) -> void:
	my_ready = v
	_sync_lobby()


func _sync_lobby() -> void:
	if not active:
		return
	_send("lobby", [{
		"element": my_element,
		"skin": Game.equipped_skin,
		"ready": my_ready,
	}])
	lobby_updated.emit()


@rpc("any_peer", "reliable", "call_remote")
func _rpc_lobby(data: Dictionary) -> void:
	foe_element = str(data.get("element", ""))
	foe_skin = str(data.get("skin", "plain"))
	foe_ready = bool(data.get("ready", false))
	lobby_updated.emit()


func both_ready() -> bool:
	return active and my_element != "" and foe_element != "" and my_ready and foe_ready


## 主機呼叫：開打
func start_battle() -> void:
	if not is_host() or not both_ready():
		return
	_send("start", [my_element, foe_element])
	battle_started.emit(my_element, foe_element)


@rpc("authority", "reliable", "call_remote")
func _rpc_start(host_element: String, client_element: String) -> void:
	# 客戶端視角：自己是 client_element，對手是 host_element
	battle_started.emit(client_element, host_element)


# ------------------------------------------------------------------ 輸入（客戶端 → 主機）
func send_input(axis: float, jump: bool, punch: bool, m0: bool, m1: bool, m2: bool) -> void:
	if not active or is_host():
		return
	_send("input", [axis, jump, punch, m0, m1, m2], false)


@rpc("any_peer", "unreliable_ordered", "call_remote")
func _rpc_input(axis: float, jump: bool, punch: bool, m0: bool, m1: bool, m2: bool) -> void:
	if not is_host() or arena == null or not is_instance_valid(arena):
		return
	arena.apply_remote_input(axis, jump, punch, m0, m1, m2)


# ------------------------------------------------------------------ 狀態（主機 → 客戶端）
func _broadcast_state() -> void:
	var snap = arena.collect_snapshot()
	if snap != null:
		_send("state", [snap], false)


@rpc("authority", "unreliable_ordered", "call_remote")
func _rpc_state(snap: Array) -> void:
	if arena != null and is_instance_valid(arena):
		arena.apply_snapshot(snap)


## 主機通知客戶端：某人放了招（客戶端據此播放特效）
func broadcast_cast(who: int, move_index: int) -> void:
	if active and is_host():
		_send("cast", [who, move_index])


@rpc("authority", "reliable", "call_remote")
func _rpc_cast(who: int, move_index: int) -> void:
	if arena != null and is_instance_valid(arena):
		arena.play_remote_cast(who, move_index)


func broadcast_over(host_won: bool) -> void:
	if active and is_host():
		_send("over", [host_won])


@rpc("authority", "reliable", "call_remote")
func _rpc_over(host_won: bool) -> void:
	if arena != null and is_instance_valid(arena):
		arena.finish_from_net(not host_won)      # 客戶端視角：主機贏 = 自己輸
