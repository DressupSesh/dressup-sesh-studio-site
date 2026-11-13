import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
test('Back Room shows active paid copy as unlimited, preserving trial and suspended balances',()=>{
 const source=fs.readFileSync(new URL('../../studio-backroom.js',import.meta.url),'utf8');const block=source.slice(source.indexOf('  function accountBalance('),source.indexOf('  const dollars ='));
 const label=vm.runInNewContext(`const number=value=>Number(value||0).toLocaleString('en-US');${block};accountBalance`);
 const paid={plan:'paid',subscription_status:'active',copy_remaining:26,background_remaining:525,creative_remaining:25};
 assert.equal(label(paid,'copy_remaining'),'Unlimited');assert.equal(label(paid,'background_remaining'),'525');assert.equal(label(paid,'creative_remaining'),'25');
 assert.equal(label({...paid,subscription_status:'trialing'},'copy_remaining'),'Unlimited');
 assert.equal(label({...paid,plan:'trial',copy_remaining:1},'copy_remaining'),'1');
 assert.equal(label({...paid,access_suspended:true,copy_remaining:0},'copy_remaining'),'0');
 assert.equal(label({...paid,plan:'inactive',copy_remaining:0},'copy_remaining'),'0');
});
