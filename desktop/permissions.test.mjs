import test from 'node:test';
import assert from 'node:assert/strict';
import {microphoneOnly} from './permissions.mjs';
test('only local audio requests are allowed, never camera or other origins',()=>{
  const origin='http://127.0.0.1:4318';
  assert.equal(microphoneOnly('media',origin,{mediaTypes:['audio']},origin),true);
  assert.equal(microphoneOnly('media',origin,{mediaType:'audio'},origin),true);
  for(const details of [{mediaTypes:['audio','video']},{mediaTypes:['video']},{mediaType:'video'},{mediaTypes:[]},{}]){
    assert.equal(microphoneOnly('media',origin,details,origin),false);
  }
  assert.equal(microphoneOnly('media','https://example.com',{mediaType:'audio'},origin),false);
  assert.equal(microphoneOnly('notifications',origin,{mediaType:'audio'},origin),false);
});
