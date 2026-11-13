import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createUpgradeController} from '../../listing-upgrade/controller.mjs';
const session=id=>({user:{id},access_token:id+'-token'});
function setup(){
  const {document}=parseHTML('<html><body><section id="upgrade"></section></body></html>');
  globalThis.document=document;
  return document.getElementById('upgrade');
}
test('public accounts mount once; switching identity aborts and removes the previous draft',async()=>{
  const panel=setup(),mounts=[];let current=session('member');
  const controller=createUpgradeController({panel,client:{auth:{getSession:async()=>({data:{session:current}})}},openAuth(){},onAccess(){},load:async()=>({mountUpgrade:async(host,options)=>{host.textContent=current.user.id+' draft';mounts.push(options);}})});
  await controller.setSession(current);
  await controller.setSession(current);
  assert.equal(mounts.length,1);
  current=session('free');
  assert.equal((await mounts[0].client.auth.getSession()).data.session,null);
  await controller.setSession(current);
  assert.equal(mounts[0].signal.aborted,true);
  assert.equal(panel.textContent,'free draft');
  assert.equal((await mounts[1].client.auth.getSession()).data.session.user.id,'free');
  await controller.setSession(null);
  assert.equal(mounts[1].signal.aborted,true);
  assert.match(panel.textContent,/Sign in/);
  assert.doesNotMatch(panel.textContent,/free draft/);
});
test('sign-out during delayed loading cannot restore a previous account workspace',async()=>{
  const panel=setup();let finish,mounted=false;
  const controller=createUpgradeController({panel,client:{},openAuth(){},onAccess(){},load:()=>new Promise(resolve=>finish=resolve)});
  const loading=controller.setSession(session('member'));
  controller.setSession(null);
  finish({mountUpgrade:async()=>{mounted=true;}});
  await loading;
  assert.equal(mounted,false);
  assert.equal(panel.querySelector('studio-upgrade'),null);
});
test('failed Upgrade load offers a retry without changing other Studio controls',async()=>{
  const panel=setup();let attempts=0;
  const controller=createUpgradeController({panel,client:{},openAuth(){},onAccess(){},load:async()=>{attempts++;if(attempts===1)throw Error('offline');return {mountUpgrade:async(host)=>{host.textContent='Ready';}};}});
  await controller.setSession(session('member'));
  assert.match(panel.textContent,/other Studio tools/);
  panel.querySelector('button').click();
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(panel.textContent,'Ready');
  controller.destroy();
});
