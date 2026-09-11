"""Probe legacy bilibili endpoints used by the old scripts, one by one."""
import hashlib
import json
import time
from functools import reduce

import httpx

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")
HEADERS = {
    "User-Agent": UA,
    "Referer": "https://www.bilibili.com/",
    "Origin": "https://www.bilibili.com",
}

MIXIN_TAB = [46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
             33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61,
             26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36,
             20, 34, 44, 52]


def get_mixin_key(img_sub: str) -> str:
    return reduce(lambda s, i: s + img_sub[i], MIXIN_TAB, "")[:32]


def wbi_sign(params: dict, client: httpx.Client) -> dict:
    r = client.get("https://api.bilibili.com/x/web-interface/nav", headers=HEADERS)
    wbi_img = r.json()["data"]["wbi_img"]
    raw = (wbi_img["img_url"].split("/")[-1].split(".")[0]
           + wbi_img["sub_url"].split("/")[-1].split(".")[0])
    mixin = get_mixin_key(raw)
    params = dict(params)
    params["wts"] = int(time.time())
    params = dict(sorted(params.items()))
    q = "&".join(f"{k}={v}" for k, v in params.items())
    params["w_rid"] = hashlib.md5((q + mixin).encode()).hexdigest()
    return params


def show(title: str, code: int, payload):
    brief = json.dumps(payload, ensure_ascii=False)[:300]
    print(f"\n=== {title} -> HTTP {code}\n{brief}")


def main():
    c = httpx.Client(timeout=15, headers=HEADERS, follow_redirects=True)

    # 0. find a real live room (room 6 => official room, get ruid)
    r = c.get("https://api.live.bilibili.com/room/v1/Room/get_info?room_id=6")
    room = r.json()
    roomid = room["data"]["room_id"]
    ruid = room["data"]["uid"]
    show("Room/get_info roomid=6", r.status_code, {"room_id": roomid, "uid": ruid, "live_status": room["data"].get("live_status")})

    # 1. guardTab/topList (航海榜) — legacy script endpoint
    r = c.get(f"https://api.live.bilibili.com/xlive/app-room/v2/guardTab/topList?roomid={roomid}&ruid={ruid}&page_size=29&page=1")
    try:
        j = r.json()
        show("guardTab/topList (legacy)", r.status_code, {"code": j.get("code"), "message": j.get("message"),
              "top3": len(j.get("data", {}).get("top3", [])) if j.get("data") else None,
              "list_len": len(j.get("data", {}).get("list", [])) if j.get("data") else None})
    except Exception as e:
        show("guardTab/topList (legacy)", r.status_code, f"parse-error {e} {r.text[:150]}")

    # 1b. new guard list endpoint (datalive)
    r = c.post("https://api.live.bilibili.com/xlive/fuxi-interface/GuardActivityController/getInfo",
               data={"roomid": roomid})
    show("GuardActivity/getInfo (new)", r.status_code, {"body": r.text[:200]})

    # 2. x/relation/followers WITHOUT wbi (legacy monitor script)
    r = c.get("https://api.bilibili.com/x/relation/followers?vmid=34503997&pn=1&ps=20&order=desc&jsonp=jsonp",
              headers={**HEADERS, "Referer": "https://space.bilibili.com/34503997"})
    show("relation/followers NO-wbi (legacy)", r.status_code, {"body": r.text[:200]})

    # 2b. with wbi
    p = wbi_sign({"vmid": "34503997", "pn": "1", "ps": "20", "order": "desc"}, c)
    r = c.get("https://api.bilibili.com/x/relation/followers", params=p,
              headers={**HEADERS, "Referer": "https://space.bilibili.com/34503997"})
    j = r.json()
    n = len(j.get("data", {}).get("list", []) or [])
    show("relation/followers wbi", r.status_code, {"code": j.get("code"), "message": j.get("message"), "list_len": n})

    # 3. x/space/wbi/acc/info with wbi (legacy uid scraper)
    p = wbi_sign({"mid": 34503997, "token": "", "platform": "web", "web_location": "1550101"}, c)
    r = c.get("https://api.bilibili.com/x/space/wbi/acc/info", params=p,
              headers={**HEADERS, "Referer": "https://space.bilibili.com/34503997"})
    j = r.json()
    show("space/wbi/acc/info wbi", r.status_code, {"code": j.get("code"), "message": j.get("message"),
          "name": (j.get("data") or {}).get("name") if isinstance(j.get("data"), dict) else None})

    # 3b. x/web-interface/card (legacy side call)
    r = c.get("https://api.bilibili.com/x/web-interface/card", params={"mid": 34503997, "photo": "false"},
              headers={**HEADERS, "Referer": "https://space.bilibili.com/34503997"})
    j = r.json()
    show("web-interface/card", r.status_code, {"code": j.get("code"), "message": j.get("message")})

    # 3c. acc/relation/stat (follower count replacement)
    r = c.get("https://api.bilibili.com/x/relation/stat", params={"vmid": 34503997},
              headers={**HEADERS, "Referer": "https://space.bilibili.com/34503997"})
    show("relation/stat", r.status_code, r.json())

    # 3d. acc-info legacy no-wbi variant: x/space/acc/info
    r = c.get("https://api.bilibili.com/x/space/acc/info?mid=34503997",
              headers={**HEADERS, "Referer": "https://space.bilibili.com/34503997"})
    show("space/acc/info NO-wbi", r.status_code, {"body": r.text[:200]})

    # 4. x/space/like/video (词频) — legacy, no wbi
    r = c.get("https://api.bilibili.com/x/space/like/video?vmid=34503997",
              headers={**HEADERS, "Referer": "https://space.bilibili.com/34503997"})
    show("space/like/video NO-wbi (legacy)", r.status_code, {"body": r.text[:200]})

    # 4b. wbi variant
    p = wbi_sign({"vmid": 34503997, "pn": 1, "ps": 30, "order": "pubdate"}, c)
    r = c.get("https://api.bilibili.com/x/space/wbi/arc/search", params=p,
              headers={**HEADERS, "Referer": "https://space.bilibili.com/34503997"})
    j = r.json()
    vlist = ((j.get("data") or {}).get("list") or {}).get("vlist") or []
    show("space/wbi/arc/search wbi", r.status_code, {"code": j.get("code"), "message": j.get("message"), "n": len(vlist)})

    # 4c. new like-video endpoint
    p = wbi_sign({"mid": 34503997, "ps": 30, "pn": 1}, c)
    r = c.get("https://api.bilibili.com/x/series/recArchivesByKeywords", params=p)
    show("series/recArchives (probe)", r.status_code, {"body": r.text[:120]})


if __name__ == "__main__":
    main()
