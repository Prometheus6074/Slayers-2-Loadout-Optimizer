"""Download every icon listed in data.js (items, stats) and tree.js (Skill Tree nodes) into ./icons/<id>.png.

Run from anywhere:  python tools/download_icons.py
Uses only the Python standard library. Safe to rerun: icons you already have are skipped.

How it works
  1. Asks the Roblox thumbnail API for each icon (fast, batched).
  2. Anything that fails there (weapons / katanas / fist guards are often raw Image or
     Decal assets that the thumbnail API refuses) is fetched straight from Roblox's
     asset-delivery API instead.
"""
import json, os, re, sys, time, urllib.request, urllib.parse, urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_JS = os.path.join(ROOT, "data.js")
TREE_JS = os.path.join(ROOT, "tree.js")
ICON_DIR = os.path.join(ROOT, "icons")

THUMB_API = "https://thumbnails.roblox.com/v1/assets"
DELIVERY_API = "https://assetdelivery.roblox.com/v2/assetId/"
LEGACY_DELIVERY = "https://assetdelivery.roblox.com/v1/asset/?id="
BATCH = 50
HEADERS = {"User-Agent": "Mozilla/5.0 (icon downloader)"}


def get(url, binary=False, tries=5):
    """GET with retries. Honors 429 Retry-After. Returns None on 404/403/400."""
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=30) as r:
                data = r.read()
                return data if binary else json.loads(data)
        except urllib.error.HTTPError as e:
            if e.code in (400, 403, 404):
                return None
            if attempt == tries - 1:
                return None
            wait = 2 * (attempt + 1)
            if e.code == 429:
                try:
                    wait = max(wait, int(e.headers.get("Retry-After", "5")))
                except ValueError:
                    wait = 10
            time.sleep(wait)
        except Exception:
            if attempt == tries - 1:
                return None
            time.sleep(2 * (attempt + 1))
    return None


def is_image(b):
    return bool(b) and (b[:8] == b"\x89PNG\r\n\x1a\n" or b[:3] == b"\xff\xd8\xff"
                        or (b[:4] == b"RIFF" and b[8:12] == b"WEBP") or b[:6] in (b"GIF87a", b"GIF89a"))


def save(i, data):
    with open(os.path.join(ICON_DIR, f"{i}.png"), "wb") as out:
        out.write(data)


def fetch_asset(asset_id, depth=0):
    """Fetch an asset through asset-delivery. Follows Decal -> Texture one level."""
    if depth > 2:
        return None
    blob = None
    meta = get(DELIVERY_API + str(asset_id))
    if meta and meta.get("locations"):
        loc = meta["locations"][0].get("location")
        if loc:
            blob = get(loc, binary=True)
    if blob is None:  # older endpoint (redirects to the CDN)
        blob = get(LEGACY_DELIVERY + str(asset_id), binary=True)
    if blob is None:
        return None
    if is_image(blob):
        return blob
    # Decal / Texture XML: the real picture is referenced by another asset id
    m = re.search(rb"<url>[^<]*?(?:id=|rbxassetid://)(\d+)", blob) or re.search(rb"(?:id=|rbxassetid://)(\d+)", blob)
    if m and m.group(1).decode() != str(asset_id):
        return fetch_asset(m.group(1).decode(), depth + 1)
    return None


def thumbnails(todo, failed):
    for s in range(0, len(todo), BATCH):
        pending = todo[s:s + BATCH]
        for _ in range(5):  # Roblox may answer "Pending" while it renders a picture
            q = urllib.parse.urlencode({"assetIds": ",".join(pending), "size": "150x150",
                                        "format": "Png", "returnPolicy": "PlaceHolder"})
            res = get(f"{THUMB_API}?{q}")
            if res is None:
                break
            nxt = []
            for d in res.get("data", []):
                i = str(d["targetId"])
                if d.get("state") == "Completed" and d.get("imageUrl"):
                    img = get(d["imageUrl"], binary=True)
                    if img:
                        save(i, img)
                    else:
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
        print(f"  thumbnails {min(s + BATCH, len(todo))}/{len(todo)}")
        time.sleep(1)


def load_const(path, name):
    """Read the JSON after `const <name>=` in a data file. Returns None if the file is missing."""
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8") as f:
        text = f.read()
    return json.loads(text.split(f"const {name}=", 1)[1].rstrip().rstrip(";"))


def main():
    data = load_const(DATA_JS, "DATA")
    tree = load_const(TREE_JS, "TREE") or {"b": []}
    ids = sorted({str(i["ic"]) for i in data["items"] if i.get("ic")}
                 | {str(v) for v in data.get("si", {}).values()}
                 | {str(b["ic"]) for b in tree["b"] if b.get("ic")})
    os.makedirs(ICON_DIR, exist_ok=True)
    todo = [i for i in ids if not os.path.exists(os.path.join(ICON_DIR, f"{i}.png"))]
    print(f"{len(ids)} icons in data.js + tree.js, {len(todo)} to download")
    if not todo:
        print("Nothing to do.")
        return 0

    failed = []
    thumbnails(todo, failed)

    # Fallback: pull the asset itself for anything the thumbnail API couldn't give us
    retry = sorted(set(failed))
    still = []
    if retry:
        print(f"{len(retry)} icons failed via thumbnails, trying asset delivery...")
        for n, i in enumerate(retry, 1):
            img = fetch_asset(i)
            if img:
                save(i, img)
            else:
                still.append(i)
            if n % 10 == 0 or n == len(retry):
                print(f"  asset delivery {n}/{len(retry)}")
            time.sleep(0.3)

    if still:
        print("Could not get these icon ids (rerun later, or check them on roblox.com/library/<id>):")
        print(" ", ", ".join(still))
    print("Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
