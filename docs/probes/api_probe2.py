"""Probe 2: anonymous visitor-cookie (buvid) flow vs -352 risk control."""
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


def mixin(img_sub):
    return reduce(lambda s, i: s + img_sub[i], MIXIN_TAB, "")[:32]


def show(title, r):
    try:
        j = r.json()
        b = json.dumps(j, ensure_ascii=False)[:260]
    except Exception:
        b = r.text[:260]
    print(f"\n=== {title} -> HTTP {r.status_code}\n{b}")


def main():
    c = httpx.Client(timeout=15, headers={"User-Agent": UA, "Referer": "https://www.bilibili.com/",
                                          "Origin": "https://www.bilibili.com"}, follow_redirects=True)

    # 1. anonymous buvid
    r = c.get("https://api.bilibili.com/x/frontend/finger/spi")
    show("finger/spi", r)
    b3 = r.json()["data"]["b_3"]
    b4 = r.json()["data"]["b_4"]
    c.cookies.set("buvid3", b3, domain=".bilibili.com")
    c.cookies.set("buvid4", b4, domain=".bilibili.com")
    c.cookies.set("b_nut", str(int(time.time())), domain=".bilibili.com")

    # 2. nav with cookies -> wbi keys
    r = c.get("https://api.bilibili.com/x/web-interface/nav")
    wbi = r.json()["data"]["wbi_img"]
    raw = (wbi["img_url"].split("/")[-1].split(".")[0] + wbi["sub_url"].split("/")[-1].split(".")[0])
    mk = mixin(raw)
    print("mixin_key:", mk[:12], "...")

    def sign(params):
        p = dict(params)
        p["wts"] = int(time.time())
        p = dict(sorted(p.items()))
        q = "&".join(f"{k}={v}" for k, v in p.items())
        p["w_rid"] = hashlib.md5((q + mk).encode()).hexdigest()
        return p

    def sp_headers(mid=None):
        h = {"User-Agent": UA, "Referer": "https://space.bilibili.com/"}
        return h

    # 3. acc/info with cookies + wbi
    p = sign({"mid": 34503997, "token": "", "platform": "web", "web_location": "1550101"})
    r = c.get("https://api.bilibili.com/x/space/wbi/acc/info", params=p, headers=sp_headers())
    j = r.json()
    d = j.get("data") or {}
    show("acc/info wbi+buvid", r)
    if isinstance(d, dict):
        print("   name:", d.get("name"), "| level:", d.get("level"), "| sign:", (d.get("sign") or "")[:20])

    # 4. relation/followers with cookies + wbi
    p = sign({"vmid": "34503997", "pn": "1", "ps": "20", "order": "desc"})
    r = c.get("https://api.bilibili.com/x/relation/followers", params=p, headers=sp_headers())
    j = r.json()
    lst = (j.get("data") or {}).get("list") if isinstance(j.get("data"), dict) else None
    show("followers wbi+buvid", r)
    if lst is not None:
        print("   list_len:", len(lst), "| first:", lst[0]["uname"] if lst else "-")

    # 5. arc/search with cookies + wbi
    p = sign({"vmid": 34503997, "pn": 1, "ps": 30, "order": "pubdate"})
    r = c.get("https://api.bilibili.com/x/space/wbi/arc/search", params=p, headers=sp_headers())
    try:
        j = r.json()
        vlist = ((j.get("data") or {}).get("list") or {}).get("vlist") or []
        print(f"\n=== arc/search wbi+buvid -> HTTP {r.status_code}\ncode={j.get('code')} msg={j.get('message')} n={len(vlist)}")
        if vlist:
            print("   first:", vlist[0].get("title", "")[:30], "| tname:", vlist[0].get("tname"))
    except Exception:
        print(f"\n=== arc/search wbi+buvid -> HTTP {r.status_code}\n{r.text[:200]}")

    # 6. guardTab on a room with guards (永雏塔菲 room 21452505)
    r = c.get("https://api.live.bilibili.com/room/v1/Room/get_info?room_id=21452505")
    ri = r.json()["data"]
    roomid, ruid = ri["room_id"], ri["uid"]
    r = c.get(f"https://api.live.bilibili.com/xlive/app-room/v2/guardTab/topList?roomid={roomid}&ruid={ruid}&page_size=29&page=1")
    j = r.json()
    info = (j.get("data") or {}).get("info") or {}
    print(f"\n=== guardTab/topList taffy -> code={j.get('code')} num={info.get('num')} page={info.get('page')} "
          f"top3={len((j.get('data') or {}).get('top3') or [])} list={len((j.get('data') or {}).get('list') or [])}")

    # 7. gaia ExClimbWuzhi activation (extra step, improves trust)
    payload = {
        "payload": json.dumps({
            "39c8": "333.999|0.0.0|" + b3,
            "3c43": {"ac": "13", "aci": "mac", "b_id": "", "bl": "zh-CN", "c": "mac", "ch": ["00110"], "f": "mac",
                     "f_c": "", "fc": "", "fp": "2020##" + b3, "fts": "1600000000", "ic": "8", "ipv": "6",
                     "je": "0", "js": "0", "lb": "13", "md": "MacBookPro18,3", "npc": "8", "os": "macOS",
                     "osv": "14.5", "ov": "0", "pc": "2", "pl": "macOS", "pu": "0", "rn": "1512", "s_1": "",
                     "s_2": "", "s_3": "", "sc": "-1", "scf": "unknown", "sd": "1512x982", "sid": "0",
                     "t": int(time.time()), "tp": "@eyJ0IjoiIiwiYyI6IiJ9@", "ts": "S", "ui": "", "uip": "",
                     "ver": "1.128.4.4", "vid": "", "wh": "0"},
            "544a": {"c": [b3, "0", "0", int(time.time())], "d": [b4, "0", "0", int(time.time())]},
            "7cf9": ["Mac OS", "Chrome", "126.0.0.0", "Google Chrome 126", "126", "", "Google Inc.", "", "", "en-US", "", "24", "8|7.1|0.1", "1512x982", "0", "0", "", "0"],
        }, separators=(",", ":")),
    }
    r = c.post("https://api.bilibili.com/x/internal/gaia/gateway/ExClimbWuzhi", json=payload,
               headers={"User-Agent": UA, "Content-Type": "application/json"})
    show("ExClimbWuzhi activate", r)

    # retry followers after activation
    p = sign({"vmid": "34503997", "pn": "1", "ps": "20", "order": "desc"})
    r = c.get("https://api.bilibili.com/x/relation/followers", params=p, headers=sp_headers())
    j = r.json()
    lst = (j.get("data") or {}).get("list") if isinstance(j.get("data"), dict) else None
    print(f"\n=== followers RETRY -> code={j.get('code')} msg={j.get('message')} list={len(lst) if lst else 0}")


if __name__ == "__main__":
    main()
