extends Node
##
## 全域狀態（Autoload 名稱：Game）
## 負責：金幣、元素解鎖狀態、目前裝備元素、存檔、以及可顯示中日韓字型的載入。
##

const SAVE_PATH := "user://stickman_save.json"

signal coins_changed(value: int)
signal loadout_changed()

## 元素資料表。cost = 0 代表四大基礎元素（開局四選一免費，其餘可事後補買 base_cost）。
const BASE_REBUY_COST := 300

const ELEMENT_ORDER: PackedStringArray = [
	"electric", "fire", "water", "wind",
	"ice", "poison", "lava", "metal", "dragon",
]

## 每個元素有三招：招式一為本命招，招式二、三由 MoveKit 元件組成。
## 實際的腳本對應表在 scripts/skills/movesets.gd。
const ELEMENTS := {
	"electric": {
		"name": "雷電", "tier": "基礎", "cost": 0,
		"tagline": "極速與麻痺",
		"color": Color(1.0, 0.9, 0.2),
		"moves": [
			{"name": "電光·極速伏特", "desc": "化為電光 Z 字三段折返衝刺，終擊使敵人麻痺 0.5 秒。"},
			{"name": "落雷·十萬伏特", "desc": "在敵人頭上連續降下五道落雷，命中麻痺。"},
			{"name": "磁暴·電漿護盾", "desc": "展開電漿護罩：減傷 45%，並持續電擊靠近的敵人。"},
		],
	},
	"fire": {
		"name": "熾焰", "tier": "基礎", "cost": 0,
		"tagline": "近戰爆發與持續灼燒",
		"color": Color(1.0, 0.45, 0.1),
		"moves": [
			{"name": "熾焰·烈焰勾拳", "desc": "霸體上勾拳擊飛敵人，並附加持續灼燒。"},
			{"name": "炎之呼吸·火龍紅蓮", "desc": "帶霸體的高速突進斬，穿過敵人並留下灼燒。"},
			{"name": "噴火·烈焰吐息", "desc": "向前持續噴出扇形火焰，多段灼燒。"},
		],
	},
	"water": {
		"name": "水流", "tier": "基礎", "cost": 0,
		"tagline": "柔性推擠與遠程壓制",
		"color": Color(0.25, 0.65, 1.0),
		"moves": [
			{"name": "水龍·咆哮", "desc": "召喚水龍向前推擠，強制推開並打斷敵方招式。"},
			{"name": "水砲", "desc": "高速水彈，命中造成大幅擊退與範圍爆散。"},
			{"name": "水之呼吸·凪", "desc": "無我之境：0.9 秒完全無敵，並反彈靠近的敵人。"},
		],
	},
	"wind": {
		"name": "疾風", "tier": "基礎", "cost": 0,
		"tagline": "高空位移與多段割裂",
		"color": Color(0.55, 1.0, 0.6),
		"moves": [
			{"name": "風之呼吸·一型·塵旋風", "desc": "高速旋轉風刃切過地面，牽引並多段割裂。"},
			{"name": "風之呼吸·三型·晴嵐風樹", "desc": "扇形射出三道可穿透的真空風刃。"},
			{"name": "疾風·浮空", "desc": "藉風力再次躍升（空中亦可），落地產生衝擊波。"},
		],
	},
	"ice": {
		"name": "冰霜", "tier": "技能樹", "cost": 750,
		"tagline": "凍結與封鎖",
		"color": Color(0.75, 0.93, 1.0),
		"moves": [
			{"name": "極寒·地表冰刺", "desc": "地面順序刺出巨大冰柱，命中者凍結 1.5 秒。"},
			{"name": "冰凍光束", "desc": "射出貫穿的冰晶光束，命中者凍結。"},
			{"name": "冰之壁", "desc": "前方豎起三道冰牆，撞上的敵人被彈開並凍結。"},
		],
	},
	"poison": {
		"name": "劇毒", "tier": "技能樹", "cost": 1000,
		"tagline": "疊毒與百分比傷害",
		"color": Color(0.68, 0.32, 0.95),
		"moves": [
			{"name": "魔元·毒沼引爆", "desc": "腳下生成毒沼疊加毒素，再按一次引爆造成 % 最大血量傷害。"},
			{"name": "污泥波", "desc": "拋射兩發黏稠毒彈，落地濺開並疊加毒素與減速。"},
			{"name": "毒霧結界", "desc": "周身展開毒霧，持續對範圍內敵人疊毒與減速。"},
		],
	},
	"lava": {
		"name": "熔岩", "tier": "技能樹", "cost": 1200,
		"tagline": "地形壓制與持續灼燒",
		"color": Color(1.0, 0.35, 0.05),
		"moves": [
			{"name": "熔岩·地裂噴發", "desc": "撕開地表噴發岩漿，留下 3 秒灼燒減速的岩漿帶。"},
			{"name": "熔岩彈幕", "desc": "拋射五顆熔岩塊，落點爆開並灼燒。"},
			{"name": "斷崖之劍", "desc": "前方地面接連隆起三根岩柱，將敵人高高頂飛。"},
		],
	},
	"metal": {
		"name": "鋼鐵", "tier": "技能樹", "cost": 1500,
		"tagline": "飛劍與硬直防禦",
		"color": Color(1.0, 0.85, 0.45),
		"moves": [
			{"name": "金·御劍術", "desc": "召喚 6 把金劍環繞，再按一次自動鎖定敵人穿透飛去。"},
			{"name": "飛葉快刀·鋼翼斬", "desc": "化為鋼翼高速突進，穿過的敵人承受重擊。"},
			{"name": "鋼鐵頭殼", "desc": "覆上鋼鐵裝甲：減傷 60% 且全程霸體。"},
		],
	},
	"dragon": {
		"name": "龍之力", "tier": "技能樹", "cost": 3000,
		"tagline": "毀滅級的高風險高回報",
		"color": Color(0.6, 0.45, 1.0),
		"moves": [
			{"name": "龍之怒·極限咆哮", "desc": "蓄力 1 秒（全霸體）後發射貫穿全屏的龍形光束。"},
			{"name": "龍之波動", "desc": "射出會追蹤敵人的巨大龍能量彈，命中爆散。"},
			{"name": "流星群", "desc": "天降八顆隕石覆蓋整片戰場。"},
		],
	},
}

## 造型：火柴人是純程式繪製的，所以造型 = 頭部樣式 + 配件 + 線條粗細 + 光暈 的組合。
## head: circle / square / helm / hood / skull
## acc:  none / scarf / haori / horns / halo / wings / topknot
## ==================================================================
## 部位化換裝
## ==================================================================
## 造型拆成五個部位各自挑選，玩家自由搭配。
## 顏色不由造型決定，而是跟著當前元素走 —— 這樣火屬性天然就是緋紅配色、
## 水屬性是水藍配色，拳套也自動染上元素色（每個屬性都有拳套）。
const PART_SLOTS: PackedStringArray = ["head", "chest", "waist", "legs", "hands"]

const SLOT_NAMES := {
	"head": "頭", "chest": "胸", "waist": "腹", "legs": "腳", "hands": "手",
}

const PARTS := {
	"head": {
		"plain": {"name": "素面", "desc": "沒有多餘裝飾", "price": 0},
		"topknot": {"name": "髮髻", "desc": "束起的武士髮髻", "price": 150},
		"flame_hair": {"name": "火焰鬃髮", "desc": "尖銳如火舌的鬃髮", "price": 400},
		"hood": {"name": "兜帽", "desc": "遮住臉的深色兜帽", "price": 300},
		"helm": {"name": "面甲", "desc": "橫條面甲與頭冠", "price": 500},
		"mask": {"name": "般若面具", "desc": "深色面具與紅色眼縫", "price": 600},
		"horned": {"name": "巨角", "desc": "自額側長出的雙角", "price": 700},
	},
	"chest": {
		"none": {"name": "無", "desc": "不穿外衣", "price": 0},
		"scarf": {"name": "長巾", "desc": "隨風擺動的長巾", "price": 200},
		"haori": {"name": "羽織", "desc": "披在背側的短外衣", "price": 250},
		"cape": {"name": "大披風", "desc": "下襬張開的長披風", "price": 450},
		"armor": {"name": "胸甲", "desc": "肩甲與胸甲，上身變寬", "price": 600},
		"blades": {"name": "背負雙刀", "desc": "背後交叉的雙刀", "price": 700},
		"wings": {"name": "雙翼", "desc": "向後上方張開的翼", "price": 800},
	},
	"waist": {
		"none": {"name": "無", "desc": "腰間無裝飾", "price": 0},
		"belt": {"name": "腰帶", "desc": "簡單的束腰", "price": 120},
		"sash": {"name": "腰間垂布", "desc": "垂在側邊的長布", "price": 300},
		"plates": {"name": "裙甲", "desc": "腰間的分片甲葉", "price": 500},
		"tail": {"name": "長尾", "desc": "分節擺動的長尾", "price": 650},
	},
	"legs": {
		"plain": {"name": "素腿", "desc": "沒有護具", "price": 0},
		"wraps": {"name": "綁腿", "desc": "纏繞的布條", "price": 150},
		"boots": {"name": "重靴", "desc": "厚實的長靴", "price": 350},
		"greaves": {"name": "護脛", "desc": "金屬護脛與膝甲", "price": 550},
	},
	"hands": {
		"basic": {"name": "拳套", "desc": "基本拳套，所有屬性標配", "price": 0},
		"heavy": {"name": "重拳套", "desc": "更厚重，普攻威力更高", "price": 300},
		"spiked": {"name": "尖刺拳套", "desc": "指節帶尖刺", "price": 500},
		"energy": {"name": "能量拳套", "desc": "纏繞元素能量，拖出火焰", "price": 750},
	},
}

## 預設穿著（全部免費部位）
const DEFAULT_PARTS := {
	"head": "plain", "chest": "none", "waist": "none",
	"legs": "plain", "hands": "basic",
}


## 舊版整套造型資料（已停用，保留供參考）
const SKIN_ORDER: PackedStringArray = [
	"plain", "corps", "aqua", "flame", "fists", "musha", "crow",
	"thunder", "dragonkin",
]

const SKINS := {
	"plain": {
		"name": "白練", "sub": "初始造型　·　標準體型", "price": 0,
		"body": Color(0.95, 0.97, 1.0), "accent": Color(0.55, 0.68, 0.9),
		"head": "circle", "acc": "none", "width": 5.0,
		"build": 1.0, "head_r": 1.0, "limb_w": 1.0, "glow": false, "trail": false,
	},
	"corps": {
		"name": "隊士服", "sub": "漆黑羽織與髮髻　·　標準體型", "price": 300,
		"body": Color(0.24, 0.25, 0.34), "accent": Color(0.6, 0.66, 0.85),
		"head": "topknot", "acc": "haori", "width": 5.5,
		"build": 1.0, "head_r": 1.0, "limb_w": 1.05, "glow": false, "trail": false,
	},
	# 炎之呼吸與水之呼吸是使用者明確認可的版本，維持原樣不再調整體型或配件。
	"aqua": {
		"name": "水之呼吸", "sub": "水藍長巾隨風擺動", "price": 600,
		"body": Color(0.42, 0.72, 1.0), "accent": Color(0.8, 0.95, 1.0),
		"head": "circle", "acc": "scarf", "width": 5.0,
		"build": 1.0, "head_r": 1.0, "limb_w": 1.0, "glow": true, "trail": false,
	},
	"flame": {
		"name": "炎之呼吸", "sub": "緋色羽織與火焰紋", "price": 900,
		"body": Color(0.96, 0.45, 0.22), "accent": Color(1.0, 0.82, 0.3),
		"head": "topknot", "acc": "haori", "width": 5.5,
		"build": 1.0, "head_r": 1.0, "limb_w": 1.0, "glow": true, "trail": false,
	},
	"fists": {
		"name": "炎拳", "sub": "厚重拳套　·　雙拳燃燒", "price": 1000,
		"body": Color(0.9, 0.55, 0.3), "accent": Color(1.0, 0.55, 0.12),
		"head": "topknot", "acc": "gauntlets", "width": 5.6,
		"build": 1.06, "head_r": 0.95, "limb_w": 1.2, "glow": true, "trail": false,
		"fist_aura": true,
	},
	"musha": {
		"name": "武者", "sub": "般若面具　·　背負雙刀", "price": 1200,
		"body": Color(0.42, 0.44, 0.55), "accent": Color(0.95, 0.35, 0.32),
		"head": "mask", "acc": "blades", "width": 5.8,
		"build": 1.06, "head_r": 1.05, "limb_w": 1.15, "glow": false, "trail": false,
	},
	"crow": {
		"name": "鴉羽", "sub": "兜帽與漆黑雙翼　·　高速殘影", "price": 1500,
		"body": Color(0.16, 0.16, 0.22), "accent": Color(0.62, 0.55, 0.85),
		"head": "hood", "acc": "wings", "width": 5.5,
		"build": 1.0, "head_r": 1.1, "limb_w": 0.95, "glow": false, "trail": true,
	},
	"thunder": {
		"name": "雷霆", "sub": "重裝護甲　·　光環與殘影", "price": 2200,
		"body": Color(1.0, 0.88, 0.35), "accent": Color(1.0, 1.0, 0.75),
		"head": "helm", "acc": "armor", "width": 6.0,
		"build": 1.08, "head_r": 1.05, "limb_w": 1.25, "glow": true, "trail": true,
	},
	"dragonkin": {
		"name": "龍人", "sub": "高大身形　·　巨角與長尾", "price": 2600,
		"body": Color(0.62, 0.45, 1.0), "accent": Color(0.95, 0.8, 0.35),
		"head": "skull", "acc": "tail", "width": 5.6,
		"build": 1.15, "head_r": 0.95, "limb_w": 1.05, "glow": true, "trail": false,
	},
}

## 手機模式：顯示虛擬搖桿與觸控按鈕。預設在有觸控螢幕的裝置自動開啟，也可手動切換。
var mobile_mode := false

## 上次用過的中繼伺服器位址（跨網對戰用），記起來免得每次重打
var relay_address := ""

var coins: int = 0
var unlocked: Array[String] = []
var unlocked_skins: Array[String] = ["plain"]
var equipped_skin: String = "plain"

## 已購買的部位：`"slot/option"` 形式，例如 "head/topknot"
var unlocked_parts: Array[String] = []
## 目前穿著：slot -> option
var equipped_parts: Dictionary = {}
var equipped: String = ""
var starter_chosen: bool = false
var wins: int = 0

var ui_font: Font = null


func _ready() -> void:
	ui_font = _load_cjk_font()
	load_game()
	if ELEMENTS_ALL_FREE:
		unlocked.clear()
		for id in ELEMENT_ORDER:
			unlocked.append(id)
		starter_chosen = true
		if equipped == "":
			equipped = ELEMENT_ORDER[0]
	# 觸控裝置自動開啟手機模式（存檔若已有設定則以存檔為準）
	if not _mobile_mode_saved:
		mobile_mode = DisplayServer.is_touchscreen_available() \
			or OS.has_feature("mobile") or OS.has_feature("web_android") \
			or OS.has_feature("web_ios")


var _mobile_mode_saved := false


func toggle_mobile_mode() -> void:
	mobile_mode = not mobile_mode
	_mobile_mode_saved = true
	save_game()


# ---------------------------------------------------------------- 字型
## Godot 內建預設字型不含中文字符。
## 優先使用專案內建的 Noto Sans TC —— 網頁版沒有系統字型可讀，
## 不內建的話整個介面會變成空白方塊。桌機找不到內建字型時再退回系統字型。
const BUNDLED_FONT := "res://assets/fonts/NotoSansTC.ttf"


func _load_cjk_font() -> Font:
	if ResourceLoader.exists(BUNDLED_FONT):
		var bundled = load(BUNDLED_FONT)
		if bundled is Font:
			return bundled
		if bundled is FontFile:
			return bundled

	var candidates := [
		"C:/Windows/Fonts/msjh.ttc",      # 微軟正黑體
		"C:/Windows/Fonts/msjhbd.ttc",
		"C:/Windows/Fonts/msyh.ttc",      # 微軟雅黑
		"C:/Windows/Fonts/simhei.ttf",
		"C:/Windows/Fonts/mingliu.ttc",
		"/System/Library/Fonts/PingFang.ttc",
		"/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
	]
	for path in candidates:
		if not FileAccess.file_exists(path):
			continue
		var f := FontFile.new()
		if f.load_dynamic_font(path) == OK:
			f.multichannel_signed_distance_field = false
			return f
	push_warning("找不到中日韓字型，介面中文可能無法顯示。")
	return ThemeDB.fallback_font


# ---------------------------------------------------------------- 查詢
func element_color(id: String) -> Color:
	return ELEMENTS.get(id, {}).get("color", Color.WHITE)


func element_name(id: String) -> String:
	return ELEMENTS.get(id, {}).get("name", id)


## 所有元素一律免費、預設全部解鎖。
## 金幣改為只用於造型 —— 玩法內容不上鎖，付費（遊玩）獎勵只影響外觀。
const ELEMENTS_ALL_FREE := true


func price_of(_id: String) -> int:
	if ELEMENTS_ALL_FREE:
		return 0
	var data: Dictionary = ELEMENTS.get(_id, {})
	var cost: int = data.get("cost", 0)
	if cost == 0:
		return 0 if not starter_chosen else BASE_REBUY_COST
	return cost


func is_unlocked(id: String) -> bool:
	if ELEMENTS_ALL_FREE:
		return ELEMENTS.has(id)
	return unlocked.has(id)


# ---------------------------------------------------------------- 部位化換裝
func part_data(slot: String, option: String) -> Dictionary:
	return PARTS.get(slot, {}).get(option, {})


func part_price(slot: String, option: String) -> int:
	return int(part_data(slot, option).get("price", 0))


func part_key(slot: String, option: String) -> String:
	return "%s/%s" % [slot, option]


func is_part_unlocked(slot: String, option: String) -> bool:
	return part_price(slot, option) == 0 or unlocked_parts.has(part_key(slot, option))


func try_unlock_part(slot: String, option: String) -> bool:
	if is_part_unlocked(slot, option):
		return false
	var price := part_price(slot, option)
	if coins < price:
		return false
	coins -= price
	unlocked_parts.append(part_key(slot, option))
	coins_changed.emit(coins)
	save_game()
	return true


func equip_part(slot: String, option: String) -> bool:
	if not is_part_unlocked(slot, option):
		return false
	equipped_parts[slot] = option
	loadout_changed.emit()
	save_game()
	return true


func equipped_part(slot: String) -> String:
	return str(equipped_parts.get(slot, DEFAULT_PARTS.get(slot, "")))


## 組出給 StickFigure 用的外觀資料。
## 顏色跟著元素走 —— 換屬性就換整體配色，拳套也自動染上元素色。
func build_look(element_id := "") -> Dictionary:
	var ec: Color = element_color(element_id) if ELEMENTS.has(element_id) else Color(0.9, 0.93, 1.0)
	var look := {
		"body": ec.lerp(Color(0.96, 0.97, 1.0), 0.3),
		"accent": ec.lightened(0.22),
		"width": 5.2,
		"build": 1.0, "head_r": 1.0, "limb_w": 1.0,
		"glow": false, "trail": false,
	}
	for slot in PART_SLOTS:
		look[slot] = equipped_part(slot)
	# 部分部位會改變體感：重拳套更粗壯、能量拳套會發光
	match look["hands"]:
		"heavy":
			look["limb_w"] = 1.18
		"energy":
			look["glow"] = true
	if look["chest"] == "armor":
		look["limb_w"] = maxf(look["limb_w"], 1.15)
	return look


# ---------------------------------------------------------------- 造型（舊版整套，保留相容）
func skin_data(id: String) -> Dictionary:
	return SKINS.get(id, SKINS["plain"])


func current_skin() -> Dictionary:
	return build_look(equipped)


func is_skin_unlocked(id: String) -> bool:
	return unlocked_skins.has(id)


func try_unlock_skin(id: String) -> bool:
	if is_skin_unlocked(id) or not SKINS.has(id):
		return false
	var price: int = SKINS[id]["price"]
	if coins < price:
		return false
	coins -= price
	unlocked_skins.append(id)
	coins_changed.emit(coins)
	loadout_changed.emit()
	save_game()
	return true


func equip_skin(id: String) -> bool:
	if not is_skin_unlocked(id):
		return false
	equipped_skin = id
	loadout_changed.emit()
	save_game()
	return true


# ---------------------------------------------------------------- 變更
func add_coins(amount: int) -> void:
	coins = max(0, coins + amount)
	coins_changed.emit(coins)


func try_unlock(id: String) -> bool:
	if is_unlocked(id) or not ELEMENTS.has(id):
		return false
	var price := price_of(id)
	if coins < price:
		return false
	coins -= price
	unlocked.append(id)
	if ELEMENTS[id]["cost"] == 0:
		starter_chosen = true
	coins_changed.emit(coins)
	loadout_changed.emit()
	save_game()
	return true


func equip(id: String) -> bool:
	if not is_unlocked(id):
		return false
	equipped = id
	loadout_changed.emit()
	save_game()
	return true


func unlock_all_debug() -> void:
	for id in ELEMENT_ORDER:
		if not unlocked.has(id):
			unlocked.append(id)
	starter_chosen = true
	if equipped == "":
		equipped = "electric"
	loadout_changed.emit()


# ---------------------------------------------------------------- 存檔
func save_game() -> void:
	var data := {
		"coins": coins,
		"unlocked": unlocked,
		"equipped": equipped,
		"starter_chosen": starter_chosen,
		"wins": wins,
		"unlocked_skins": unlocked_skins,
		"equipped_skin": equipped_skin,
		"mobile_mode": mobile_mode,
		"mobile_saved": _mobile_mode_saved,
		"relay_address": relay_address,
		"unlocked_parts": unlocked_parts,
		"equipped_parts": equipped_parts,
	}
	var f := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if f:
		f.store_string(JSON.stringify(data))
		f.close()


func load_game() -> void:
	if not FileAccess.file_exists(SAVE_PATH):
		return
	var f := FileAccess.open(SAVE_PATH, FileAccess.READ)
	if f == null:
		return
	var parsed = JSON.parse_string(f.get_as_text())
	f.close()
	if typeof(parsed) != TYPE_DICTIONARY:
		return
	coins = int(parsed.get("coins", 0))
	equipped = str(parsed.get("equipped", ""))
	starter_chosen = bool(parsed.get("starter_chosen", false))
	wins = int(parsed.get("wins", 0))
	unlocked.clear()
	for id in parsed.get("unlocked", []):
		if ELEMENTS.has(str(id)):
			unlocked.append(str(id))
	if not unlocked.has(equipped):
		equipped = unlocked[0] if unlocked.size() > 0 else ""

	unlocked_skins.clear()
	unlocked_skins.append("plain")
	for sid in parsed.get("unlocked_skins", []):
		if SKINS.has(str(sid)) and not unlocked_skins.has(str(sid)):
			unlocked_skins.append(str(sid))
	equipped_skin = str(parsed.get("equipped_skin", "plain"))
	if not unlocked_skins.has(equipped_skin):
		equipped_skin = "plain"

	unlocked_parts.clear()
	for k in parsed.get("unlocked_parts", []):
		var key := str(k)
		var bits := key.split("/")
		if bits.size() == 2 and PARTS.has(bits[0]) and PARTS[bits[0]].has(bits[1]):
			unlocked_parts.append(key)
	equipped_parts.clear()
	var saved_parts = parsed.get("equipped_parts", {})
	if typeof(saved_parts) == TYPE_DICTIONARY:
		for slot in PART_SLOTS:
			var opt := str(saved_parts.get(slot, ""))
			if PARTS.get(slot, {}).has(opt) and is_part_unlocked(slot, opt):
				equipped_parts[slot] = opt

	relay_address = str(parsed.get("relay_address", ""))
	_mobile_mode_saved = bool(parsed.get("mobile_saved", false))
	if _mobile_mode_saved:
		mobile_mode = bool(parsed.get("mobile_mode", false))


func reset_progress() -> void:
	coins = 0
	unlocked.clear()
	equipped = ""
	starter_chosen = false
	wins = 0
	unlocked_skins = ["plain"]
	equipped_skin = "plain"
	unlocked_parts.clear()
	equipped_parts.clear()
	save_game()
	coins_changed.emit(coins)
	loadout_changed.emit()
