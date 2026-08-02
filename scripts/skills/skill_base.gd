class_name Skill
extends Node
##
## 元素招式基底類別。
##
## 每個元素招式是一個 Node，掛在施放者（Fighter）底下負責邏輯；
## 視覺特效則生成到 arena.fx_back / arena.fx_front（世界座標）以免跟著角色移動。
##
## 生命週期：
##   setup()   → 綁定施放者與場景
##   tick()    → 每幀更新冷卻與招式進行中的狀態
##   try_use() → 玩家／AI 按下技能鍵
##

var user: Fighter
var arena = null              # Arena 主場景（不加型別註記，理由同 fighter.gd）
var id := ""                  # 元素 id（同一元素的三招共用，用來取色）
var move_index := 0           # 0 = 招式一（本命招）、1 = 招式二、2 = 招式三
var color := Color.WHITE
var cd_max := 1.0
var cooldown := 0.0

## 施放後的最小間隔。即使 cd_max = 0（無冷卻招式），
## 仍需要一點後搖，否則連打會讓特效與動作互相蓋掉。這不會顯示成冷卻圈。
var recovery := 0.24
var _recover := 0.0

## 二段式招式（毒沼引爆、御劍術）用來提示 UI 目前處於第幾階段
var stage := 0
var stage_label := ""


## 招式顯示名稱／說明，取自 Game.ELEMENTS[id].moves[move_index]
func move_name() -> String:
	var data: Dictionary = Game.ELEMENTS.get(id, {})
	var moves: Array = data.get("moves", [])
	if move_index < moves.size():
		return str(moves[move_index].get("name", id))
	return id


func move_desc() -> String:
	var data: Dictionary = Game.ELEMENTS.get(id, {})
	var moves: Array = data.get("moves", [])
	if move_index < moves.size():
		return str(moves[move_index].get("desc", ""))
	return ""


func setup(u: Fighter, a) -> void:
	user = u
	arena = a
	_on_setup()                       # 子類別在此設定 id / cd_max
	if Game.ELEMENTS.has(id):
		color = Game.ELEMENTS[id]["color"]


func _on_setup() -> void:
	pass


func tick(delta: float) -> void:
	if cooldown > 0.0:
		cooldown = maxf(0.0, cooldown - delta)
	if _recover > 0.0:
		_recover = maxf(0.0, _recover - delta)
	_tick(delta)


## 這一招是否完全沒有冷卻（招式一、招式二）
func is_free() -> bool:
	return cd_max <= 0.0


func _tick(_delta: float) -> void:
	pass


func can_use() -> bool:
	return cooldown <= 0.0 and _recover <= 0.0 and user != null and not user.is_dead


func try_use() -> bool:
	if not can_use():
		return false
	_recover = recovery
	_use()
	return true


func _use() -> void:
	pass


## 招式被卸下（切換元素、角色死亡）時清理場上遺留的特效
func dispose() -> void:
	_dispose()
	queue_free()


func _dispose() -> void:
	pass


# ------------------------------------------------------------------ 共用工具
func facing_dir() -> Vector2:
	return Vector2(signf(float(user.facing)), 0.0)


func front(distance: float, height := -40.0) -> Vector2:
	return user.global_position + Vector2(signf(float(user.facing)) * distance, height)


func enemies() -> Array:
	if arena == null:
		return []
	return arena.fighters_of_other_team(user.team)


func enemies_in_rect(r: Rect2) -> Array:
	var out := []
	for f in enemies():
		if f.body_rect().intersects(r):
			out.append(f)
	return out


func enemies_in_circle(c: Vector2, radius: float) -> Array:
	var out := []
	for f in enemies():
		if f.body_rect().grow(radius).has_point(c):
			out.append(f)
	return out


func start_cooldown() -> void:
	cooldown = cd_max


## 施法位移：往指定方向衝刺／後撤，並留下殘影。
## 遠程招式用它做後座力位移，讓每一招都帶有走位價值。
func dash(dir: float, speed: float, up := 0.0, trail_col := Color(0, 0, 0, 0)) -> void:
	if user == null or not is_instance_valid(user):
		return
	user.velocity.x = dir * speed
	if up != 0.0:
		user.velocity.y = up
	var c := trail_col
	if c.a <= 0.0:
		c = Color(color.r, color.g, color.b, 0.55)
	user.spawn_afterimage(c, 0.24)


## 大招起手的氣場爆發（概念圖：能量自地面炸開 + 巨獸虛影）
func aura(height := 250.0, life := 0.85, beast := true) -> void:
	if arena == null or user == null:
		return
	Fx.aura_burst(arena.fx_back, user, color, height, life, beast)


func shake(amount: float, duration := 0.25) -> void:
	if arena and arena.has_method("shake"):
		arena.shake(amount, duration)
