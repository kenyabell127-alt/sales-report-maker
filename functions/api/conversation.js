const MODEL='@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const FALLBACK_MODEL='@cf/meta/llama-3.1-8b-instruct-fp8-fast';
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
 'あなたは日本語ネイティブの会話編集者。これはスピーチ原稿でもニュース解説でもなく、誰かに実際に話しかける短い会話の下書き。',
 '出力は話す本文のみ。ニュースの見出し・箇条書き・注釈・解説・挨拶は禁止。',
 'まず概要から確実に言える事実を一つ選び、専門用語や長い修飾をほどいて自分の口で話すように言い換える。事実の意味を変えない。',
 '概要が長くても全情報を盛り込まない。要点を一つ伝えればよい。新聞記事の一文を丸ごと転載しない。',
 '冒頭は「そういえば」「この前」「最近」などが自然な場合のみ使う。毎回「気になるニュースがあるんですけど」から始めない。',
 '本人の感想が入力されていなければ、無理に感想や個人的経験を創作しない。「珍しいと思います」「考えさせられます」など空疎な感想を足さない。',
 '会話の最後は自然に終える。質問は会話が広がる身近な話題で、答えやすい場合に限り一つ。質問なしでもよい。戦争、事件、死者、墓地、政治対立など重い話題は質問で締めない。',
 '野球なら「野球って見る？」「どこのチーム応援してる？」など。日常の話題は相手の経験を尋ねてもよい。ニュースの当事者の心情や推測を質問しない。',
 '「あなたも〜か？」「皆さんはどう思いますか？」「ご紹介します」「詳しくは分かりませんが」「それにしても」は使わない。',
 '断言できる情報は入力された概要だけ。見出しにしかない情報、日付、勝敗、背景、人物の感情は勝手に補わない。',
 '1〜3段落。目安80〜170字。情報が少ないなら60字でもよい。です・ます調を基本に、親しい相手なら少しくだけた自然な口語。',
 '良い例（スポーツ、事実は架空の例）：「昨日の試合、最後に逆転したらしいですね。終盤まで負けていたのに、あそこからひっくり返すのはすごいですよね。野球って普段見ます？」',
 '良い例（身近な新商品、架空の例）：「最近、家で使える小さなプロジェクターが出たみたいですね。置き場所を取らないならちょっと気になります。家で映画って見ます？」',
 '良い例（重い話題、架空の例）：「海外で大きな事故があったそうです。現地では原因の調査が続いているとのことで、まだ分かっていないことも多いようです。」',
 '悪い例：「あなたはこの問題についてどう感じますか？」「私たちも日々の仕事に活かしたいですね」「詳細は分かりませんが、きっと〜でしょう」。',
 '相手:'+({friend:'友達・同僚',work:'仕事の相手',general:'幅広い相手'}[audience]),
 '話し方:'+({natural:'親しみやすい',formal:'丁寧で自然',light:'明るく簡潔'}[tone]),
 '記事タイトル（参考のみ）:'+title,
 '確認できた概要:'+summary,
 '本人の感想:'+opinion,
 '本人の経験:'+experience
 ].join('\n');
 try{
  // Phase 1: extract grounded facts before writing conversational text.
  let grounded=summary;
  if(summary){
   try{
    const factResult=await env.AI.run(FALLBACK_MODEL,{messages:[
     {role:'system',content:'与えられた概要に明記された事実だけを抽出。推測禁止。'},
     {role:'user',content:'次のニュース概要から、明記された事実を1〜2文で簡潔に抜き出す。意見や感想は不要。概要：'+summary}
    ],max_tokens:240,temperature:0.1});
    const extracted=String(factResult?.response||'').trim();
    if(extracted.length>=20&&extracted.length<=summary.length+50&&/[。]$/.test(extracted))grounded=extracted;
   }catch(factError){}
  }
  const groundedInstruction=instruction+'\\n追加条件：まず次の確認済みの要点を理解して会話文にする。要点：'+grounded+'\\n記事の概要から確認できない情報は書かない。文章は60〜160字。ニュースを丸読みせず要点を一つ話す。';
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
   if(text.length>400)issues.push('too_long');
   if(/気になったニュースがあるんですけど|皆さんはこの話題/.test(text))issues.push('canned_intro');
   if(/戦争|墓地|犠牲者|死者|死亡|事故|災害|銃撃|国防長官|戦没者/.test(title+' '+summary)&&/[？?]/.test(text))issues.push('sensitive_question');
   return issues;
  };
  const issues=problems(speech);
  if(speech.length>0&&!/[。！？?!」』]$/.test(speech))issues.push('incomplete_ending');
  if(issues.length&&speech.length>=35){
   try{
    const review=await env.AI.run(model,{messages:[
     {role:'system',content:'自然な日本語の会話文に校正。ニュースの事実を追加しない。文章のみ出力。'},
     {role:'user',content:'この文章の不自然さを修正してください。無理な質問は削除し、同じ内容を繰り返さず、70〜180字程度。元記事概要：'+summary+'\n原稿：'+speech}
    ],max_tokens:330,temperature:0.2});
    const revised=String(review?.response||'').trim();
    if(revised.length>=35&&revised.length<=LIMIT&&/[。！？?!」』]$/.test(revised)&&problems(revised).length<=issues.length)speech=revised;
   }catch(reviewError){}
  }
  if(speech.length<35||speech.length>400||!/[。！？?!」』]$/.test(speech))return json({error:'INCOMPLETE_GENERATION',detail:'文章が最後まで生成されませんでした。再度お試しください。'},502);
  return json({speech,source_scope:summary?'provided_summary':'user_input',model,fallback_used:model!==MODEL,quality_warning:problems(speech).join(',')||null});
 }catch(e){return json({error:'GENERATION_FAILED',message:'AIモデルの呼び出しに失敗しました。',detail:String(e?.message||'unknown').slice(0,180)},502)}
}
