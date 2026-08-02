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
static func draw_figure(ci: CanvasItem, j_in: Dictionary, col: Color, width := 5.0,
		back_fade := 0.55, skin: Dictionary = {}, phase := 0.0) -> void:
	var accent: Color = skin.get("accent", Color(0.6, 0.7, 0.9))
	accent.a = col.a
	var head_style: String = skin.get("head", "circle")
	var acc: String = skin.get("acc", "none")

	# 體型：整體大小與四肢粗細。
	# 這是造型「遠看能不能分辨」的關鍵 —— 只換顏色與小配件在戰鬥尺寸下幾乎看不出差別，
	# 剪影本身不同才有辨識度。
	var build: float = skin.get("build", 1.0)
	var j := _scaled(j_in, build)
	var head_r: float = HEAD_R * build * float(skin.get("head_r", 1.0))
	var w: float = width * build * float(skin.get("limb_w", 1.0))

	# 光暈：先在底層畫一次加粗的半透明輪廓（不能太粗，否則整個人糊成一團）
	if skin.get("glow", false):
		var g := Color(accent.r, accent.g, accent.b, col.a * 0.14)
		_draw_bones(ci, j, g, g, w * 2.1)
		ci.draw_circle(j["head"], head_r * 1.5, g)

	# 背後配件（羽織、雙翼、披風、雙刀）畫在身體之前
	_draw_accessory_back(ci, j, acc, col, accent, phase, build)

	var back := Color(col.r * back_fade, col.g * back_fade, col.b * back_fade, col.a)
	_draw_bones(ci, j, col, back, w)
	_draw_head(ci, j, head_style, col, accent, head_r)

	# 身前配件（長巾、犄角、光環、護甲、尾巴）
	_draw_accessory_front(ci, j, acc, col, accent, phase, build, head_r)


## 依體型倍率縮放所有關節座標（腳底為原點，因此直接乘即可）
static func _scaled(j: Dictionary, s: float) -> Dictionary:
	if is_equal_approx(s, 1.0):
		return j
	var out := {}
	for k in j:
		if k == "facing":
			out[k] = j[k]
		else:
			out[k] = (j[k] as Vector2) * s
	return out


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
		col: Color, accent: Color, r: float) -> void:
	var h: Vector2 = j["head"]
	var f: float = j["facing"]
	match style:
		"square":
			var s := r * 0.95
			ci.draw_colored_polygon(PackedVector2Array([
				h + Vector2(-s, -s), h + Vector2(s, -s), h + Vector2(s, s), h + Vector2(-s, s),
			]), col)
		"helm":
			ci.draw_circle(h, r, col)
			# 面甲橫條 + 頭冠
			ci.draw_line(h + Vector2(-r * 0.95, r * 0.15), h + Vector2(r * 0.95, r * 0.15),
				Color(0.08, 0.08, 0.12, col.a), r * 0.34, true)
			ci.draw_colored_polygon(PackedVector2Array([
				h + Vector2(-r * 0.25, -r), h + Vector2(r * 0.25, -r),
				h + Vector2(0, -r - r * 1.1),
			]), accent)
		"hood":
			# 兜帽：頭後方一片較大的布
			ci.draw_colored_polygon(PackedVector2Array([
				h + Vector2(-f * r * 0.3, -r - r * 0.5),
				h + Vector2(-f * r * 1.5, -r + r * 0.2),
				h + Vector2(-f * r * 1.3, r + r * 0.7),
				h + Vector2(f * r * 0.4, r + r * 0.3),
			]), Color(col.r * 0.7, col.g * 0.7, col.b * 0.75, col.a))
			ci.draw_circle(h, r, col)
		"skull":
			ci.draw_circle(h, r, col)
			# 兩個深色眼窩 + 下顎線
			ci.draw_circle(h + Vector2(f * r * 0.36, -r * 0.15), r * 0.28, Color(0.1, 0.05, 0.08, col.a))
			ci.draw_circle(h + Vector2(-f * r * 0.32, -r * 0.15), r * 0.24, Color(0.1, 0.05, 0.08, col.a))
			for i in 4:
				var x := (float(i) - 1.5) * r * 0.34
				ci.draw_line(h + Vector2(x, r * 0.4), h + Vector2(x, r * 0.85),
					Color(0.15, 0.08, 0.1, col.a * 0.85), 1.6, true)
		"topknot":
			ci.draw_circle(h, r, col)
			var knot := h + Vector2(-f * r * 0.15, -r - r * 0.15)
			ci.draw_circle(knot, r * 0.42, accent)
			ci.draw_line(knot, knot + Vector2(-f * r * 0.9, -r * 0.5), accent, r * 0.26, true)
		"flame_hair":
			ci.draw_circle(h, r, col)
			# 尖銳的火焰狀頭髮，往後上方竄
			for i in 5:
				var u := float(i) / 4.0
				var base := h + Vector2(lerpf(r * 0.5, -r * 0.9, u) * f, -r * 0.55 - u * r * 0.25)
				var tip := base + Vector2(-f * (r * 0.5 + u * r * 0.9), -r * (1.5 - u * 0.7))
				ci.draw_colored_polygon(PackedVector2Array([
					base + Vector2(-f * r * 0.22, r * 0.1),
					base + Vector2(f * r * 0.22, 0.0),
					tip,
				]), accent)
		"mask":
			ci.draw_circle(h, r, col)
			# 般若面具：深色底 + 兩道紅色眼縫
			ci.draw_colored_polygon(PackedVector2Array([
				h + Vector2(f * r * 0.95, -r * 0.35), h + Vector2(-f * r * 0.7, -r * 0.5),
				h + Vector2(-f * r * 0.75, r * 0.55), h + Vector2(f * r * 0.85, r * 0.7),
			]), Color(0.1, 0.09, 0.13, col.a))
			ci.draw_line(h + Vector2(f * r * 0.15, -r * 0.1), h + Vector2(f * r * 0.8, -r * 0.25),
				accent, r * 0.2, true)
			ci.draw_line(h + Vector2(-f * r * 0.55, -r * 0.05), h + Vector2(-f * r * 0.15, -r * 0.18),
				accent, r * 0.16, true)
		_:
			ci.draw_circle(h, r, col)


static func _draw_accessory_back(ci: CanvasItem, j: Dictionary, acc: String,
		col: Color, accent: Color, phase: float, b := 1.0) -> void:
	var sh: Vector2 = j["shoulder"]
	var f: float = j["facing"]
	match acc:
		"cape":
			# 大披風：比羽織長且下襬張得更開，是遠看最容易辨識的剪影
			var sway := sin(phase * 2.2) * 10.0 * b
			var top := sh + Vector2(0, -4.0 * b)
			var cloth := PackedVector2Array([
				top + Vector2(f * 4.0 * b, 0.0),
				top + Vector2(-f * 11.0 * b, 2.0 * b),
				top + Vector2(-f * 34.0 * b - f * sway, 46.0 * b),
				top + Vector2(-f * 6.0 * b - f * sway * 0.5, 62.0 * b),
				top + Vector2(f * 12.0 * b, 40.0 * b),
			])
			ci.draw_colored_polygon(cloth,
				Color(col.r * 0.3, col.g * 0.26, col.b * 0.3, col.a * 0.95))
			ci.draw_polyline(cloth + PackedVector2Array([cloth[0]]),
				Color(accent.r, accent.g, accent.b, col.a * 0.8), 2.0 * b, true)
		"blades":
			# 背後交叉雙刀
			for s in 2:
				var dir: float = 1.0 if s == 0 else -1.0
				var a := sh + Vector2(-f * 6.0 * b, 2.0 * b)
				var tip := a + Vector2(-f * 26.0 * b * dir, -30.0 * b + dir * 8.0 * b)
				ci.draw_line(a, tip, Color(0.75, 0.78, 0.88, col.a), 4.0 * b, true)
				ci.draw_line(a, a.lerp(tip, 0.28), accent, 5.5 * b, true)
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
		col: Color, accent: Color, phase: float, b := 1.0, head_r := HEAD_R) -> void:
	var neck: Vector2 = j["neck"]
	var h: Vector2 = j["head"]
	var hip: Vector2 = j["hip"]
	var sh: Vector2 = j["shoulder"]
	var f: float = j["facing"]
	match acc:
		"gauntlets":
			# 拳套：加厚的拳頭 + 護腕，發光造型還會在拳上燃起火舌。
			# 這是唯一「動作時才最明顯」的配件 —— 揮拳與招式的手部位置都會帶著它。
			for key_v in ["hand_b", "hand_f"]:
				var key: String = key_v
				var hand: Vector2 = j[key]
				var elbow: Vector2 = j[key.replace("hand", "elbow")]
				var dir := (hand - elbow).normalized()
				if dir == Vector2.ZERO:
					dir = Vector2(f, 0)
				var front: bool = key == "hand_f"
				var r: float = (7.6 if front else 6.6) * b

				if col.a > 0.0 and accent.a > 0.0:
					# 火焰／能量拖尾，朝手臂反方向散開
					for i in 3:
						var u := float(i) / 2.0
						var tail := hand - dir * (r * (1.2 + u * 1.5))
						var off: float = 0.0 if front else 1.7
						var flick := sin(phase * 6.0 + u * 3.0 + off)
						ci.draw_circle(tail + dir.orthogonal() * flick * 3.0 * b,
							r * (0.85 - u * 0.25),
							Color(accent.r, accent.g, accent.b, col.a * (0.3 - u * 0.08)))
				# 護腕
				var cuff := hand - dir * r * 1.1
				ci.draw_colored_polygon(PackedVector2Array([
					cuff + dir.orthogonal() * r * 0.95,
					cuff - dir.orthogonal() * r * 0.95,
					cuff - dir * r * 0.9 - dir.orthogonal() * r * 0.7,
					cuff - dir * r * 0.9 + dir.orthogonal() * r * 0.7,
				]), Color(accent.r * 0.55, accent.g * 0.5, accent.b * 0.6, col.a))
				# 拳體：外層光暈 → 深色皮革 → 亮色能量核心。
				# 皮革刻意壓暗，否則同色系的拳套會和手臂糊成一團看不出形狀。
				ci.draw_circle(hand, r * 1.5, Color(accent.r, accent.g, accent.b, col.a * 0.28))
				ci.draw_circle(hand, r, Color(col.r * 0.32, col.g * 0.28, col.b * 0.3, col.a))
				ci.draw_circle(hand + dir * r * 0.25, r * 0.52,
					Color(accent.r, accent.g, accent.b, col.a * 0.95))
				ci.draw_circle(hand + dir * r * 0.3, r * 0.24,
					Color(1, 1, 1, col.a * 0.75))
		"armor":
			# 肩甲 + 胸甲，讓上半身明顯變寬
			for s in 2:
				var dir: float = 1.0 if s == 0 else -1.0
				var c := sh + Vector2(dir * f * 11.0 * b, -1.0 * b)
				ci.draw_colored_polygon(PackedVector2Array([
					c + Vector2(-7.0 * b, -5.0 * b), c + Vector2(9.0 * b * dir, -3.0 * b),
					c + Vector2(8.0 * b * dir, 7.0 * b), c + Vector2(-6.0 * b, 8.0 * b),
				]), Color(accent.r * 0.8, accent.g * 0.8, accent.b * 0.85, col.a))
			ci.draw_colored_polygon(PackedVector2Array([
				sh + Vector2(-8.0 * b, 4.0 * b), sh + Vector2(8.0 * b, 4.0 * b),
				sh + Vector2(6.0 * b, 20.0 * b), sh + Vector2(-6.0 * b, 20.0 * b),
			]), Color(accent.r * 0.6, accent.g * 0.6, accent.b * 0.68, col.a))
		"tail":
			# 分節長尾，隨相位擺動
			var pts := PackedVector2Array()
			var widths := PackedFloat32Array()
			for i in 9:
				var u := float(i) / 8.0
				pts.append(hip + Vector2(-f * u * 44.0 * b,
					6.0 * b + sin(phase * 3.0 + u * 4.0) * (4.0 + u * 14.0) * b))
				widths.append(lerpf(6.0, 1.0, u) * b)
			var poly := Fx.ribbon(pts, widths)
			if poly.size() >= 3:
				ci.draw_colored_polygon(poly, Color(col.r * 0.85, col.g * 0.85, col.b * 0.9, col.a))
			# 尾端尖刺
			var last: Vector2 = pts[pts.size() - 1]
			ci.draw_colored_polygon(PackedVector2Array([
				last + Vector2(0, -5.0 * b), last + Vector2(-f * 14.0 * b, 0),
				last + Vector2(0, 5.0 * b),
			]), accent)
		"scarf":
			# 長巾：頸部起一條隨正弦飄動的緞帶
			var pts := PackedVector2Array()
			var widths := PackedFloat32Array()
			for i in 13:
				var u := float(i) / 12.0
				pts.append(neck + Vector2(-f * u * 78.0 * b,
					2.0 * b + sin(phase * 3.2 + u * 5.0) * (5.0 + u * 20.0) * b))
				widths.append(lerpf(7.0, 1.2, u) * b)
			var poly := Fx.ribbon(pts, widths)
			if poly.size() >= 3:
				ci.draw_colored_polygon(poly, Color(accent.r, accent.g, accent.b, col.a * 0.95))
			# 頸部結
			ci.draw_circle(neck + Vector2(0, 2.0 * b), 4.2 * b, accent)
		"horns":
			# 巨角：長度隨頭部大小放大，是「鬼」與「龍人」的主要辨識點
			for side in 2:
				var s: float = 1.0 if side == 0 else -1.0
				var base := h + Vector2(s * f * head_r * 0.65, -head_r * 0.72)
				ci.draw_colored_polygon(PackedVector2Array([
					base + Vector2(-s * f * head_r * 0.3, head_r * 0.12),
					base + Vector2(s * f * head_r * 0.34, 0.0),
					base + Vector2(s * f * head_r * 1.1, -head_r * 2.0),
				]), Color(accent.r, accent.g, accent.b, col.a))
		"halo":
			var r := head_r * 1.5
			var y := h.y - head_r - 9.0 * b
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
