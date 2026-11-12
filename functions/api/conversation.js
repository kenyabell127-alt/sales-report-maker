const MODEL='@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const FALLBACK_MODEL='@cf/meta/llama-3.1-8b-instruct-fp8-fast';
const LIMIT=2600;
const BAD_STYLE=/あなたも.{0,30}か[？?]|皆さんは.{0,30}思いますか|ご紹介します|詳しくは分かりませんが|仕事に活か|って知ってる[？?]|をご存じですか[？?]|知っていますか[？?]/;
function quality(text,{followup=false}={}){const issues=[];if(BAD_STYLE.test(text))issues.push('unnatural_phrase');if((text.match(/[？?]/g)||[]).length>1)issues.push('too_many_questions');if(text.length>(followup?110:260))issues.push('too_long');if(!/[。！？?!」』]$/.test(text))issues.push('incomplete');if(/^.{0,90}(?:と発表しました|と報じられています)。$/.test(text))issues.push('news_readout');return issues}

function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}})}
export async function onRequestPost({request,env}){
 if(!env.AI)return json({error:'AI_BINDING_REQUIRED',message:'AIの接続設定が必要です。'},503);
 const length=Number(request.headers.get('content-length')||0);
 if(length>10000)return json({error:'TOO_LARGE'},413);
 let data;
 try{data=await request.json()}catch{return json({error:'INVALID_JSON'},400)}
 const mode=String(data.mode||'');
 if(mode==='followup'){
  const original=String(data.speech||'').slice(0,500);
  const summary=String(data.summary||'').slice(0,1200);
  const reaction=String(data.reaction||'');
  const audience=['friend','work','general'].includes(data.audience)?data.audience:'friend';
  if(!original||!['interest','unknown','busy'].includes(reaction))return json({error:'INVALID_FOLLOWUP'},400);
  if(reaction==='busy')return json({speech:audience==='friend'?'そっか、また時間あるときに話そう。':'承知しました。またお時間のあるときに。',source_scope:'conversation_only'});
  const sensitive=/戦争|墓地|戦没|死者|死亡|事故|災害|銃撃|殺害|地震|紛争|不正アクセス|情報流出|個人情報|サイバー攻撃|詐欺|逮捕|容疑|漏えい|漏洩|暴行|テロ|訃報/.test(original+' '+summary);
  const instruction=['あなたは自然な日本語で話す会話相手。以下の最初の一言に対する返事を受けて、次の一言だけを書いてください。','説明文、見出し、箇条書きは禁止。最大2文、100文字以内。','元記事概要にない事実・自分の経験・感想を創作しない。','元の一言を繰り返さない。','反応：'+(reaction==='interest'?'相手は「へえ、そうなんだ」と興味を示した':'相手は「あまり詳しく知らない」と言った'),'話す相手：'+(audience==='work'?'仕事の相手（自然な敬語）':'友達・同僚（自然な口語）'),sensitive?'深刻な話題。軽い質問や冗談は避け、知らないことは断言しない。':'自然に会話が続くなら、相手自身の経験を一つだけ尋ねてもよい。','最初の一言：'+original,'確認できる記事概要：'+summary].join('\n');
  try{
   let model=MODEL,result;
   try{result=await env.AI.run(model,{messages:[{role:'user',content:instruction}],max_tokens:180,temperature:0.35})}
   catch(e){model=FALLBACK_MODEL;result=await env.AI.run(model,{messages:[{role:'user',content:instruction}],max_tokens:180,temperature:0.3})}
   const speech=String(result?.response||'').trim();
   if(!speech||quality(speech,{followup:true}).length)return json({error:'UNNATURAL_FOLLOWUP',message:'自然な続きが作れませんでした。'},502);
   return json({speech,model,source_scope:'provided_summary'});
  }catch(e){return json({error:'FOLLOWUP_FAILED',message:'続きの生成に失敗しました。'},502)}
 }
 const title=String(data.title||'').slice(0,180);
 const summary=String(data.summary||'').slice(0,1200);
 const opinion=String(data.opinion||'').slice(0,300);
 const experience=String(data.experience||'').slice(0,450);
 const audience=['friend','work','general'].includes(data.audience)?data.audience:'friend';
 const tone=['natural','formal','light'].includes(data.tone)?data.tone:'natural';
 const purpose=['chat','question','explain'].includes(data.purpose)?data.purpose:'chat';
 const unsafe=/戦争|墓地|戦没|死者|死亡|事故|災害|銃撃|殺害|地震|紛争|不正アクセス|情報流出|個人情報|サイバー攻撃|詐欺|逮捕|容疑|漏えい|漏洩|暴行|テロ|訃報|国防長官/;
 if(unsafe.test(title+' '+summary))return json({error:'NOT_SUITABLE_FOR_CASUAL_CONVERSATION',message:'このニュースは気軽な会話の話題には向いていません。別の話題を選んでください。'},422);
 if(!summary&&!opinion&&!experience)return json({error:'SOURCE_REQUIRED',message:'確認できた記事の概要、感想、経験のいずれかが必要です。'},400);
 const instruction=[
  "日本語の雑談で、相手に話しかける最初の一言を作る。記事要約やスピーチではない。本文だけ返す。",
  "原則2文、最大3文。自然なら短くてよい。",
  "ニュース概要に書かれた事実を一つだけ使う。タイトルだけの情報、背景、日時、感情を勝手に足さない。",
  "本人が入力していない感想や経験を捏造しない。",
  "ニュースの説明だけで終わる文章、堅い前置き、無理な質問は避ける。",
  "「〜についてお話しします」「〜というニュースがあります」「注目されています」「考えさせられます」「皆さんはどう思いますか」は禁止。",
  "相手が知らなくても答えられる身近な質問だけ許可。固有名詞を知っているかと試す質問は禁止。",
  "例（カフェが新しい朝食メニューを発売）：近くのカフェで朝ごはんの新メニューが出るんだって。朝って外で食べることある？",
  "例は文体だけの参考。入力にないカフェや朝食などの情報を混ぜない。",
  '相手：'+({friend:'友達・同僚の自然な口語',work:'職場の相手への柔らかい敬語',general:'初対面にも自然な口語'}[audience]),
  '目的：'+({chat:'軽く話題を振る',question:'答えやすい質問を一つ',explain:'要点を一つ伝える'}[purpose]),
  '概要：'+summary,'本人の感想：'+opinion,'本人の経験：'+experience
 ].join('\n');
 try{
  // Use only verbatim sentences from the supplied summary as the factual anchor.
  // An earlier AI extraction step could silently introduce unsupported claims.
  const sentences=summary.match(/[^。！？]+[。！？]/g)||[];
  const grounded=sentences.slice(0,2).join('').trim()||summary;
  const topicText=title+' '+summary;
  const sensitive=/戦争|墓地|犠牲者|死者|死亡|事故|災害|銃撃|国防長官|戦没者|殺害|地震|紛争|不正アクセス|情報流出|個人情報|サイバー攻撃|詐欺|逮捕|容疑|漏えい|漏洩/.test(topicText);
  const category=/野球|サッカー|バスケ|スポーツ|試合|選手|優勝/.test(topicText)?'sports':/食料|価格|物価|税|賃金|経済|値下げ/.test(topicText)?'economy':/映画|テレビ|旅行|商品|アプリ|発売|音楽/.test(topicText)?'lifestyle':'general';
  const purposeGuidance=purpose==='question'?'相手が答えやすい質問を一つだけ最後に付ける。ただし重い話題には付けない。':purpose==='explain'?'確認できた要点を少し詳しく、しかしニュース記事の読み上げにならないよう話す。':'相手が返事しやすい自然な話題の振り方を優先。質問は必要な場合だけ。';
  const categoryGuidance=sensitive?'深刻なニュース。質問で締めず、軽い感想も付けない。':category==='sports'?'試合・選手について確認できる事実を伝える。観戦や応援チームの話は自然な場合だけ。':category==='economy'?'制度の説明を盛らず、生活への影響は根拠がある場合だけ。':category==='lifestyle'?'身近な使い方や経験への質問は自然な場合だけ。':'質問や感想を無理に付けない。';
  const groundedInstruction=instruction+'\n概要から確認できる文：'+grounded+'\n追加方針：'+purposeGuidance+' '+categoryGuidance;
  const messages=[{role:'system',content:'自然な日本語の会話編集者。事実を捏造せず、本文のみ返す。'},{role:'user',content:groundedInstruction}];
  let model=MODEL, result;
  try{result=await env.AI.run(model,{messages,max_tokens:800,temperature:0.3})}
  catch(primaryError){
   model=FALLBACK_MODEL;
   result=await env.AI.run(model,{messages,max_tokens:450,temperature:0.3});
  }
  let speech=String(result?.response||'').trim();
  const problems=text=>{
   const issues=[];
   if(/あなたも.{0,30}か[？?]|皆さんは.{0,30}思いますか|ご紹介します|詳しくは分かりませんが|仕事に活か/.test(text))issues.push('translation_like');
   if((text.match(/[？?]/g)||[]).length>1)issues.push('multiple_questions');
   if(text.length>260)issues.push('too_long');
   if(/気になったニュースがあるんですけど|皆さんはこの話題|って知ってる[？?]|をご存じですか[？?]|知っていますか[？?]/.test(text))issues.push('canned_intro');
   if(/^(?:.{0,80})(?:と言っています|と発表しました|と報じられています)。$/.test(text))issues.push('news_summary_not_conversation');
   if(/戦争|墓地|犠牲者|死者|死亡|事故|災害|銃撃|国防長官|戦没者/.test(title+' '+summary)&&/[？?]/.test(text))issues.push('sensitive_question');
   return issues;
  };
  const issues=problems(speech);
  if(sensitive&&/[？?]/.test(speech))issues.push('sensitive_question');
  if(speech.length>0&&!/[。！？?!」』]$/.test(speech))issues.push('incomplete_ending');
  if(issues.length&&speech.length>=15){
   try{
    const review=await env.AI.run(model,{messages:[
     {role:'system',content:'自然な日本語の会話文に校正。ニュースの事実を追加しない。文章のみ出力。'},
     {role:'user',content:'この文章を会話として自然に修正してください。相手が途中で返事できる短い言葉にする。無理な質問は削除。字数を埋めない。元記事概要：'+summary+'\n原稿：'+speech}
    ],max_tokens:330,temperature:0.2});
    const revised=String(review?.response||'').trim();
    if(revised.length>=15&&revised.length<=260&&/[。！？?!」』]$/.test(revised)&&problems(revised).length<issues.length&&(!sensitive||!/[？?]/.test(revised)))speech=revised;
   }catch(reviewError){}
  }
  if(speech.length<15||quality(speech).length||(sensitive&&/[？?]/.test(speech)))return json({error:'INCOMPLETE_GENERATION',detail:'文章が最後まで生成されませんでした。再度お試しください。'},502);
  return json({speech,source_scope:summary?'provided_summary':'user_input',model,fallback_used:model!==MODEL,quality_warning:null});
 }catch(e){return json({error:'GENERATION_FAILED',message:'AIモデルの呼び出しに失敗しました。',detail:String(e?.message||'unknown').slice(0,180)},502)}
}
