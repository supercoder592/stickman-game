extends Control
##
## 對戰結算：勝利／敗北橫幅、獲得金幣、返回主畫面。
##

signal dismissed()

var main = null
var won := false
var reward := 0
var t := 0.0


func bind(m) -> void:
	main = m


func setup(player_won: bool, coins: int) -> void:
	won = player_won
	reward = coins
	t = 0.0


func _process(delta: float) -> void:
	t += delta
	queue_redraw()


## 結算畫面點任意處即可離開（手機沒有鍵盤）
func _input(event: InputEvent) -> void:
	if not visible or t < 0.5:
		return
	if TapRouter.is_press(event):
		dismissed.emit()
		get_viewport().set_input_as_handled()


func _unhandled_input(event: InputEvent) -> void:
	if not visible or t < 0.5:
		return
	var k := event as InputEventKey
	if k == null or not k.pressed or k.echo:
		return
	if k.keycode in [KEY_ENTER, KEY_KP_ENTER, KEY_SPACE, KEY_ESCAPE]:
		dismissed.emit()
		get_viewport().set_input_as_handled()


func _draw() -> void:
	var f: Font = Game.ui_font
	if f == null:
		return
	var w := size.x
	var h := size.y
	var fade: float = clampf(t / 0.4, 0.0, 1.0)

	draw_rect(Rect2(Vector2.ZERO, size), Color(0.02, 0.02, 0.05, 0.72 * fade))

	var accent: Color = Color(1.0, 0.85, 0.35) if won else Color(0.95, 0.4, 0.4)
	var title: String = "勝　利" if won else "敗　北"

	# 橫幅
	var band_h := 132.0
	var band_y := h * 0.5 - band_h * 0.5
	var grow: float = clampf(t / 0.35, 0.0, 1.0)
	var band_w: float = w * ease(grow, 0.35)
	draw_rect(Rect2(w * 0.5 - band_w * 0.5, band_y, band_w, band_h), Color(0.05, 0.06, 0.11, 0.9))
	draw_line(Vector2(w * 0.5 - band_w * 0.5, band_y), Vector2(w * 0.5 + band_w * 0.5, band_y),
		Color(accent.r, accent.g, accent.b, 0.9), 3.0)
	draw_line(Vector2(w * 0.5 - band_w * 0.5, band_y + band_h),
		Vector2(w * 0.5 + band_w * 0.5, band_y + band_h),
		Color(accent.r, accent.g, accent.b, 0.9), 3.0)

	if grow < 1.0:
		return

	var appear: float = clampf((t - 0.3) / 0.35, 0.0, 1.0)
	var tw := f.get_string_size(title, HORIZONTAL_ALIGNMENT_LEFT, -1, 64).x
	draw_string(f, Vector2(w * 0.5 - tw * 0.5 + 3, band_y + 86.0), title,
		HORIZONTAL_ALIGNMENT_LEFT, -1, 64, Color(accent.r, accent.g, accent.b, 0.4 * appear))
	draw_string(f, Vector2(w * 0.5 - tw * 0.5, band_y + 83.0), title,
		HORIZONTAL_ALIGNMENT_LEFT, -1, 64, Color(1, 1, 1, appear))

	# 獎勵
	var reward_text := "獲得 %d 金幣" % reward
	var rw := f.get_string_size(reward_text, HORIZONTAL_ALIGNMENT_LEFT, -1, 22).x
	draw_circle(Vector2(w * 0.5 - rw * 0.5 - 22.0, band_y + band_h + 40.0), 9.0,
		Color(1, 0.82, 0.25, appear))
	_text(f, Vector2(w * 0.5 - rw * 0.5, band_y + band_h + 48.0), reward_text, 22,
		Color(1, 0.9, 0.5, appear))

	var total := "累計 %d 勝　·　持有 %d 金幣" % [Game.wins, Game.coins]
	var qw := f.get_string_size(total, HORIZONTAL_ALIGNMENT_LEFT, -1, 15).x
	_text(f, Vector2(w * 0.5 - qw * 0.5, band_y + band_h + 78.0), total, 15,
		Color(0.75, 0.8, 0.95, appear))

	if t > 0.9:
		var hint := "按 Enter 或點畫面回到主畫面"
		var hw := f.get_string_size(hint, HORIZONTAL_ALIGNMENT_LEFT, -1, 16).x
		var blink := 0.6 + 0.4 * sin(t * 4.0)
		# 放在橫幅下方而非畫面底部，否則會被 HUD 的招式格擋住
		_text(f, Vector2(w * 0.5 - hw * 0.5, band_y + band_h + 118.0), hint, 16,
			Color(0.85, 0.88, 1.0, blink))


func _text(f: Font, pos: Vector2, s: String, sz: int, col: Color) -> void:
	draw_string(f, pos + Vector2(1, 1), s, HORIZONTAL_ALIGNMENT_LEFT, -1, sz, Color(0, 0, 0, col.a * 0.7))
	draw_string(f, pos, s, HORIZONTAL_ALIGNMENT_LEFT, -1, sz, col)
