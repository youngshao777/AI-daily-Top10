#!/usr/bin/env python3
"""Aggregate curated RSS feeds per category into daily top-N archive files."""

import html
import json
import re
import sys
import time
from calendar import timegm
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import feedparser

ROOT = Path(__file__).resolve().parent.parent
CONFIG_PATH = ROOT / "config" / "categories.json"
DATA_DIR = ROOT / "data"
ARCHIVE_DIR = DATA_DIR / "archive"
LOCAL_TZ = ZoneInfo("Asia/Shanghai")

TAG_RE = re.compile(r"<[^>]+>")


def clean_text(raw, limit=180):
    if not raw:
        return ""
    text = html.unescape(TAG_RE.sub("", raw)).strip()
    text = re.sub(r"\s+", " ", text)
    if len(text) > limit:
        text = text[: limit - 1].rstrip() + "…"
    return text


def entry_timestamp(entry):
    for key in ("published_parsed", "updated_parsed"):
        struct = entry.get(key)
        if struct:
            return timegm(struct)
    return None


def fetch_feed_items(source, url):
    items = []
    try:
        parsed = feedparser.parse(url)
    except Exception as exc:  # noqa: BLE001
        print(f"  ! failed to fetch {source}: {exc}", file=sys.stderr)
        return items

    if parsed.bozo and not parsed.entries:
        print(f"  ! no entries from {source} ({url})", file=sys.stderr)
        return items

    for entry in parsed.entries:
        ts = entry_timestamp(entry)
        if ts is None:
            continue
        link = entry.get("link")
        title = clean_text(entry.get("title"), limit=200)
        if not link or not title:
            continue
        summary = clean_text(entry.get("summary") or entry.get("description"))
        items.append(
            {
                "title": title,
                "link": link,
                "source": source,
                "summary": summary,
                "published": datetime.fromtimestamp(ts, tz=ZoneInfo("UTC"))
                .astimezone(LOCAL_TZ)
                .isoformat(),
                "_ts": ts,
            }
        )
    return items


def normalize_title(title):
    return re.sub(r"[^a-z0-9一-鿿]+", "", title.lower())


def dedupe(items):
    seen_links = set()
    seen_titles = set()
    result = []
    for item in items:
        key_title = normalize_title(item["title"])
        if item["link"] in seen_links or key_title in seen_titles:
            continue
        seen_links.add(item["link"])
        seen_titles.add(key_title)
        result.append(item)
    return result


def select_diverse(items, top_count, max_per_source):
    """Round-robin by recency across sources so no single feed can flood the top N."""
    items = sorted(items, key=lambda x: x["_ts"], reverse=True)
    by_source = {}
    for item in items:
        by_source.setdefault(item["source"], []).append(item)

    selected = []
    counts = {source: 0 for source in by_source}
    while len(selected) < top_count:
        progressed = False
        for source, bucket in by_source.items():
            if len(selected) >= top_count:
                break
            if counts[source] >= max_per_source or not bucket:
                continue
            selected.append(bucket.pop(0))
            counts[source] += 1
            progressed = True
        if not progressed:
            break

    selected.sort(key=lambda x: x["_ts"], reverse=True)
    return selected


def build_category(category):
    print(f"Fetching category '{category['id']}'...")
    all_items = []
    for feed in category["feeds"]:
        feed_items = fetch_feed_items(feed["source"], feed["url"])
        print(f"  - {feed['source']}: {len(feed_items)} items")
        all_items.extend(feed_items)

    deduped = dedupe(all_items)
    top_count = category.get("topCount", 10)
    max_per_source = category.get("maxPerSource", 2)
    top = select_diverse(deduped, top_count, max_per_source)
    for item in top:
        item.pop("_ts", None)
    return top


def load_json(path, default):
    if path.exists():
        return json.loads(path.read_text())
    return default


def save_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")


def main():
    config = json.loads(CONFIG_PATH.read_text())
    today = datetime.now(LOCAL_TZ).strftime("%Y-%m-%d")
    generated_at = datetime.now(LOCAL_TZ).isoformat()

    latest = load_json(DATA_DIR / "latest.json", {})
    archive_index = load_json(ARCHIVE_DIR / "index.json", {})

    for category in config["categories"]:
        if not category.get("enabled"):
            continue

        top_items = build_category(category)
        if not top_items:
            print(f"  ! no items collected for '{category['id']}', skipping write")
            continue

        day_payload = {
            "date": today,
            "category": category["id"],
            "categoryName": category["name"],
            "generatedAt": generated_at,
            "items": top_items,
        }
        save_json(ARCHIVE_DIR / category["id"] / f"{today}.json", day_payload)

        latest[category["id"]] = today

        dates = archive_index.get(category["id"], [])
        if today not in dates:
            dates.insert(0, today)
        dates.sort(reverse=True)
        archive_index[category["id"]] = dates

        print(f"  ✓ wrote {len(top_items)} items for '{category['id']}' ({today})")

    save_json(DATA_DIR / "latest.json", latest)
    save_json(ARCHIVE_DIR / "index.json", archive_index)
    print("Done.")


if __name__ == "__main__":
    main()
