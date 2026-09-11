"""Probe 3: dm_img risk params + full browser fingerprint headers vs -352."""
import hashlib
import json
import random
import time
from functools import reduce

import httpx

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")
BASE_HEADERS = {
    "User-Agent": UA,
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Origin": "https://space.bilibili.com",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-site",
    "Sec-Ch-Ua": '"Chromium";v="126", "Not:A-Brand";v="24"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"macOS"',
}
MIXIN_TAB = [46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
             33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61,
             26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36,
             20, 34, 44, 52]


def mixin(img_sub):
    return reduce(lambda s, i: s + img_sub[i], MIXIN_TAB, "")[:32]


def main():
    c = httpx.Client(timeout=15, headers=BASE_HEADERS, http2=True, follow_redirects=True)
    r = c.get("https://api.bilibili.com/x/frontend/finger/spi")
    d = r.json()["data"]
    c.cookies.set("buvid3", d["b_3"], domain=".bilibili.com")
    c.cookies.set("buvid4", d["b_4"], domain=".bilibili.com")
    c.cookies.set("b_nut", str(int(time.time())), domain=".bilibili.com")
    print("http_version:", r.http_version, "| buvid3:", d["b_3"][:20])

    r = c.get("https://api.bilibili.com/x/web-interface/nav")
    wbi = r.json()["data"]["wbi_img"]
    mk = mixin(wbi["img_url"].split("/")[-1].split(".")[0] + wbi["sub_url"].split("/")[-1].split(".")[0])

    def sign(params, extra=None):
        p = dict(params)
        p["wts"] = int(time.time())
        if extra:
            p.update(extra)
        p = dict(sorted(p.items()))
        q = "&".join(f"{k}={v}" for k, v in p.items())
        p["w_rid"] = hashlib.md5((q + mk).encode()).hexdigest()
        return p

    # --- acc/info with dm_img params baked into wbi signature ---
    dm = {
        "dm_img_list": "[]",
        "dm_img_str": "base64" + "".join(random.choices("abcdefghij", k=4)),
        "dm_cover_img_str": "base64" + "".join(random.choices("abcdefghij", k=8)),
        "dm_img_inter": '{"ds":[],"wh":[3057,1555,1161],"of":[340,568,340]}',
    }
    p = sign({"mid": 34503997, "token": "", "platform": "web", "web_location": "1550101"}, dm)
    r = c.get("https://api.bilibili.com/x/space/wbi/acc/info", params=p,
              headers={**BASE_HEADERS, "Referer": "https://space.bilibili.com/34503997/"})
    j = r.json()
    print(f"\n=== acc/info wbi+dm -> code={j.get('code')} msg={j.get('message')}")
    dd = j.get("data") or {}
    if isinstance(dd, dict) and j.get("code") == 0:
        print("   name:", dd.get("name"), "level:", dd.get("level"), "birthday:", dd.get("birthday"))

    # --- followers with dm params ---
    p = sign({"vmid": "34503997", "pn": "1", "ps": "50", "order": "desc"}, dm)
    r = c.get("https://api.bilibili.com/x/relation/followers", params=p,
              headers={**BASE_HEADERS, "Referer": "https://space.bilibili.com/34503997/"})
    j = r.json()
    lst = (j.get("data") or {}).get("list") if isinstance(j.get("data"), dict) else None
    print(f"\n=== followers wbi+dm -> code={j.get('code')} msg={j.get('message')} list={len(lst) if lst else 0}")
    if lst:
        print("   first:", lst[0]["uname"], lst[0]["mid"])

    # --- followers: try WITHOUT wbi but with cookies (web frontend now signs? maybe plain works w/ cookie) ---
    r = c.get("https://api.bilibili.com/x/relation/followers",
              params={"vmid": "34503997", "pn": "1", "ps": "50", "order": "desc"},
              headers={**BASE_HEADERS, "Referer": "https://space.bilibili.com/34503997/"})
    j = r.json()
    print(f"\n=== followers cookie-only -> code={j.get('code')} msg={j.get('message')}")

    # --- card: full response ---
    r = c.get("https://api.bilibili.com/x/web-interface/card",
              params={"mid": 34503997, "photo": "true"},
              headers={**BASE_HEADERS, "Referer": "https://space.bilibili.com/34503997/"})
    j = r.json()
    print(f"\n=== card -> code={j.get('code')}")
    print(json.dumps(j.get("data"), ensure_ascii=False)[:800])

    # --- arc/search with dm params ---
    p = sign({"vmid": 34503997, "pn": 1, "ps": 30, "order": "pubdate"}, dm)
    r = c.get("https://api.bilibili.com/x/space/wbi/arc/search", params=p,
              headers={**BASE_HEADERS, "Referer": "https://space.bilibili.com/34503997/"})
    try:
        j = r.json()
        vlist = ((j.get("data") or {}).get("list") or {}).get("vlist") or []
        print(f"\n=== arc/search wbi+dm -> code={j.get('code')} msg={j.get('message')} n={len(vlist)}")
        if vlist:
            print("   first:", vlist[0].get("title", "")[:40], "| tname:", vlist[0].get("tname"))
    except Exception:
        print(f"\n=== arc/search wbi+dm -> HTTP {r.status_code} {r.text[:120]}")


if __name__ == "__main__":
    main()
