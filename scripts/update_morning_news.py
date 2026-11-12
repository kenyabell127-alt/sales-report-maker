"""Fetch fresh, attributable morning speech topics. Standard library only; no paid API."""
import datetime as dt
import json
import pathlib
import re
import urllib.request
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime

OUTPUT = pathlib.Path("data/morning-news.json")
FEEDS = [
    ("NHK 主要", "https://www3.nhk.or.jp/rss/news/cat0.xml"),
    ("NHK 経済", "https://www3.nhk.or.jp/rss/news/cat5.xml"),
    ("NHK 科学・文化", "https://www3.nhk.or.jp/rss/news/cat3.xml"),
]
BLOCKED = re.compile(r"死亡|殺害|遺体|自殺|性的|虐待|逮捕|戦争|爆発|被害者|暴行|選挙|政党|宗教|容疑|銃撃|事故死|重体|災害|地震|津波")
NOW = dt.datetime.now(dt.timezone.utc)
items = []
for source, url in FEEDS:
    try:
        request = urllib.request.Request(url, headers={"User-Agent": "MorningSpeechMaker/1.0"})
        with urllib.request.urlopen(request, timeout=20) as response:
            root = ET.fromstring(response.read())
        for entry in root.findall(".//item")[:30]:
            title = re.sub(r"\s+", " ", entry.findtext("title") or "").strip()
            link = (entry.findtext("link") or "").strip()
            raw_date = (entry.findtext("pubDate") or "").strip()
            try:
                published = parsedate_to_datetime(raw_date).astimezone(dt.timezone.utc)
            except (TypeError, ValueError, IndexError):
                continue
            age = (NOW - published).total_seconds()
            if not (0 <= age <= 72 * 3600):
                continue
            if not (10 <= len(title) <= 145 and link.startswith("https://")) or BLOCKED.search(title):
                continue
            items.append({"title": title, "url": link, "source": source, "published": published.isoformat()})
    except Exception as error:
        print(f"Feed failed: {source}: {type(error).__name__}: {error}")
seen = set()
unique = []
for item in sorted(items, key=lambda row: row["published"], reverse=True):
    if item["title"] not in seen:
        seen.add(item["title"])
        unique.append(item)
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
# Empty results should not silently preserve stale headlines as fresh news.
OUTPUT.write_text(json.dumps({"updated_at": NOW.isoformat(), "generation": "free-headline", "items": unique[:30]}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"Saved {len(unique[:30])} fresh topics; no paid AI used")
