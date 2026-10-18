import {test} from 'node:test';
import assert from 'node:assert/strict';
import {desktopBridge,desktopResult,DesktopRequestError} from '../../frontend/my-react-app/src/services/desktop.ts';
test('missing desktop preload fails as a recoverable transport error; browser mode retains HTTP selection',()=>{
  const previous=globalThis.window;
  try {
    globalThis.window={location:{protocol:'ledgernest:'}};
    assert.throws(()=>desktopBridge(),error=>error instanceof DesktopRequestError && error.status===503);
    globalThis.window={location:{protocol:'http:'}};assert.equal(desktopBridge(),undefined);
  } finally {if(previous===undefined)delete globalThis.window;else globalThis.window=previous;}
});
test('transport rejects canceled results and carries only the safe failure envelope',async()=>{
  const controller=new AbortController();controller.abort();
  await assert.rejects(desktopResult(Promise.resolve({ok:true,value:1}),controller.signal),{name:'AbortError'});
  await assert.rejects(desktopResult(Promise.resolve({ok:false,error:{status:401,message:'Please sign in.'}})),error=>error instanceof DesktopRequestError && error.status===401);
  assert.equal(await desktopResult(Promise.resolve({ok:true,value:42})),42);
});
