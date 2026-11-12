import json, urllib.request, xml.etree.ElementTree as ET, datetime, pathlib, os, re, time
from email.utils import parsedate_to_datetime

ROOT=pathlib.Path("data/morning-news.json")
FEEDS=[("NHK主要","https://www.nhk.or.jp/rss/news/cat0.xml"),("NHK経済","https://www.nhk.or.jp/rss/news/cat5.xml"),("NHK科学・文化","https://www.nhk.or.jp/rss/news/cat3.xml")]
now=datetime.datetime.now(datetime.timezone.utc)
items=[]
for source,url in FEEDS:
 try:
  req=urllib.request.Request(url,headers={"User-Agent":"MorningSpeechMaker/1.0"})
  with urllib.request.urlopen(req,timeout=20) as response:
   root=ET.fromstring(response.read())
  for entry in root.findall(".//item")[:25]:
   title=re.sub(r"\s+"," ",entry.findtext("title") or "").strip()
   link=(entry.findtext("link") or "").strip()
   date=(entry.findtext("pubDate") or "").strip()
   try: published=parsedate_to_datetime(date).astimezone(datetime.timezone.utc)
   except (TypeError,ValueError): continue
   if not title or len(title)>145 or not link.startswith("https://") or (now-published).total_seconds()>72*3600: continue
   if re.search(r"死亡|殺害|遺体|自殺|性的|虐待|逮捕|戦争|爆発|被害者|暴行|選挙|政党|宗教|容疑|銃撃",title): continue
   items.append({"title":title,"url":link,"source":source,"published":published.isoformat()})
 except Exception as e: print("feed failed",source,type(e).__name__,str(e)[:150])
seen=set();unique=[]
for item in sorted(items,key=lambda x:x["published"],reverse=True):
 if item["title"] not in seen:
  seen.add(item["title"]);unique.append(item)
if not unique:
 print("No fresh suitable items. Previous data retained.")
 raise SystemExit(0)
# An optional server-side API key enables actual AI-authored, fact-constrained scripts.
# Never send API keys to browser clients or commit them to GitHub.
key=os.environ.get("OPENAI_API_KEY","").strip()
model=os.environ.get("OPENAI_MODEL","gpt-4.1-mini")
def ai_script(item):
 prompt="""あなたは日本語の職場朝礼スピーチの編集者です。入力はニュースの『見出し』のみです。
見出しから確実に読み取れる内容以外の事実、数字、背景、影響、記事内容を捏造しないこと。
出典名を明示し、事実と個人的な気づきを区別すること。
政治的主張や過度な煽りを避けること。自然で、押しつけがましくない朝礼原稿を作る。
テーマを仕事の一般的な心がけに結びつける。ニュース本文を読んだような表現は禁止。
返答はJSONオブジェクトのみで keys: short (約140文字), standard (約280文字), long (約450文字)。それぞれ冒頭挨拶と締めを含む完成原稿。"""
 payload=json.dumps({"model":model,"messages":[{"role":"system","content":prompt},{"role":"user","content":json.dumps({"headline":item["title"],"source":item["source"]},ensure_ascii=False)}],"response_format":{"type":"json_object"},"temperature":0.5},ensure_ascii=False).encode()
 request=urllib.request.Request("https://api.openai.com/v1/chat/completions",data=payload,headers={"Authorization":"Bearer "+key,"Content-Type":"application/json"})
 with urllib.request.urlopen(request,timeout=35) as res: data=json.load(res)
 result=json.loads(data["choices"][0]["message"]["content"])
 if not all(isinstance(result.get(k),str) and len(result[k])>60 for k in ("short","standard","long")): raise ValueError("incomplete response")
 return {k:result[k] for k in ("short","standard","long")}
if key:
 for item in unique[:3]:
  try:
   item["scripts"]=ai_script(item)
   print("Generated",item["title"][:35])
  except Exception as e: print("AI generation failed",type(e).__name__,str(e)[:100])
  time.sleep(0.3)
else: print("OPENAI_API_KEY not configured; headline-only fallback is available")
ROOT.parent.mkdir(parents=True,exist_ok=True)
ROOT.write_text(json.dumps({"updated_at":now.isoformat(),"generation":"ai" if any("scripts" in i for i in unique) else "headline","items":unique[:25]},ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print("Saved",len(unique))
