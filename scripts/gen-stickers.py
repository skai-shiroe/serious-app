#!/usr/bin/env python3
"""Genere les stickers embarques de l'app (assets/stickers/*.png).

Style : flat vector, couleurs vives, PNG transparents 512x512, rendus en
supersampling x2 puis redimensionnes (bords nets). Relancer apres modif :
    python3 scripts/gen-stickers.py
"""
import math
import os
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'stickers')
SIZE = 512
SS = 2  # supersampling
S = SIZE * SS

YELLOW = (255, 211, 61, 255)
YELLOW_DARK = (232, 184, 40, 255)
RED = (239, 68, 68, 255)
RED_DARK = (190, 40, 40, 255)
PINK = (244, 114, 182, 255)
DARK = (40, 35, 35, 255)
WHITE = (255, 255, 255, 255)
BLUE = (59, 130, 246, 255)
BLUE_DARK = (37, 99, 235, 255)
GREEN = (34, 197, 94, 255)
BROWN = (161, 98, 71, 255)
BROWN_LIGHT = (214, 158, 124, 255)
ORANGE = (249, 115, 22, 255)
GREY = (156, 163, 175, 255)


def canvas():
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    return img, ImageDraw.Draw(img)


def finish(img, name):
    img = img.resize((SIZE, SIZE), Image.LANCZOS)
    img.save(os.path.join(OUT, f'{name}.png'))
    print('ok', name)


def circle(d, cx, cy, r, fill):
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=fill)


def font(size):
    for path in (
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
        '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
    ):
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def text_center(d, s, cx, cy, f, fill):
    x0, y0, x1, y1 = d.textbbox((0, 0), s, font=f)
    d.text((cx - (x1 + x0) / 2, cy - (y1 + y0) / 2), s, font=f, fill=fill)


def face(name, draw_features):
    img, d = canvas()
    circle(d, S / 2, S / 2, S * 0.42, YELLOW)
    draw_features(img, d)
    finish(img, name)


def f_eyes_happy(d, y=S * 0.40):
    for x in (S * 0.36, S * 0.64):
        d.arc([x - S * 0.055, y - S * 0.03, x + S * 0.055, y + S * 0.055],
              180, 360, fill=DARK, width=int(S * 0.022))


def f_eyes_dot(d, y=S * 0.40, r=S * 0.035):
    for x in (S * 0.37, S * 0.63):
        circle(d, x, y, r, DARK)


def f_smile(d, y=S * 0.55, w=S * 0.11):
    d.arc([S / 2 - w, y - w * 0.7, S / 2 + w, y + w * 0.9], 15, 165, fill=DARK,
          width=int(S * 0.024))


def gen_smileys():
    face('joy', lambda i, d: (f_eyes_happy(d),
        d.chord([S/2 - S*0.14, S*0.48, S/2 + S*0.14, S*0.68], 0, 180, fill=DARK),
        d.chord([S/2 - S*0.09, S*0.575, S/2 + S*0.09, S*0.70], 0, 180, fill=(239, 90, 90, 255))))

    def love(i, d):
        for x in (S * 0.36, S * 0.64):
            r = S * 0.05
            circle(d, x - r * 0.55, S * 0.40 - r * 0.25, r, RED)
            circle(d, x + r * 0.55, S * 0.40 - r * 0.25, r, RED)
            d.polygon([(x - r, S * 0.40), (x + r, S * 0.40), (x, S * 0.40 + r * 1.25)], fill=RED)
        f_smile(d)
    face('love', love)

    def cool(i, d):
        y = S * 0.40
        d.rounded_rectangle([S*0.24, y - S*0.045, S*0.485, y + S*0.055], radius=S*0.03, fill=DARK)
        d.rounded_rectangle([S*0.515, y - S*0.045, S*0.76, y + S*0.055], radius=S*0.03, fill=DARK)
        d.rectangle([S*0.485, y - S*0.02, S*0.515, y + S*0.005], fill=DARK)
        f_smile(d, y=S * 0.58)
    face('cool', cool)

    def wink(i, d):
        circle(d, S * 0.37, S * 0.40, S * 0.035, DARK)
        d.arc([S*0.58, S*0.355, S*0.70, S*0.44], 180, 360, fill=DARK, width=int(S*0.022))
        f_smile(d)
    face('wink', wink)

    def blush(i, d):
        circle(d, S * 0.30, S * 0.50, S * 0.055, (251, 168, 190, 255))
        circle(d, S * 0.70, S * 0.50, S * 0.055, (251, 168, 190, 255))
        f_eyes_happy(d)
        f_smile(d)
    face('blush', blush)

    def cry(i, d):
        f_eyes_happy(d)
        for x in (S * 0.34, S * 0.66):
            d.polygon([(x, S * 0.44), (x - S * 0.035, S * 0.56), (x + S * 0.035, S * 0.56)], fill=BLUE)
            circle(d, x, S * 0.585, S * 0.035, BLUE)
        d.arc([S/2 - S*0.09, S*0.60, S/2 + S*0.09, S*0.74], 195, 345, fill=DARK, width=int(S*0.022))
    face('cry', cry)

    def angry(i, d):
        d.line([S*0.28, S*0.32, S*0.45, S*0.39], fill=RED_DARK, width=int(S*0.028))
        d.line([S*0.72, S*0.32, S*0.55, S*0.39], fill=RED_DARK, width=int(S*0.028))
        f_eyes_dot(d, y=S * 0.44)
        d.arc([S/2 - S*0.09, S*0.60, S/2 + S*0.09, S*0.72], 195, 345, fill=DARK, width=int(S*0.024))
    face('angry', angry)

    def sleepy(i, d):
        d.line([S*0.31, S*0.41, S*0.43, S*0.41], fill=DARK, width=int(S*0.022))
        d.line([S*0.57, S*0.41, S*0.69, S*0.41], fill=DARK, width=int(S*0.022))
        circle(d, S / 2, S * 0.58, S * 0.028, DARK)
    face('sleepy', sleepy)

    def surprised(i, d):
        circle(d, S * 0.38, S * 0.40, S * 0.055, WHITE)
        circle(d, S * 0.62, S * 0.40, S * 0.055, WHITE)
        circle(d, S * 0.38, S * 0.41, S * 0.028, DARK)
        circle(d, S * 0.62, S * 0.41, S * 0.028, DARK)
        circle(d, S / 2, S * 0.60, S * 0.05, DARK)
    face('surprised', surprised)

    def tongue(i, d):
        f_eyes_happy(d)
        d.chord([S/2 - S*0.12, S*0.50, S/2 + S*0.12, S*0.68], 0, 180, fill=DARK)
        d.chord([S/2 - S*0.055, S*0.585, S/2 + S*0.055, S*0.70], 0, 180, fill=(244, 63, 94, 255))
    face('tongue', tongue)


def heart_points(cx, cy, r):
    """Courbe de coeur parametrique echantillonnee : bords parfaitement lisses."""
    pts = []
    for k in range(140):
        t = 2 * math.pi * k / 140
        x = 16 * math.sin(t) ** 3
        y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        pts.append((cx + x * r / 16, cy - y * r / 16))
    return pts


def gen_hearts():
    img, d = canvas()
    d.polygon(heart_points(S / 2, S / 2 + S * 0.05, S * 0.40), fill=RED)
    circle(d, S * 0.38, S * 0.30, S * 0.045, (255, 255, 255, 130))
    finish(img, 'heart')

    # Casse : meme coeur lisse, coupe en deux avec un decalage.
    tmp = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    td = ImageDraw.Draw(tmp)
    td.polygon(heart_points(S / 2, S / 2 + S * 0.05, S * 0.40), fill=RED)
    img, d = canvas()
    mid = S // 2
    gap = int(S * 0.022)
    left = tmp.crop((0, 0, mid, S))
    right = tmp.crop((mid, 0, S, S))
    img.paste(left, (-gap, int(S * 0.02)), left)
    img.paste(right, (gap, -int(S * 0.02)), right)
    finish(img, 'heart-broken')

    img, d = canvas()
    d.polygon(heart_points(S / 2, S / 2 + S * 0.05, S * 0.36), fill=PINK)
    for x, y, r in ((S * 0.20, S * 0.22, S * 0.035), (S * 0.80, S * 0.28, S * 0.028), (S * 0.78, S * 0.74, S * 0.032)):
        d.polygon([(x, y - r), (x + r * 0.3, y - r * 0.3), (x + r, y), (x + r * 0.3, y + r * 0.3),
                   (x, y + r), (x - r * 0.3, y + r * 0.3), (x - r, y), (x - r * 0.3, y - r * 0.3)], fill=WHITE)
    finish(img, 'heart-sparkle')


def gen_symbols():
    img, d = canvas()
    d.rounded_rectangle([S*0.28, S*0.52, S*0.60, S*0.80], radius=S*0.06, fill=(244, 194, 158, 255))
    d.rounded_rectangle([S*0.34, S*0.16, S*0.52, S*0.56], radius=S*0.08, fill=(244, 194, 158, 255))
    d.rounded_rectangle([S*0.20, S*0.66, S*0.78, S*0.86], radius=S*0.06, fill=BLUE_DARK)
    finish(img, 'thumbs-up')

    img, d = canvas()
    d.polygon([(S*0.5, S*0.10), (S*0.72, S*0.46), (S*0.60, S*0.44), (S*0.68, S*0.80),
               (S*0.5, S*0.62), (S*0.32, S*0.80), (S*0.40, S*0.44), (S*0.28, S*0.46)], fill=ORANGE)
    d.polygon([(S*0.5, S*0.34), (S*0.58, S*0.52), (S*0.5, S*0.68), (S*0.42, S*0.52)], fill=YELLOW)
    finish(img, 'fire')

    img, d = canvas()
    pts = []
    for k in range(10):
        ang = math.pi / 2 + k * math.pi / 5
        r = S * (0.40 if k % 2 == 0 else 0.17)
        pts.append((S / 2 + r * math.cos(ang), S / 2 - r * math.sin(ang)))
    d.polygon(pts, fill=YELLOW)
    finish(img, 'star')

    img, d = canvas()
    f = font(int(S * 0.34))
    text_center(d, '100', S / 2, S / 2, f, RED)
    d.line([S*0.22, S*0.72, S*0.78, S*0.72], fill=RED, width=int(S*0.03))
    d.line([S*0.22, S*0.79, S*0.78, S*0.79], fill=RED, width=int(S*0.03))
    finish(img, 'hundred')

    img, d = canvas()
    circle(d, S / 2, S / 2, S * 0.40, GREEN)
    d.line([S*0.30, S*0.52, S*0.45, S*0.66], fill=WHITE, width=int(S*0.06))
    d.line([S*0.45, S*0.66, S*0.72, S*0.34], fill=WHITE, width=int(S*0.06))
    finish(img, 'check')

    img, d = canvas()
    d.polygon([(S / 2, S * 0.12), (S * 0.88, S * 0.78), (S * 0.12, S * 0.78)], fill=YELLOW)
    d.rounded_rectangle([S*0.46, S*0.36, S*0.54, S*0.58], radius=S*0.04, fill=DARK)
    circle(d, S / 2, S * 0.665, S * 0.035, DARK)
    finish(img, 'warning')

    img, d = canvas()
    def lips(cx, cy, r):
        d.ellipse([cx - r, cy - r * 0.75, cx, cy + r * 0.25], fill=RED)
        d.ellipse([cx, cy - r * 0.75, cx + r, cy + r * 0.25], fill=RED)
        d.polygon([(cx - r, cy - r * 0.2), (cx + r, cy - r * 0.2), (cx, cy + r * 0.95)], fill=RED)
    lips(S / 2, S * 0.48, S * 0.26)
    d.ellipse([S*0.40, S*0.35, S*0.47, S*0.40], fill=(255, 255, 255, 160))
    finish(img, 'kiss')

    img, d = canvas()
    f = font(int(S * 0.30))
    d.text((S * 0.30, S * 0.16), 'Z', font=f, fill=BLUE)
    d.text((S * 0.50, S * 0.38), 'z', font=f, fill=BLUE)
    d.text((S * 0.34, S * 0.56), 'Z', font=f, fill=BLUE_DARK)
    finish(img, 'zzz')

    img, d = canvas()
    for x, y, r in ((S * 0.5, S * 0.5, S * 0.16), (S * 0.26, S * 0.28, S * 0.08), (S * 0.76, S * 0.70, S * 0.09)):
        d.polygon([(x, y - r), (x + r * 0.25, y - r * 0.25), (x + r, y), (x + r * 0.25, y + r * 0.25),
                   (x, y + r), (x - r * 0.25, y + r * 0.25), (x - r, y), (x - r * 0.25, y - r * 0.25)], fill=YELLOW)
    finish(img, 'sparkle')


def gen_animals():
    img, d = canvas()
    d.polygon([(S*0.22, S*0.30), (S*0.30, S*0.10), (S*0.42, S*0.26)], fill=YELLOW_DARK)
    d.polygon([(S*0.78, S*0.30), (S*0.70, S*0.10), (S*0.58, S*0.26)], fill=YELLOW_DARK)
    circle(d, S / 2, S * 0.55, S * 0.34, YELLOW)
    f_eyes_dot(d, y=S * 0.50)
    circle(d, S / 2, S * 0.60, S * 0.035, (244, 63, 94, 255))
    for side in (-1, 1):
        d.line([S/2 + side*S*0.06, S*0.62, S/2 + side*S*0.24, S*0.60], fill=DARK, width=int(S*0.012))
        d.line([S/2 + side*S*0.06, S*0.65, S/2 + side*S*0.24, S*0.68], fill=DARK, width=int(S*0.012))
    finish(img, 'cat')

    img, d = canvas()
    circle(d, S * 0.30, S * 0.26, S * 0.13, BROWN)
    circle(d, S * 0.70, S * 0.26, S * 0.13, BROWN)
    circle(d, S * 0.30, S * 0.26, S * 0.07, BROWN_LIGHT)
    circle(d, S * 0.70, S * 0.26, S * 0.07, BROWN_LIGHT)
    circle(d, S / 2, S * 0.56, S * 0.36, BROWN)
    circle(d, S / 2, S * 0.66, S * 0.16, BROWN_LIGHT)
    f_eyes_dot(d, y=S * 0.50, r=S * 0.03)
    circle(d, S / 2, S * 0.60, S * 0.035, DARK)
    finish(img, 'bear')

    img, d = canvas()
    circle(d, S * 0.30, S * 0.24, S * 0.12, DARK)
    circle(d, S * 0.70, S * 0.24, S * 0.12, DARK)
    circle(d, S / 2, S * 0.56, S * 0.37, WHITE)
    for x in (S * 0.38, S * 0.62):
        d.ellipse([x - S*0.075, S*0.44, x + S*0.075, S*0.58], fill=DARK)
        circle(d, x, S * 0.50, S * 0.032, WHITE)
    circle(d, S / 2, S * 0.64, S * 0.032, DARK)
    finish(img, 'panda')

    img, d = canvas()
    for x in (S * 0.40, S * 0.60):
        d.ellipse([x - S*0.07, S*0.08, x + S*0.07, S*0.42], fill=WHITE)
        d.ellipse([x - S*0.035, S*0.14, x + S*0.035, S*0.36], fill=(251, 168, 190, 255))
    circle(d, S / 2, S * 0.62, S * 0.30, WHITE)
    f_eyes_dot(d, y=S * 0.56, r=S * 0.028)
    d.polygon([(S/2, S*0.63), (S/2 - S*0.035, S*0.68), (S/2 + S*0.035, S*0.68)], fill=(244, 63, 94, 255))
    finish(img, 'bunny')


def gen_objects():
    img, d = canvas()
    d.rectangle([S*0.20, S*0.38, S*0.80, S*0.82], fill=RED)
    d.rectangle([S*0.45, S*0.38, S*0.55, S*0.82], fill=YELLOW)
    d.rectangle([S*0.20, S*0.50, S*0.80, S*0.60], fill=YELLOW)
    d.ellipse([S*0.38, S*0.24, S*0.50, S*0.38], fill=YELLOW)
    d.ellipse([S*0.50, S*0.24, S*0.62, S*0.38], fill=YELLOW)
    circle(d, S / 2, S * 0.335, S * 0.025, RED)
    finish(img, 'gift')

    img, d = canvas()
    d.polygon([(S*0.22, S*0.84), (S*0.50, S*0.22), (S*0.62, S*0.50), (S*0.42, S*0.60)], fill=YELLOW)
    d.polygon([(S*0.22, S*0.84), (S*0.38, S*0.56), (S*0.50, S*0.70)], fill=RED)
    for x, y, c in ((S*0.62, S*0.20, RED), (S*0.78, S*0.34, BLUE), (S*0.70, S*0.52, GREEN),
                    (S*0.84, S*0.62, YELLOW), (S*0.56, S*0.10, PINK)):
        circle(d, x, y, S * 0.028, c)
    finish(img, 'party')

    img, d = canvas()
    circle(d, S / 2, S * 0.30, S * 0.20, RED)
    circle(d, S / 2 - S * 0.07, S * 0.27, S * 0.10, RED_DARK)
    circle(d, S / 2 + S * 0.06, S * 0.33, S * 0.09, RED)
    d.line([S / 2, S * 0.48, S / 2, S * 0.86], fill=(22, 120, 60, 255), width=int(S * 0.03))
    d.polygon([(S/2, S*0.60), (S*0.28, S*0.52), (S*0.34, S*0.66)], fill=GREEN)
    d.polygon([(S/2, S*0.70), (S*0.72, S*0.62), (S*0.66, S*0.76)], fill=GREEN)
    finish(img, 'rose')

    img, d = canvas()
    d.rectangle([S*0.24, S*0.36, S*0.66, S*0.70], fill=WHITE)
    d.ellipse([S*0.24, S*0.30, S*0.66, S*0.42], fill=(120, 74, 48, 255))
    d.arc([S*0.60, S*0.40, S*0.82, S*0.62], -80, 90, fill=WHITE, width=int(S * 0.045))
    d.rectangle([S*0.18, S*0.70, S*0.72, S*0.76], fill=(229, 231, 235, 255))
    for x in (S * 0.34, S * 0.46, S * 0.56):
        d.arc([x - S*0.02, S*0.16, x + S*0.05, S*0.30], 90, 270, fill=GREY, width=int(S * 0.018))
    finish(img, 'coffee')


def main():
    os.makedirs(OUT, exist_ok=True)
    gen_smileys()
    gen_hearts()
    gen_symbols()
    gen_animals()
    gen_objects()
    print('stickers generes dans', os.path.abspath(OUT))


if __name__ == '__main__':
    main()
