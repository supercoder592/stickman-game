class_name Characters
extends RefCounted
##
## 十位可操作角色的資料表。
##
## 「元素」決定三招（scripts/skills/），「角色」則決定：
##   數值（血量／移速／跳躍／攻防倍率）、剪影（部位組合與體型）、以及一個被動。
## 一個角色綁定一個元素，因此十位角色 = 十套招式 + 十種手感。
##
## 被動的實作在 fighter.gd（passive_id 對應那裡的 match 分支）；
## 只靠數值成立的被動（鋼體、龍威）passive_id 留空，說明仍寫在這裡供 UI 顯示。
##
## 平衡基準：血量 200、移速 300、跳躍 720、攻防倍率 1.0、普攻間隔倍率 1.0。
##

const ORDER: PackedStringArray = [
	"bolt", "blaze", "tide", "gale", "frost",
	"venom", "magma", "steel", "ryuin", "shade",
]

const LIST := {
	"bolt": {
		"name": "雷影", "title": "迅雷刺客", "element": "electric",
		"color": Color(1.0, 0.9, 0.2),
		"tagline": "全場最快的腳步與最密的拳",
		"hp": 175.0, "speed": 345.0, "jump": 760.0,
		"atk": 0.94, "def": 1.06, "punch_cd": 0.72, "punch_power": 0.9,
		"passive_id": "quick_fists",
		"passive": {
			"name": "疾電連打",
			"desc": "普攻間隔縮短 28%，但身板最薄，受到的傷害增加 6%。",
		},
		"look": {
			"head": "hood", "chest": "scarf", "waist": "belt",
			"legs": "wraps", "hands": "basic",
			"build": 0.95, "limb_w": 0.88, "head_r": 0.96, "width": 4.8,
			"glow": false, "trail": true,
		},
	},
	"blaze": {
		"name": "炎心", "title": "烈焰狂戰士", "element": "fire",
		"color": Color(1.0, 0.45, 0.1),
		"tagline": "血越少，拳越重",
		"hp": 200.0, "speed": 300.0, "jump": 720.0,
		"atk": 1.0, "def": 1.0, "punch_cd": 1.0, "punch_power": 1.15,
		"passive_id": "berserk",
		"passive": {
			"name": "燃血",
			"desc": "血量低於 40% 時，自身所有傷害提升 30%。",
		},
		"look": {
			"head": "topknot", "chest": "haori", "waist": "sash",
			"legs": "wraps", "hands": "heavy",
			"build": 1.02, "limb_w": 1.08, "head_r": 1.0, "width": 5.4,
			"glow": false, "trail": false,
		},
	},
	"tide": {
		"name": "瀧", "title": "靜水劍客", "element": "water",
		"color": Color(0.25, 0.65, 1.0),
		"tagline": "只要活著就會慢慢回滿",
		"hp": 205.0, "speed": 295.0, "jump": 720.0,
		"atk": 0.97, "def": 0.98, "punch_cd": 1.0, "punch_power": 1.0,
		"passive_id": "tide_breath",
		"passive": {
			"name": "潮息",
			"desc": "每秒自動回復 2.4 點血量（死亡後停止）。",
		},
		"look": {
			"head": "plain", "chest": "scarf", "waist": "sash",
			"legs": "plain", "hands": "basic",
			"build": 1.0, "limb_w": 1.0, "head_r": 1.0, "width": 5.2,
			"glow": true, "trail": false,
		},
	},
	"gale": {
		"name": "疾羽", "title": "風之遊俠", "element": "wind",
		"color": Color(0.55, 1.0, 0.6),
		"tagline": "留在空中的時間比誰都長",
		"hp": 170.0, "speed": 320.0, "jump": 785.0,
		"atk": 0.95, "def": 1.08, "punch_cd": 0.9, "punch_power": 0.92,
		"passive_id": "feather",
		"passive": {
			"name": "輕身",
			"desc": "可在空中再跳一次，下墜速度降低 12%。",
		},
		"look": {
			"head": "hood", "chest": "wings", "waist": "none",
			"legs": "wraps", "hands": "basic",
			"build": 0.94, "limb_w": 0.86, "head_r": 1.05, "width": 4.7,
			"glow": false, "trail": true,
		},
	},
	"frost": {
		"name": "霜華", "title": "冰結巫女", "element": "ice",
		"color": Color(0.75, 0.93, 1.0),
		"tagline": "碰到她的人都會慢下來",
		"hp": 195.0, "speed": 280.0, "jump": 700.0,
		"atk": 1.0, "def": 0.95, "punch_cd": 1.0, "punch_power": 0.95,
		"passive_id": "frost_armor",
		"passive": {
			"name": "凍甲",
			"desc": "被打中時凍寒反噬，攻擊者移速降為 70%，持續 1.4 秒。",
		},
		"look": {
			"head": "plain", "chest": "cape", "waist": "plates",
			"legs": "plain", "hands": "basic",
			"build": 1.0, "limb_w": 0.96, "head_r": 1.02, "width": 5.0,
			"glow": true, "trail": false,
		},
	},
	"venom": {
		"name": "蝕", "title": "疫毒術士", "element": "poison",
		"color": Color(0.68, 0.32, 0.95),
		"tagline": "先讓對手中毒，再把毒變成傷害",
		"hp": 185.0, "speed": 300.0, "jump": 720.0,
		"atk": 1.0, "def": 1.02, "punch_cd": 0.95, "punch_power": 1.0,
		"passive_id": "venom_sync",
		"passive": {
			"name": "毒素共鳴",
			"desc": "對處於中毒狀態的目標，所有傷害提升 25%。",
		},
		"look": {
			"head": "mask", "chest": "haori", "waist": "tail",
			"legs": "boots", "hands": "spiked",
			"build": 0.98, "limb_w": 0.98, "head_r": 1.0, "width": 5.1,
			"glow": false, "trail": false,
		},
	},
	"magma": {
		"name": "灼岳", "title": "熔岩巨漢", "element": "lava",
		"color": Color(1.0, 0.35, 0.05),
		"tagline": "靠近他就會被燙傷",
		"hp": 230.0, "speed": 262.0, "jump": 665.0,
		"atk": 1.06, "def": 0.9, "punch_cd": 1.12, "punch_power": 1.2,
		"passive_id": "magma_skin",
		"passive": {
			"name": "熔岩之軀",
			"desc": "受傷降低 10%；被近身打中時反燒攻擊者（2 秒灼燒）。",
		},
		"look": {
			"head": "horned", "chest": "armor", "waist": "plates",
			"legs": "boots", "hands": "heavy",
			"build": 1.12, "limb_w": 1.24, "head_r": 0.98, "width": 5.8,
			"glow": true, "trail": false,
		},
	},
	"steel": {
		"name": "鋼牙", "title": "鋼鐵重裝", "element": "metal",
		"color": Color(1.0, 0.85, 0.45),
		"tagline": "最硬、最慢、最難推倒",
		"hp": 250.0, "speed": 240.0, "jump": 620.0,
		"atk": 1.0, "def": 0.8, "punch_cd": 1.18, "punch_power": 1.25,
		"passive_id": "",
		"passive": {
			"name": "鋼體",
			"desc": "受到的傷害永久降低 20%，血量全場最高，代價是移動與跳躍最差。",
		},
		"look": {
			"head": "helm", "chest": "armor", "waist": "plates",
			"legs": "greaves", "hands": "heavy",
			"build": 1.16, "limb_w": 1.3, "head_r": 1.0, "width": 6.0,
			"glow": false, "trail": false,
		},
	},
	"ryuin": {
		"name": "龍胤", "title": "龍血繼承者", "element": "dragon",
		"color": Color(0.6, 0.45, 1.0),
		"tagline": "打得比誰都痛，也比誰都痛",
		"hp": 190.0, "speed": 295.0, "jump": 720.0,
		"atk": 1.2, "def": 1.12, "punch_cd": 1.0, "punch_power": 1.1,
		"passive_id": "",
		"passive": {
			"name": "龍威",
			"desc": "造成的傷害提升 20%，受到的傷害同時增加 12%。",
		},
		"look": {
			"head": "horned", "chest": "cape", "waist": "tail",
			"legs": "greaves", "hands": "energy",
			"build": 1.08, "limb_w": 1.08, "head_r": 0.96, "width": 5.5,
			"glow": true, "trail": false,
		},
	},
	"shade": {
		"name": "夜刃", "title": "暗影殺手", "element": "shadow",
		"color": Color(0.85, 0.25, 0.65),
		"tagline": "閃掉一拳，然後從背後回敬",
		"hp": 180.0, "speed": 310.0, "jump": 740.0,
		"atk": 1.0, "def": 1.0, "punch_cd": 0.88, "punch_power": 1.0,
		"passive_id": "phantom",
		"passive": {
			"name": "殘影",
			"desc": "15% 機率完全閃避攻擊；被打中後 0.9 秒內移速提升 45%。",
		},
		"look": {
			"head": "mask", "chest": "cape", "waist": "sash",
			"legs": "boots", "hands": "spiked",
			"build": 0.98, "limb_w": 0.94, "head_r": 1.0, "width": 5.0,
			"glow": false, "trail": true,
		},
	},
}

## 數值條的顯示上下限（UI 用，和實際數值無關）
const STAT_RANGE := {
	"hp": [160.0, 260.0],
	"speed": [230.0, 350.0],
	"jump": [600.0, 800.0],
	"atk": [0.9, 1.25],
	"def": [0.75, 1.15],
}


static func has(id: String) -> bool:
	return LIST.has(id)


static func data(id: String) -> Dictionary:
	return LIST.get(id, LIST[ORDER[0]])


static func name_of(id: String) -> String:
	return str(data(id).get("name", id))


static func title_of(id: String) -> String:
	return str(data(id).get("title", ""))


static func element_of(id: String) -> String:
	return str(data(id).get("element", ""))


static func color_of(id: String) -> Color:
	return data(id).get("color", Color.WHITE)


static func passive_of(id: String) -> Dictionary:
	return data(id).get("passive", {})


static func random_id() -> String:
	return ORDER[randi() % ORDER.size()]


## 角色的預設外觀（部位 + 體型），顏色跟著角色的元素走。
## 玩家在商店換過的部位會另外覆蓋，那一層在 Game.character_look()。
static func base_look(id: String) -> Dictionary:
	var d := data(id)
	var col: Color = d.get("color", Color.WHITE)
	var look := {
		"body": col.lerp(Color(0.96, 0.97, 1.0), 0.3),
		"accent": col.lightened(0.22),
	}
	for k in d.get("look", {}):
		look[k] = d["look"][k]
	return look


## 數值條比例（0~1），給選角畫面畫長條用。
## 防禦倍率越低代表越耐打，所以要反過來。
static func stat_ratio(id: String, key: String) -> float:
	var d := data(id)
	var span: Array = STAT_RANGE.get(key, [0.0, 1.0])
	var lo: float = span[0]
	var hi: float = span[1]
	var v: float = float(d.get(key, lo))
	var r: float = clampf((v - lo) / maxf(hi - lo, 0.001), 0.0, 1.0)
	return 1.0 - r if key == "def" else r
