// Run with: node --test tests/conversation.test.mjs
// No npm dependencies. AI responses are mocked; this is not a live model quality test.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../functions/api/conversation.js',import.meta.url),'utf8');
const makeHandler=new Function('Response',source.replace('export async function onRequestPost','async function onRequestPost')+';return onRequestPost');
const onRequestPost=makeHandler(Response);
async function call(data,reply='うどんが少し安くなるらしいよ。食べに行くことある？'){
 const request=new Request('https://example.test/api/conversation',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});
 const response=await onRequestPost({request,env:{AI:{run:async()=>({response:reply})}}});
 return {status:response.status,body:await response.json()};
}
test('normal news returns conversation',async()=>{
 const r=await call({title:'うどんの値下げ',summary:'うどんチェーンが一部の商品を値下げすると発表しました。'});
 assert.equal(r.status,200);assert.ok(r.body.speech.includes('うどん'));
});
test('serious news rejected',async()=>{
 const r=await call({title:'墓地での事件',summary:'事件がありました。'});
 assert.equal(r.status,422);
});
test('followup returns a short next line',async()=>{
 const r=await call({mode:'followup',speech:'うどんが値下げになるらしいよ。',summary:'うどんチェーンが値下げすると発表しました。',reaction:'interest'});
 assert.equal(r.status,200);assert.ok(r.body.speech.length<=110);
});
test('unnatural Japanese rejected',async()=>{
 const r=await call({title:'新商品',summary:'新商品が発売されました。'},'あなたも新商品を知っているか？');
 assert.equal(r.status,502);
});
test('missing grounding rejected',async()=>{
 const r=await call({title:'新商品'});assert.equal(r.status,400);
});
test('busy reaction does not invoke AI',async()=>{
 const r=await call({mode:'followup',speech:'最近うどんが安くなるみたい。',reaction:'busy'});
 assert.equal(r.status,200);assert.match(r.body.speech,/また/);
});
