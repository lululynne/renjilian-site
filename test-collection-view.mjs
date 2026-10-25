import test from 'node:test';
import assert from 'node:assert/strict';
import view from './collection-view.js';

test('display links derive only from bounded site identifiers',()=>{
  assert.equal(view.href('reading','r-one'),'kanread.html#r-one');
  for(const id of ['javascript:alert(1)','../else','https://elsewhere.invalid','x\" onclick=\"go',undefined])
    assert.equal(view.href('tool',id),null);
  assert.equal(view.href('foreign','one'),null);
});
test('candidate projections preserve adult gates and the two-step reading boundary',()=>{
  const questions=view.candidates('question',[{id:'q-one',title:'成人原题',lv:'r18',body:'private body'}]);
  assert.equal(questions[0].adult,true);
  assert.doesNotMatch(JSON.stringify(questions),/成人原题|private body/);
  const readings=view.candidates('reading',{schema_version:1,items:[
    {id:'r-one',title:'阅读',status:'verified',machine_voice:'full expansion'},
    {id:'r-two',title:'草稿',status:'draft'},
  ]});
  assert.equal(readings.length,1);assert.doesNotMatch(JSON.stringify(readings),/full expansion|草稿/);
  assert.equal(view.candidates('tool',{schema_version:2,items:[{id:'t-one',name:'准备中的工具',status:'planned'}]})[0].status,'planned');
});
test('malformed source versions, missing ids, duplicates and levels are rejected',()=>{
  for(const value of [{schema_version:3,items:[]},{schema_version:2,items:[{name:'missing',status:'verified'}]},
    {schema_version:2,items:[{id:'same',name:'a',status:'verified'},{id:'same',name:'b',status:'verified'}]}])
    assert.throws(()=>view.candidates('tool',value));
  assert.throws(()=>view.candidates('question',[{id:'q-one',title:'x',lv:'unknown'}]));
});
