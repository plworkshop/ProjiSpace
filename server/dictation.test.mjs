import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {createApp} from './app.mjs';
test('dictation endpoints require local session and constrain requests before processing',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'projector-dictation-api-'));
  const app=await createApp({dataDir:dir,seed:false,accessToken:'test-only-session',dictationExecutable:null});
  try {
    await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
    const base=`http://127.0.0.1:${app.server.address().port}`;
    const headers={cookie:'sidequest_session=test-only-session'};
    assert.equal((await fetch(base+'/api/dictation')).status,403);
    const state=await (await fetch(base+'/api/dictation',{headers})).json();
    assert.equal(state.supported,false); assert.equal(state.ready,false);
    assert.equal((await fetch(base+'/api/dictation/model',{method:'POST',headers})).status,503);
    assert.equal((await fetch(base+'/api/dictation/model',{method:'POST',headers:{...headers,origin:'https://example.com'}})).status,403);
    assert.equal((await fetch(base+'/api/dictation/transcribe',{method:'POST',headers:{...headers,'Content-Type':'text/plain'},body:'audio'})).status,415);
    assert.equal((await fetch(base+'/api/dictation/transcribe?language=invalid',{method:'POST',headers:{...headers,'Content-Type':'audio/wav'},body:'audio'})).status,400);
    assert.equal((await fetch(base+'/api/dictation/transcribe',{method:'POST',headers:{...headers,'Content-Type':'audio/wav'},body:Buffer.alloc(3840045)})).status,413);
  } finally {
    await app.close();
    await rm(dir,{recursive:true,force:true});
  }
});
