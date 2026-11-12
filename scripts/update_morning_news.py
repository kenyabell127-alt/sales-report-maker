import json, urllib.request, xml.etree.ElementTree as ET, datetime, pathlib, re
feeds=[("NHKニュース","https://www.nhk.or.jp/rss/news/cat0.xml"),("NHK経済","https://www.nhk.or.jp/rss/news/cat5.xml")]
items=[]
for source,url in feeds:
 try:
  req=urllib.request.Request(url,headers={"User-Agent":"Mozilla/5.0 MorningSpeechFeed/1.0"})
  with urllib.request.urlopen(req,timeout=18) as res: xml=res.read()
  root=ET.fromstring(xml)
  for item in root.findall(".//item")[:20]:
   title=(item.findtext("title") or "").strip()
   link=(item.findtext("link") or "").strip()
   date=(item.findtext("pubDate") or "").strip()
   if title and link.startswith("https://") and len(title)<160:
    items.append({"title":title,"url":link,"source":source,"published":date})
 except Exception as e: print(source,type(e).__name__,str(e)[:120])
seen=set(); unique=[]
for item in items:
 if item["title"] not in seen:
  seen.add(item["title"]);unique.append(item)
path=pathlib.Path("data/morning-news.json");path.parent.mkdir(exist_ok=True)
if unique:
 path.write_text(json.dumps({"updated_at":datetime.datetime.now(datetime.timezone.utc).isoformat(),"items":unique[:35]},ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
 print("Saved",len(unique))
else:
 print("No new feed items; keeping previous file")
