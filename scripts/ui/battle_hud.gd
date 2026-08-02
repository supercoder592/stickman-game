extends Control
##
## 對戰 HUD：左右兩側的血條（玩家 / 對手）、三個招式格與冷卻、狀態異常、開場倒數。
##

var main = null
var arena = null
var t := 0.0
var _p_bar := 1.0          # 平滑追隨的血量比例
var _o_bar := 1.0


func bind(m) -> void:
	main = m


func bind_arena(a) -> void:
	arena = a
	_p_bar = 1.0
	_o_bar = 1.0
	t = 0.0


func _process(delta: float) -> void:
	t += delta
	var p = _player()
	var o = _opponent()
	if p:
		_p_bar = move_toward(_p_bar, clampf(p.hp / p.max_hp, 0.0, 1.0), delta * 0.9)
	if o:
		_o_bar = move_toward(_o_bar, clampf(o.hp / o.max_hp, 0.0, 1.0), delta * 0.9)
	queue_redraw()


func _player():
	if arena and is_instance_valid(arena) and is_instance_valid(arena.player):
		return arena.player
	return null


func _opponent():
	if arena and is_instance_valid(arena) and is_instance_valid(arena.opponent):
		return arena.opponent
	return null


# ------------------------------------------------------------------ 繪製
func _draw() -> void:
	var f: Font = Game.ui_font
	if f == null or arena == null or not is_instance_valid(arena):
		return
	var w := size.x

	_draw_fighter_bar(f, _player(), Rect2(28, 26, 470, 52), false, "你")
	_draw_fighter_bar(f, _opponent(), Rect2(w - 498.0, 26, 470, 52), true, "對手")
	_draw_moves(f)
	_draw_intro(f, w)


## mirrored = true 時整條由右往左減少（格鬥遊戲的對稱配置）
func _draw_fighter_bar(f: Font, fighter, r: Rect2, mirrored: bool, label: String) -> void:
	if fighter == null:
		return
	var element: String = fighter.element_id
	var col: Color = Game.element_color(element)
	var ratio: float = clampf(fighter.hp / fighter.max_hp, 0.0, 1.0)
	var ghost: float = maxf(ratio, _o_bar if mirrored else _p_bar)

	var bar := Rect2(r.position + Vector2(0, 22), Vector2(r.size.x, 22))
	draw_rect(bar.grow(2.0), Color(0.04, 0.05, 0.09, 0.85))
	draw_rect(bar, Color(0.16, 0.06, 0.09, 0.95))

	# 受傷殘影（緩慢追下來的白條）
	var ghost_rect := Rect2(bar.position, Vector2(bar.size.x * ghost, bar.size.y))
	var fill_rect := Rect2(bar.position, Vector2(bar.size.x * ratio, bar.size.y))
	if mirrored:
		ghost_rect.position.x = bar.end.x - bar.size.x * ghost
		fill_rect.position.x = bar.end.x - bar.size.x * ratio
	draw_rect(ghost_rect, Color(1, 1, 1, 0.28))
	var hp_col := Color(0.35, 0.9, 0.5).lerp(Color(0.95, 0.3, 0.3), 1.0 - ratio)
	draw_rect(fill_rect, hp_col)
	draw_rect(bar, Color(col.r, col.g, col.b, 0.65), false, 2.0)

	# 名牌
	var elem_name := Game.element_name(element)
	var title := "%s　·　%s" % [label, elem_name]
	var tw := f.get_string_size(title, HORIZONTAL_ALIGNMENT_LEFT, -1, 17).x
	var tx: float = r.position.x if not mirrored else r.end.x - tw
	_text(f, Vector2(tx, r.position.y + 15.0), title, 17, col)

	var hp_text := "%d" % int(ceil(fighter.hp))
	var hw := f.get_string_size(hp_text, HORIZONTAL_ALIGNMENT_LEFT, -1, 13).x
	var hx: float = bar.end.x - hw - 8.0 if not mirrored else bar.position.x + 8.0
	_text(f, Vector2(hx, bar.position.y + 16.0), hp_text, 13, Color(1, 1, 1, 0.9))

	_draw_status(f, fighter, Vector2(r.position.x, r.position.y + 54.0), mirrored, r)


func _draw_status(f: Font, fighter, pos: Vector2, mirrored: bool, r: Rect2) -> void:
	var chips := []
	if fighter.burn_time > 0.0:
		chips.append(["灼燒", Color(1, 0.45, 0.1)])
	if fighter.freeze_time > 0.0:
		chips.append(["凍結", Color(0.6, 0.9, 1.0)])
	if fighter.slow_time > 0.0:
		chips.append(["減速", Color(0.8, 0.6, 1.0)])
	if fighter.poison_stacks > 0:
		chips.append(["毒 %d" % fighter.poison_stacks, Color(0.75, 0.4, 1.0)])
	if fighter.damage_reduction > 0.0:
		chips.append(["護盾", Color(1.0, 0.85, 0.45)])
	if chips.is_empty():
		return

	var cw := 56.0
	for i in chips.size():
		var c: Array = chips[i]
		var x: float = pos.x + float(i) * (cw + 6.0)
		if mirrored:
			x = r.end.x - cw - float(i) * (cw + 6.0)
		var rect := Rect2(x, pos.y, cw, 20.0)
		var col: Color = c[1]
		draw_rect(rect, Color(col.r, col.g, col.b, 0.22))
		draw_rect(rect, col, false, 1.0)
		_text(f, rect.position + Vector2(7, 15), str(c[0]), 12, col)


## 底部三個招式格
func _draw_moves(f: Font) -> void:
	var p = _player()
	if p == null or p.moves.is_empty():
		return
	var keys := ["U", "I", "O"]
	var slot := 104.0
	var gap := 14.0
	var total := slot * 3.0 + gap * 2.0
	var x0 := size.x * 0.5 - total * 0.5
	var y := size.y - slot - 26.0

	for i in mini(3, p.moves.size()):
		var m = p.moves[i]
		if not is_instance_valid(m):
			continue
		var r := Rect2(x0 + float(i) * (slot + gap), y, slot, slot)
		var col: Color = m.color
		var ready: bool = m.can_use()

		draw_rect(r, Color(0.05, 0.06, 0.11, 0.85))
		var border: Color = Color(col.r, col.g, col.b, 0.85) if ready else Color(0.3, 0.34, 0.46, 0.7)
		draw_rect(r, border, false, 2.0)

		# 元素核心圖示
		var c := r.position + r.size * 0.5 + Vector2(0, -8)
		var dim: float = 1.0 if ready else 0.35
		draw_circle(c, 26.0, Color(col.r, col.g, col.b, 0.14 * dim))
		draw_colored_polygon(Fx.star(c, 6, 17.0, 7.0, t * 0.9 + float(i)),
			Color(col.r, col.g, col.b, dim))
		draw_circle(c, 5.0, Color(1, 1, 1, 0.9 * dim))

		# 無冷卻招式：右上角掛一個常駐標記，不畫冷卻遮罩
		if m.is_free():
			var tag := Rect2(r.end.x - 40.0, r.position.y + 6.0, 34.0, 18.0)
			draw_rect(tag, Color(0.35, 0.85, 0.55, 0.22))
			draw_rect(tag, Color(0.45, 0.95, 0.6, 0.7), false, 1.0)
			_text(f, tag.position + Vector2(3, 14), "∞", 14, Color(0.6, 1.0, 0.75))

		# 冷卻：由下往上的遮罩 + 讀秒
		if m.cooldown > 0.0:
			var k: float = clampf(m.cooldown / maxf(m.cd_max, 0.001), 0.0, 1.0)
			draw_rect(Rect2(r.position.x, r.position.y + r.size.y * (1.0 - k),
				r.size.x, r.size.y * k), Color(0.02, 0.03, 0.07, 0.68))
			var cd := "%.1f" % m.cooldown
			var cw2 := f.get_string_size(cd, HORIZONTAL_ALIGNMENT_LEFT, -1, 20).x
			_text(f, c + Vector2(-cw2 * 0.5, 7), cd, 20, Color(1, 1, 1, 0.95))

		# 按鍵徽章
		var badge := Rect2(r.position + Vector2(6, 6), Vector2(22, 20))
		draw_rect(badge, Color(col.r, col.g, col.b, 0.28))
		_text(f, badge.position + Vector2(7, 15), keys[i], 12, Color(1, 0.97, 0.85))

		# 二段式提示
		if m.stage_label != "" and m.stage > 0:
			var sw := f.get_string_size(m.stage_label, HORIZONTAL_ALIGNMENT_LEFT, -1, 12).x
			_text(f, Vector2(r.position.x + r.size.x * 0.5 - sw * 0.5, r.end.y - 8.0),
				m.stage_label, 12, Color(1, 0.85, 0.5))
		else:
			var nm: String = m.move_name()
			var nw := f.get_string_size(nm, HORIZONTAL_ALIGNMENT_LEFT, -1, 11).x
			var scale_x: float = minf(1.0, (slot - 8.0) / maxf(nw, 1.0))
			draw_set_transform(Vector2(r.position.x + r.size.x * 0.5, r.end.y - 8.0),
				0.0, Vector2(scale_x, 1.0))
			draw_string(f, Vector2(-nw * 0.5, 0), nm, HORIZONTAL_ALIGNMENT_LEFT, -1, 11,
				Color(0.82, 0.86, 1.0))
			draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


## 開場倒數：3 → 2 → 1 → 開始！
func _draw_intro(f: Font, w: float) -> void:
	if arena.intro_t <= 0.0:
		return
	var text := "開始！"
	var remain: float = arena.intro_t
	if remain > 1.05:
		text = str(int(ceil(remain - 0.05)))
	var sz := 86
	var tw := f.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, sz).x
	# 每個數字：瞬間放大出現後維持明亮，最後 0.2 秒才淡出
	var frac := fposmod(remain, 1.0)
	var pop: float = clampf((1.0 - frac) / 0.2, 0.0, 1.0)
	var a: float = clampf(frac / 0.2, 0.0, 1.0)
	var s: float = lerpf(1.6, 1.0, pop)
	draw_set_transform(Vector2(w * 0.5, size.y * 0.38), 0.0, Vector2(s, s))
	draw_string(f, Vector2(-tw * 0.5 + 3, 3), text, HORIZONTAL_ALIGNMENT_LEFT, -1, sz,
		Color(0, 0, 0, 0.5 * a))
	draw_string(f, Vector2(-tw * 0.5, 0), text, HORIZONTAL_ALIGNMENT_LEFT, -1, sz,
		Color(1, 0.92, 0.6, a))
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


func _text(f: Font, pos: Vector2, s: String, sz: int, col: Color) -> void:
	draw_string(f, pos + Vector2(1, 1), s, HORIZONTAL_ALIGNMENT_LEFT, -1, sz, Color(0, 0, 0, col.a * 0.7))
	draw_string(f, pos, s, HORIZONTAL_ALIGNMENT_LEFT, -1, sz, col)
