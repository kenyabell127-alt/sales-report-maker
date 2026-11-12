const MODEL='@cf/meta/llama-3.1-8b-instruct-fp8-fast';
const LIMIT=2600;
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}})}
export async function onRequestPost({request,env}){
 if(!env.AI)return json({error:'AI_BINDING_REQUIRED',message:'AIの接続設定が必要です。'},503);
 const length=Number(request.headers.get('content-length')||0);
 if(length>10000)return json({error:'TOO_LARGE'},413);
 let data;
 try{data=await request.json()}catch{return json({error:'INVALID_JSON'},400)}
 const title=String(data.title||'').slice(0,180);
 const summary=String(data.summary||'').slice(0,1200);
 const opinion=String(data.opinion||'').slice(0,300);
 const experience=String(data.experience||'').slice(0,450);
 const audience=['friend','work','general'].includes(data.audience)?data.audience:'friend';
 const tone=['natural','formal','light'].includes(data.tone)?data.tone:'natural';
 if(!summary&&!opinion&&!experience)return json({error:'SOURCE_REQUIRED',message:'確認できた記事の概要、感想、経験のいずれかが必要です。'},400);
 const instruction=[
 'あなたは日本語の会話文の編集者です。人が友人や同僚に口頭で話す自然な文章を書いてください。',
 '出力は文章本文だけ。見出し、箇条書き、引用符、説明、前置きは不要。',
 '構成: 親しみやすい導入→確認できる事実→自然な感想→相手が答えやすい具体的な質問。',
 'ニュースの事実は提供された概要だけが根拠。見出しに書かれていても概要で確認できない勝敗、日時、人物、数値を事実として断言しない。',
 '概要にない情報を想像で補わない。体験談も創作しない。記事本文を読んだと偽らない。',
 '野球なら「好きなチームはあります？」など、話題に合った問いを最後に1つだけ置く。',
 '話題を無理に仕事の教訓に結びつけない。「おはようございます」「皆さん」「大切だと感じました」など定型表現は避ける。',
 '話し言葉だが幼稚にしない。自然なです・ます調。2〜4段落、150〜300字程度。',
 '相手:'+({friend:'友達・同僚',work:'仕事の相手',general:'幅広い相手'}[audience]),
 '話し方:'+({natural:'親しみやすい',formal:'丁寧で自然',light:'明るく簡潔'}[tone]),
 '記事タイトル（話題の参考）:'+title,
 '確認済みの概要:'+summary,
 '話し手の感想（空なら作り込まない）:'+opinion,
 '話し手の経験（空なら作らない）:'+experience
 ].join('\n');
 try{
  const result=await env.AI.run(MODEL,{messages:[{role:'system',content:'与えられた事実の範囲で自然な日本語の会話文だけを作成する。'},{role:'user',content:instruction}],max_tokens:650,temperature:0.55});
  const speech=String(result?.response||'').trim().replace(/^\`\`\`[\s\S]*?\n/,'').replace(/\`\`\`$/,'').trim();
  if(speech.length<40||speech.length>LIMIT)return json({error:'INVALID_GENERATION'},502);
  return json({speech,source_scope:summary?'provided_summary':'user_input',model:MODEL});
 }catch(e){return json({error:'GENERATION_FAILED',message:'AIモデルの呼び出しに失敗しました。',detail:String(e?.message||'unknown').slice(0,180)},502)}
}
