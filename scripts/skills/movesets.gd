class_name Movesets
extends RefCounted
##
## 招式表：把每個元素的三招對應到實際的 Skill 腳本／類別。
##
## 招式一是各元素的本命招（獨立檔案，特效最完整），
## 招式二、三放在 moves_<元素>.gd，由 MoveKit 的元件組成。
##

const SIGNATURE := {
	"electric": preload("res://scripts/skills/skill_electric.gd"),
	"fire": preload("res://scripts/skills/skill_fire.gd"),
	"water": preload("res://scripts/skills/skill_water.gd"),
	"wind": preload("res://scripts/skills/skill_wind.gd"),
	"ice": preload("res://scripts/skills/skill_ice.gd"),
	"poison": preload("res://scripts/skills/skill_poison.gd"),
	"lava": preload("res://scripts/skills/skill_lava.gd"),
	"metal": preload("res://scripts/skills/skill_metal.gd"),
	"dragon": preload("res://scripts/skills/skill_dragon.gd"),
}

const EXTRA := {
	"electric": preload("res://scripts/skills/moves_electric.gd"),
	"fire": preload("res://scripts/skills/moves_fire.gd"),
	"water": preload("res://scripts/skills/moves_water.gd"),
	"wind": preload("res://scripts/skills/moves_wind.gd"),
	"ice": preload("res://scripts/skills/moves_ice.gd"),
	"poison": preload("res://scripts/skills/moves_poison.gd"),
	"lava": preload("res://scripts/skills/moves_lava.gd"),
	"metal": preload("res://scripts/skills/moves_metal.gd"),
	"dragon": preload("res://scripts/skills/moves_dragon.gd"),
}


## 回傳該元素三招的類別，可直接 .new()
static func for_element(element_id: String) -> Array:
	if not SIGNATURE.has(element_id):
		return []
	var out := [SIGNATURE[element_id]]
	out.append_array(EXTRA[element_id].list())
	return out
