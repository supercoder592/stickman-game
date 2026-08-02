class_name TapRouter
extends RefCounted
##
## 選單的觸控支援。
##
## 各選單畫面原本只吃鍵盤，手機上完全無法操作。
## 這個小工具讓畫面在 _draw() 時登記「可點區域 → 動作名稱」，
## 再由 _input() 把點擊轉成和鍵盤相同的動作。
##
## 用法：
##   var tap := TapRouter.new()
##   _draw():  tap.begin();  tap.add(rect, "item_3")
##   _input(): var hit := tap.hit(event);  if hit != "": ...
##

var _zones: Array = []          # [[Rect2, 名稱], ...]
var _building: Array = []


## 每次重畫前呼叫，開始重新登記
func begin() -> void:
	_building = []


## 登記一個可點區域
func add(rect: Rect2, action: String) -> void:
	_building.append([rect, action])


## 重畫結束後呼叫，讓登記生效
func commit() -> void:
	_zones = _building


## 把事件轉成動作名稱；沒點到任何區域回傳空字串。
## 只認「按下」的瞬間，觸控與滑鼠都支援（桌機方便測試）。
func hit(event: InputEvent) -> String:
	var pos := Vector2.INF
	var touch := event as InputEventScreenTouch
	if touch and touch.pressed:
		pos = touch.position
	else:
		var mb := event as InputEventMouseButton
		if mb and mb.pressed and mb.button_index == MOUSE_BUTTON_LEFT:
			pos = mb.position
	if pos == Vector2.INF:
		return ""
	# 由後往前找，讓後畫的（視覺上在上層的）優先
	for i in range(_zones.size() - 1, -1, -1):
		if (_zones[i][0] as Rect2).has_point(pos):
			return str(_zones[i][1])
	return ""


## 是否為「按下」事件（用於整頁點擊即關閉的畫面）
static func is_press(event: InputEvent) -> bool:
	var touch := event as InputEventScreenTouch
	if touch and touch.pressed:
		return true
	var mb := event as InputEventMouseButton
	return mb != null and mb.pressed and mb.button_index == MOUSE_BUTTON_LEFT
