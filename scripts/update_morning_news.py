"""Fetch fresh, attributable morning speech topics. Standard library only; no paid API."""
import datetime as dt
import html
from html.parser import HTMLParser
import json
import pathlib
import re
import urllib.request
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime

class TextOnly(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []
    def handle_data(self, data):
        self.parts.append(data)

def clean_summary(raw, title):
    parser = TextOnly()
    parser.feed(html.unescape(raw or ""))
    value = re.sub(r"\\s+", " ", html.unescape(" ".join(parser.parts))).strip()
    value = re.sub(r"https?://\\S+", "", value).strip()
    # Google News RSS often repeats headlines and embeds a list of linked articles.
    if len(value) < 45 or value == title or title in value[:len(title)+15] or "Google ニュース" in value:
        return ""
    if len(value) > 450:
        value = value[:450].rsplit("。", 1)[0] or value[:300]
    return value[:450]

OUTPUT = pathlib.Path("data/morning-news.json")
FEEDS = [
    ("NHK 主要", "https://news.web.nhk/n-data/conf/na/rss/cat0.xml"),
    ("NHK 経済", "https://news.web.nhk/n-data/conf/na/rss/cat5.xml"),
    ("NHK 科学・医療", "https://news.web.nhk/n-data/conf/na/rss/cat3.xml"),
    ("Google ニュース", "https://news.google.com/rss?hl=ja&gl=JP&ceid=JP:ja"),
    ("Google ニュース・ビジネス", "https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=ja&gl=JP&ceid=JP:ja"),
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
            summary = clean_summary(entry.findtext("description"), title)
            items.append({"title": title, "url": link, "source": source, "published": published.isoformat(), "summary": summary, "detail_level": "rss-summary" if summary else "headline"})
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
OUTPUT.write_text(json.dumps({"updated_at": NOW.isoformat(), "generation": "rss-summary-with-headline-fallback", "items": unique[:30]}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"Saved {len(unique[:30])} fresh topics; no paid AI used")
if not unique:
    raise SystemExit("No fresh news items found; check feed URLs and logs")
