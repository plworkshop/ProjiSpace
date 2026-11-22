import test from 'node:test';
import assert from 'node:assert/strict';
import { imagePoint, markPath } from './annotations.ts';

test('drawing coordinates follow the rendered image at any zoom and clamp to its edges', () => {
  assert.deepEqual(imagePoint(300,200,{left:100,top:100,width:400,height:200}),[0.5,0.5]);
  assert.deepEqual(imagePoint(500,300,{left:100,top:100,width:800,height:400}),[0.5,0.5]);
  assert.deepEqual(imagePoint(-1,900,{left:100,top:100,width:400,height:200}),[0,1]);
});
test('shape geometry retains image proportions, reversed drags and zero-length marks', () => {
  const mark={tool:'line',width:0.01,color:'#ff0000',points:[[0.8,0.75],[0.2,0.25]]};
  assert.equal(markPath(mark,1000,500),'M800 375L200 125');
  assert.equal(markPath({...mark,tool:'rectangle'},1000,500),'M800 375H200V125H800Z');
  for (const tool of ['pen','marker','line','arrow','rectangle','ellipse']) {
    assert.doesNotMatch(markPath({...mark,tool},1000,500),/NaN|Infinity/);
    assert.doesNotMatch(markPath({...mark,tool,points:[[0.5,0.5],[0.5,0.5]]},1000,500),/NaN|Infinity/);
  }
});
