"""Download every item icon listed in data.js into ./icons/<id>.png.

Run from the repo root:  python tools/download_icons.py
Uses only the Python standard library. Safe to rerun: icons you already have are skipped.
"""
import json, os, re, sys, time, urllib.request, urllib.parse

API = "https://thumbnails.roblox.com/v1/assets"
BATCH = 50
HEADERS = {"User-Agent": "Mozilla/5.0 (icon downloader)"}


def get(url, binary=False):
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=30) as r:
                data = r.read()
                return data if binary else json.loads(data)
        except Exception as e:
            if attempt == 3:
                raise
            time.sleep(2 * (attempt + 1))


def main():
    with open("data.js", encoding="utf-8") as f:
        text = f.read()
    data = json.loads(text.split("const DATA=", 1)[1].rstrip().rstrip(";"))
    ids = sorted({i["ic"] for i in data["items"] if i.get("ic")} | set(data.get("si", {}).values()))
    if False:
        pass
    os.makedirs("icons", exist_ok=True)
    todo = [i for i in ids if not os.path.exists(f"icons/{i}.png")]
    print(f"{len(ids)} icons in data.js, {len(todo)} to download")
    failed = []
    for s in range(0, len(todo), BATCH):
        chunk = todo[s:s + BATCH]
        pending = chunk
        for _ in range(5):  # Roblox may answer "Pending" while it renders a picture
            q = urllib.parse.urlencode({"assetIds": ",".join(pending), "size": "150x150",
                                        "format": "Png", "returnPolicy": "PlaceHolder"})
            res = get(f"{API}?{q}")
            nxt = []
            for d in res.get("data", []):
                i = str(d["targetId"])
                if d.get("state") == "Completed" and d.get("imageUrl"):
                    try:
                        with open(f"icons/{i}.png", "wb") as out:
                            out.write(get(d["imageUrl"], binary=True))
                    except Exception:
                        failed.append(i)
                elif d.get("state") == "Pending":
                    nxt.append(i)
                else:
                    failed.append(i)
            pending = nxt
            if not pending:
                break
            time.sleep(3)
        failed += pending
        print(f"  {min(s + BATCH, len(todo))}/{len(todo)}")
        time.sleep(1)
    if failed:
        print("Could not get these icon ids (the site just shows no picture for them):")
        print(" ", ", ".join(sorted(set(failed))))
    print("Done.")


if __name__ == "__main__":
    sys.exit(main())
