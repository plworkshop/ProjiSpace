import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeVoiceWav } from './audio.ts';
test('voice WAV is mono PCM16 at 16 kHz and clamps samples', () => {
  const bytes = Buffer.from(encodeVoiceWav(new Float32Array([-2,-1,0,1,2])));
  assert.equal(bytes.toString('ascii',0,4),'RIFF');
  assert.equal(bytes.readUInt32LE(4),bytes.length-8);
  assert.equal(bytes.readUInt16LE(20),1);
  assert.equal(bytes.readUInt16LE(22),1);
  assert.equal(bytes.readUInt32LE(24),16000);
  assert.equal(bytes.readUInt16LE(34),16);
  assert.equal(bytes.readUInt32LE(40),10);
  assert.deepEqual(Array.from({length:5},(_,i)=>bytes.readInt16LE(44+i*2)),[-32768,-32768,0,32767,32767]);
});
