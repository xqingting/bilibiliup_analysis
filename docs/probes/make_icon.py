"""Generate app icon (bilibili-TV style glyph) as pure-python PNG, no deps."""
import struct
import zlib

S = 1024


def rounded_rect(px, x0, y0, x1, y1, r, color):
    """Fill rounded rect into px[y][x] RGBA rows."""
    for y in range(y0, y1):
        for x in range(x0, x1):
            # corner test
            dx = dy = 0
            if x < x0 + r and y < y0 + r:
                dx, dy = x0 + r - x, y0 + r - y
            elif x >= x1 - r and y < y0 + r:
                dx, dy = x - (x1 - r - 1), y0 + r - y
            elif x < x0 + r and y >= y1 - r:
                dx, dy = x0 + r - x, y - (y1 - r - 1)
            elif x >= x1 - r and y >= y1 - r:
                dx, dy = x - (x1 - r - 1), y - (y1 - r - 1)
            else:
                px[y][x] = color
                continue
            if dx * dx + dy * dy <= r * r:
                px[y][x] = color


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(4))


px = [[(0, 0, 0, 0)] * S for _ in range(S)]

# background: vertical gradient deep-blue -> indigo, rounded 180
c_top = (34, 48, 84, 255)
c_bot = (64, 88, 160, 255)
rounded_rect_mask = [[False] * S for _ in range(S)]
r = 180
m = 40
for y in range(m, S - m):
    t = (y - m) / (S - 2 * m)
    col = lerp(c_top, c_bot, t)
    for x in range(m, S - m):
        dx = dy = 0
        if x < m + r and y < m + r:
            dx, dy = m + r - x, m + r - y
        elif x >= S - m - r and y < m + r:
            dx, dy = x - (S - m - r - 1), m + r - y
        elif x < m + r and y >= S - m - r:
            dx, dy = m + r - x, y - (S - m - r - 1)
        elif x >= S - m - r and y >= S - m - r:
            dx, dy = x - (S - m - r - 1), y - (S - m - r - 1)
        if dx == dy == 0 or dx * dx + dy * dy <= r * r:
            px[y][x] = col

# antennae (two lines, rounded caps)
def disk(cx, cy, rad, color):
    for y in range(max(0, cy - rad), min(S, cy + rad + 1)):
        for x in range(max(0, cx - rad), min(S, cx + rad + 1)):
            if (x - cx) ** 2 + (y - cy) ** 2 <= rad * rad:
                px[y][x] = color


def line(x0, y0, x1, y1, w, color):
    steps = max(abs(x1 - x0), abs(y1 - y0)) * 2
    for i in range(steps + 1):
        t = i / steps
        disk(int(x0 + (x1 - x0) * t), int(y0 + (y1 - y0) * t), w, color)


white = (240, 246, 255, 255)
pink = (251, 114, 153, 255)
line(300, 330, 380, 210, 26, white)
line(724, 330, 644, 210, 26, white)

# TV body: white rounded rect
rounded_rect(px, 170, 300, 854, 800, 110, white)

# screen cutout: gradient pink rounded rect inside
screen_c = (251, 114, 153, 255)
screen_c2 = (162, 106, 250, 255)
x0, y0, x1, y1, rr = 240, 370, 784, 730, 70
for y in range(y0, y1):
    t = (y - y0) / (y1 - y0)
    col = lerp(screen_c, screen_c2, t)
    for x in range(x0, x1):
        dx = dy = 0
        if x < x0 + rr and y < y0 + rr:
            dx, dy = x0 + rr - x, y0 + rr - y
        elif x >= x1 - rr and y < y0 + rr:
            dx, dy = x - (x1 - rr - 1), y0 + rr - y
        elif x < x0 + rr and y >= y1 - rr:
            dx, dy = x0 + rr - x, y - (y1 - rr - 1)
        elif x >= x1 - rr and y >= y1 - rr:
            dx, dy = x - (x1 - rr - 1), y - (y1 - rr - 1)
        if dx == dy == 0 or dx * dx + dy * dy <= rr * rr:
            px[y][x] = col

# eyes: two white rounded bars
rounded_rect(px, 340, 510, 440, 600, 40, white)
rounded_rect(px, 584, 510, 684, 600, 40, white)

raw = b""
for y in range(S):
    raw += b"\x00" + b"".join(struct.pack("4B", *px[y][x]) for x in range(S))


def chunk(tag, data):
    c = struct.pack(">I", len(data)) + tag + data
    return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)


png = (b"\x89PNG\r\n\x1a\n"
       + chunk(b"IHDR", struct.pack(">IIBBBBB", S, S, 8, 6, 0, 0, 0))
       + chunk(b"IDAT", zlib.compress(raw, 9))
       + chunk(b"IEND", b""))
with open("app/src-tauri/icons/icon-source.png", "wb") as f:
    f.write(png)
print("icon written:", len(png), "bytes")
