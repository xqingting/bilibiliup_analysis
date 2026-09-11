"""Probe 4: like/video / coin / bangumi availability with anonymous buvid, using a public user."""
import hashlib
import json
import time
from functools import reduce

import httpx

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")
MIXIN_TAB = [46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
             33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61,
             26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36,
             20, 34, 44, 52]

c = httpx.Client(timeout=15, headers={"User-Agent": UA, "Referer": "https://www.bilibili.com/"},
                 follow_redirects=True)
r = c.get("https://api.bilibili.com/x/frontend/finger/spi")
d = r.json()["data"]
c.cookies.set("buvid3", d["b_3"], domain=".bilibili.com")
c.cookies.set("buvid4", d["b_4"], domain=".bilibili.com")

r = c.get("https://api.bilibili.com/x/web-interface/nav")
wbi = r.json()["data"]["wbi_img"]
mk = reduce(lambda s, i: s + (wbi["img_url"].split("/")[-1].split(".")[0]
                             + wbi["sub_url"].split("/")[-1].split(".")[0])[i], MIXIN_TAB, "")[:32]


def sign(params):
    p = dict(params)
    p["wts"] = int(time.time())
    p = dict(sorted(p.items()))
    q = "&".join(f"{k}={v}" for k, v in p.items())
    p["w_rid"] = hashlib.md5((q + mk).encode()).hexdigest()
    return p


# find a random popular uploader
r = c.get("https://api.bilibili.com/x/web-interface/popular?pn=1&ps=5")
owners = [(v["owner"]["mid"], v["owner"]["name"]) for v in r.json()["data"]["list"][:4]]
print("popular owners:", owners)
mid, name = owners[0]
print("testing with:", mid, name)

# 1. like/video anonymous
r = c.get(f"https://api.bilibili.com/x/space/like/video?vmid={mid}")
j = r.json()
n = len(((j.get("data") or {}).get("list") or []))
print(f"\nlike/video anon -> code={j.get('code')} msg={j.get('message')} n={n}")

# 2. coin/video anonymous
r = c.get(f"https://api.bilibili.com/x/space/coin/video?vmid={mid}&pn=1&ps=10")
j = r.json()
print(f"coin/video anon -> code={j.get('code')} msg={j.get('message')}")

# 3. bangumi anonymous (new + old)
r = c.get(f"https://api.bilibili.com/x/space/bangumi?vmid={mid}&pn=1&ps=15&type=1&follow_status=0&jsonp=jsonp")
j = r.json()
print(f"space/bangumi anon -> code={j.get('code')} msg={j.get('message')}")
r = c.get(f"https://space.bilibili.com/ajax/Bangumi/getList?mid={mid}")
print(f"ajax/Bangumi/getList anon -> HTTP {r.status_code} {r.text[:120]}")

# 4. relation/stat for a batch (anonymous, for monitor fallback)
r = c.get(f"https://api.bilibili.com/x/relation/stat?vmid={mid}")
print("relation/stat ->", r.json()["data"])

# 5. followers pagination limit probe needs cookie; check guard topList page_size=50 sanity
r = c.get("https://api.live.bilibili.com/xlive/app-room/v2/guardTab/topList?roomid=21452505&ruid=0&page_size=50&page=1")
j = r.json()
print(f"\nguardTab page_size=50 ruid=0 -> code={j.get('code')} num={(j.get('data') or {}).get('info', {}).get('num')}")
if j.get("code") == 0:
    e = ((j.get("data") or {}).get("list") or [None])[0]
    if e:
        print("guard entry fields:", sorted(e.keys()))
        print("medal_info:", json.dumps(e.get("medal_info"), ensure_ascii=False)[:200])
        print("guard_level:", e.get("guard_level"), "| username:", e.get("username"))
