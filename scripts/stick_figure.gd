class_name StickFigure
extends RefCounted
##
## 火柴人骨架：用純程式算出關節座標並繪製。
## 座標系原點在「腳底」，y 軸向上為負值。
## Fighter 與殘影（Afterimage）共用同一組計算／繪製函式。
##

const HIP_Y := -30.0
const TORSO := 26.0     # 髖 → 肩
const NECK := 30.0      # 髖 → 頸
const HEAD_DIST := 41.0 # 髖 → 頭心
const HEAD_R := 10.0
const THIGH := 16.0
const SHIN := 17.0
const UPPER_ARM := 14.0
const FOREARM := 15.0

## 依 (姿勢, 姿勢時間, 走路相位, 面向, 是否離地) 求出所有關節的區域座標。
static func joints(pose: String, pose_t: float, walk: float, facing: int, airborne: bool) -> Dictionary:
	var f: float = float(sign(facing)) if facing != 0 else 1.0

	# 預設：站立微呼吸
	var bob := sin(walk * 0.6) * 1.2
	var crouch := 0.0
	var lean := 0.0
	# 腿：a1 = 大腿相對垂直的角度，a2 = 膝關節再彎曲
	var lf := 0.14
	var lf2 := 0.06
	var lb := -0.14
	var lb2 := 0.08
	# 手：b1 = 上臂角度（0 = 垂下，PI/2 = 向正前方），b2 = 肘再彎
	var af := 0.18
	var af2 := 0.28
	var ab := -0.12
	var ab2 := 0.22

	match pose:
		"walk":
			bob = absf(sin(walk)) * -2.0
			var s := sin(walk)
			lf = s * 0.55
			lf2 = maxf(0.0, -s) * 0.7
			lb = -s * 0.55
			lb2 = maxf(0.0, s) * 0.7
			af = -s * 0.7
			af2 = 0.3
			ab = s * 0.7
			ab2 = 0.3
			lean = 0.08
		"air":
			lf = 0.55
			lf2 = 0.85
			lb = -0.35
			lb2 = 0.35
			af = 1.5
			af2 = 0.5
			ab = -1.1
			ab2 = 0.5
			lean = 0.12
		"hurt":
			lean = -0.35
			lf = -0.3
			lf2 = 0.5
			lb = 0.25
			lb2 = 0.4
			af = -1.4
			af2 = 0.6
			ab = -1.0
			ab2 = 0.6
		"punch":
			# 直拳：前手完全打直朝前
			var p: float = clampf(pose_t / 0.12, 0.0, 1.0)
			lean = 0.22
			af = lerpf(-0.6, PI * 0.5, p)
			af2 = lerpf(1.4, 0.0, p)
			ab = -1.3
			ab2 = 0.9
			lf = 0.4
			lf2 = 0.15
			lb = -0.45
			lb2 = 0.5
		"punch_up":
			# 上勾拳：蓄力下沉 → 前手由下往上甩
			var p2: float = clampf(pose_t / 0.18, 0.0, 1.0)
			crouch = lerpf(9.0, -4.0, p2)
			lean = lerpf(0.3, -0.25, p2)
			af = lerpf(0.5, 2.62, p2)   # 終點朝前上方
			af2 = lerpf(1.2, -0.25, p2)
			ab = -0.9
			ab2 = 0.8
			lf = 0.5
			lf2 = 0.35
			lb = -0.5
			lb2 = 0.55
		"cast":
			# 雙手前推（水龍、風刃、光束）
			var p3: float = clampf(pose_t / 0.15, 0.0, 1.0)
			lean = lerpf(-0.2, 0.28, p3)
			af = lerpf(-0.8, 1.5, p3)
			af2 = lerpf(1.5, 0.15, p3)
			ab = lerpf(-1.0, 1.35, p3)
			ab2 = lerpf(1.6, 0.3, p3)
			lf = 0.45
			lf2 = 0.25
			lb = -0.5
			lb2 = 0.55
		"slam":
			# 擊地（冰刺、熔岩）
			var p4: float = clampf(pose_t / 0.14, 0.0, 1.0)
			crouch = lerpf(2.0, 15.0, p4)
			lean = lerpf(-0.15, 0.55, p4)
			af = lerpf(2.0, 1.95, p4)
			af2 = lerpf(-0.9, 0.35, p4)
			ab = lerpf(1.8, 1.85, p4)
			ab2 = lerpf(-0.8, 0.4, p4)
			lf = 0.6
			lf2 = 0.8
			lb = -0.6
			lb2 = 0.85
		"charge":
			# 蓄力（龍之怒）：雙手後拉、身體下沉顫抖
			var tr := sin(pose_t * 55.0) * 1.2
			crouch = 8.0 + tr * 0.3
			lean = -0.3
			af = -1.5
			af2 = 1.5
			ab = -1.7
			ab2 = 1.5
			lf = 0.55
			lf2 = 0.7
			lb = -0.55
			lb2 = 0.75
		"dash":
			lean = 0.85
			af = -2.2
			af2 = 0.3
			ab = -1.9
			ab2 = 0.5
			lf = 1.2
			lf2 = 0.2
			lb = -0.9
			lb2 = 1.2
		"cast_hold":
			# 御劍術待命：單手上舉結印
			lean = 0.05
			af = 2.8
			af2 = -0.35
			ab = -0.5
			ab2 = 0.5
			lf = 0.2
			lf2 = 0.1
			lb = -0.2
			lb2 = 0.12

	if airborne and pose in ["idle", "walk"]:
		return joints("air", pose_t, walk, facing, false)

	var hip := Vector2(0, HIP_Y + crouch + bob)
	var up := Vector2(sin(lean) * f, -cos(lean))
	var shoulder := hip + up * TORSO
	var neck := hip + up * NECK
	var head := hip + up * HEAD_DIST

	var j := {
		"hip": hip,
		"shoulder": shoulder,
		"neck": neck,
		"head": head,
		"facing": f,
	}
	j["knee_f"] = hip + _dir(lf + lean, f) * THIGH
	j["foot_f"] = j["knee_f"] + _dir(lf + lf2 + lean, f) * SHIN
	j["knee_b"] = hip + _dir(lb + lean, f) * THIGH
	j["foot_b"] = j["knee_b"] + _dir(lb + lb2 + lean, f) * SHIN
	j["elbow_f"] = shoulder + _dir(af + lean, f) * UPPER_ARM
	j["hand_f"] = j["elbow_f"] + _dir(af + af2 + lean, f) * FOREARM
	j["elbow_b"] = shoulder + _dir(ab + lean, f) * UPPER_ARM
	j["hand_b"] = j["elbow_b"] + _dir(ab + ab2 + lean, f) * FOREARM
	return j


## a = 0 表示朝正下方，正值往面向方向擺動。
static func _dir(a: float, f: float) -> Vector2:
	return Vector2(sin(a) * f, cos(a))


## 繪製骨架。back_fade 讓後側肢體稍暗，產生層次感。
## skin 為造型資料（Game.SKINS 的一筆），phase 用來讓布料／光暈隨時間擺動。
static func draw_figure(ci: CanvasItem, j: Dictionary, col: Color, width := 5.0,
		back_fade := 0.55, skin: Dictionary = {}, phase := 0.0) -> void:
	var accent: Color = skin.get("accent", Color(0.6, 0.7, 0.9))
	accent.a = col.a
	var head_style: String = skin.get("head", "circle")
	var acc: String = skin.get("acc", "none")

	# 光暈：先在底層畫一次加粗的半透明輪廓（不能太粗，否則整個人糊成一團）
	if skin.get("glow", false):
		var g := Color(accent.r, accent.g, accent.b, col.a * 0.14)
		_draw_bones(ci, j, g, g, width * 2.1)
		ci.draw_circle(j["head"], HEAD_R * 1.5, g)

	# 背後配件（羽織、雙翼）畫在身體之前
	_draw_accessory_back(ci, j, acc, col, accent, phase)

	var back := Color(col.r * back_fade, col.g * back_fade, col.b * back_fade, col.a)
	_draw_bones(ci, j, col, back, width)
	_draw_head(ci, j, head_style, col, accent, width)

	# 身前配件（長巾、犄角、光環）
	_draw_accessory_front(ci, j, acc, col, accent, phase)


static func _draw_bones(ci: CanvasItem, j: Dictionary, col: Color, back: Color, width: float) -> void:
	ci.draw_line(j["hip"], j["knee_b"], back, width, true)
	ci.draw_line(j["knee_b"], j["foot_b"], back, width * 0.9, true)
	ci.draw_line(j["shoulder"], j["elbow_b"], back, width * 0.85, true)
	ci.draw_line(j["elbow_b"], j["hand_b"], back, width * 0.75, true)
	ci.draw_line(j["hip"], j["neck"], col, width * 1.25, true)
	ci.draw_line(j["hip"], j["knee_f"], col, width, true)
	ci.draw_line(j["knee_f"], j["foot_f"], col, width * 0.9, true)
	ci.draw_line(j["shoulder"], j["elbow_f"], col, width * 0.85, true)
	ci.draw_line(j["elbow_f"], j["hand_f"], col, width * 0.75, true)


static func _draw_head(ci: CanvasItem, j: Dictionary, style: String,
		col: Color, accent: Color, width: float) -> void:
	var h: Vector2 = j["head"]
	var f: float = j["facing"]
	match style:
		"square":
			var r := HEAD_R * 0.95
			ci.draw_colored_polygon(PackedVector2Array([
				h + Vector2(-r, -r), h + Vector2(r, -r), h + Vector2(r, r), h + Vector2(-r, r),
			]), col)
		"helm":
			ci.draw_circle(h, HEAD_R, col)
			# 面甲橫條 + 頭冠
			ci.draw_line(h + Vector2(-HEAD_R * 0.95, 1.5), h + Vector2(HEAD_R * 0.95, 1.5),
				Color(0.08, 0.08, 0.12, col.a), 3.4, true)
			ci.draw_colored_polygon(PackedVector2Array([
				h + Vector2(-2.5, -HEAD_R), h + Vector2(2.5, -HEAD_R),
				h + Vector2(0, -HEAD_R - 11.0),
			]), accent)
		"hood":
			# 兜帽：頭後方一片較大的布
			ci.draw_colored_polygon(PackedVector2Array([
				h + Vector2(-f * 3.0, -HEAD_R - 5.0),
				h + Vector2(-f * 15.0, -HEAD_R + 2.0),
				h + Vector2(-f * 13.0, HEAD_R + 7.0),
				h + Vector2(f * 4.0, HEAD_R + 3.0),
			]), Color(col.r * 0.7, col.g * 0.7, col.b * 0.75, col.a))
			ci.draw_circle(h, HEAD_R, col)
		"skull":
			ci.draw_circle(h, HEAD_R, col)
			# 兩個深色眼窩 + 下顎線
			ci.draw_circle(h + Vector2(f * 3.6, -1.5), 2.8, Color(0.1, 0.05, 0.08, col.a))
			ci.draw_circle(h + Vector2(-f * 3.2, -1.5), 2.4, Color(0.1, 0.05, 0.08, col.a))
			ci.draw_line(h + Vector2(-HEAD_R * 0.6, HEAD_R * 0.55),
				h + Vector2(HEAD_R * 0.6, HEAD_R * 0.55),
				Color(0.15, 0.08, 0.1, col.a * 0.8), 1.8, true)
		"topknot":
			ci.draw_circle(h, HEAD_R, col)
			# 頭頂髮髻：貼著頭頂，束起的髮尾往後翹
			var knot := h + Vector2(-f * 1.5, -HEAD_R - 1.5)
			ci.draw_circle(knot, 4.2, accent)
			ci.draw_line(knot, knot + Vector2(-f * 9.0, -5.0), accent, 2.6, true)
		_:
			ci.draw_circle(h, HEAD_R, col)


static func _draw_accessory_back(ci: CanvasItem, j: Dictionary, acc: String,
		col: Color, accent: Color, phase: float) -> void:
	var sh: Vector2 = j["shoulder"]
	var f: float = j["facing"]
	match acc:
		"haori":
			# 羽織：只披在背側的窄長外衣，下襬外擺。
			# 刻意不蓋住正面軀幹，否則火柴人的剪影會整個被糊掉。
			var sway := sin(phase * 2.4) * 6.0
			var top := sh + Vector2(0, -3.0)
			var cloth := PackedVector2Array([
				top + Vector2(f * 2.0, 0.0),
				top + Vector2(-f * 9.0, 1.0),
				top + Vector2(-f * 15.0 - f * sway, 40.0),
				top + Vector2(-f * 2.0 - f * sway * 0.6, 38.0),
			])
			# 布料壓得比膚色深很多，再加亮邊，否則同色系會和身體糊成一團
			ci.draw_colored_polygon(cloth,
				Color(col.r * 0.26, col.g * 0.22, col.b * 0.26, col.a * 0.95))
			ci.draw_polyline(cloth + PackedVector2Array([cloth[0]]),
				Color(accent.r, accent.g, accent.b, col.a * 0.75), 1.8, true)
			# 下襬的火焰／波浪紋
			for i in 3:
				var u := -f * (4.0 + float(i) * 4.5) - f * sway
				ci.draw_line(top + Vector2(u, 39.0), top + Vector2(u - f * 2.0, 29.0),
					Color(accent.r, accent.g, accent.b, col.a * 0.9), 2.2, true)
		"wings":
			# 兩片一律往「背後上方」張開的翼，只在角度與長度上錯開
			var flap := sin(phase * 3.0) * 0.16
			var root := sh + Vector2(-f * 3.0, -1.0)
			for side in 2:
				var s: float = 1.0 if side == 0 else 0.55
				var lift := (-40.0 * s) + flap * 26.0
				var tip := root + Vector2(-f * (34.0 + 18.0 * s), lift)
				var tail := root + Vector2(-f * (18.0 + 10.0 * s), lift * 0.25 + 20.0)
				ci.draw_colored_polygon(PackedVector2Array([root, tip, tail]),
					Color(col.r * 0.75, col.g * 0.75, col.b * 0.9, col.a * (0.9 - 0.2 * (1.0 - s))))
				# 羽毛分岔：沿翼前緣往後拉線
				for i in 3:
					var t2 := 0.35 + 0.24 * float(i)
					var p: Vector2 = root.lerp(tip, t2)
					var q: Vector2 = root.lerp(tail, t2)
					ci.draw_line(p, p.lerp(q, 0.55),
						Color(accent.r, accent.g, accent.b, col.a * 0.5), 1.6, true)


static func _draw_accessory_front(ci: CanvasItem, j: Dictionary, acc: String,
		col: Color, accent: Color, phase: float) -> void:
	var neck: Vector2 = j["neck"]
	var h: Vector2 = j["head"]
	var f: float = j["facing"]
	match acc:
		"scarf":
			# 長巾：頸部起一條隨正弦飄動的緞帶
			var pts := PackedVector2Array()
			var widths := PackedFloat32Array()
			for i in 11:
				var u := float(i) / 10.0
				pts.append(neck + Vector2(-f * u * 52.0,
					2.0 + sin(phase * 3.2 + u * 5.0) * (5.0 + u * 12.0)))
				widths.append(lerpf(6.0, 1.2, u))
			var poly := Fx.ribbon(pts, widths)
			if poly.size() >= 3:
				ci.draw_colored_polygon(poly, Color(accent.r, accent.g, accent.b, col.a * 0.95))
			# 頸部結
			ci.draw_circle(neck + Vector2(0, 2.0), 4.2, accent)
		"horns":
			for side in 2:
				var s: float = 1.0 if side == 0 else -1.0
				var base := h + Vector2(s * f * 6.5, -HEAD_R * 0.72)
				ci.draw_colored_polygon(PackedVector2Array([
					base + Vector2(-s * f * 2.6, 1.0),
					base + Vector2(s * f * 3.0, 0.0),
					base + Vector2(s * f * 8.0, -15.0),
				]), Color(accent.r, accent.g, accent.b, col.a))
		"halo":
			var r := HEAD_R * 1.5
			var y := h.y - HEAD_R - 9.0
			ci.draw_set_transform(Vector2(h.x, y), 0.0, Vector2(1.0, 0.34))
			ci.draw_arc(Vector2.ZERO, r, 0, TAU, 26,
				Color(accent.r, accent.g, accent.b, col.a * (0.55 + 0.35 * sin(phase * 4.0))), 2.6, true)
			ci.draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


## 殘影：把某一瞬間的骨架凍結下來慢慢淡出（雷電衝刺等使用）。
class Afterimage extends Node2D:
	var joints_data: Dictionary
	var col := Color(1, 0.9, 0.3, 0.8)
	var life := 0.3
	var t := 0.0
	var width := 5.0
	var skin: Dictionary = {}

	func _ready() -> void:
		var mat := CanvasItemMaterial.new()
		mat.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
		material = mat

	func _process(delta: float) -> void:
		t += delta
		if t >= life:
			queue_free()
			return
		queue_redraw()

	func _draw() -> void:
		var a: float = (1.0 - t / life) * col.a
		# 殘影不畫光暈，避免疊出一片死白
		var flat := skin.duplicate()
		flat["glow"] = false
		StickFigure.draw_figure(self, joints_data, Color(col.r, col.g, col.b, a), width, 0.8, flat)
