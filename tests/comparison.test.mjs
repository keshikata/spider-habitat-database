import test from 'node:test';
import assert from 'node:assert/strict';
import {comparisonCapacity} from '../site/comparison.js';
test('comparison capacity follows the largest catalog genus, including unmapped species',()=>{
  assert.deepEqual(comparisonCapacity([{genus:'B'},{genus:'A'},{genus:'A'}]),{genus:'A',count:2});
  assert.equal(comparisonCapacity(Array.from({length:93},()=>({genus:'Cybaeus'}))).count,93);
});
