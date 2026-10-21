import test from 'node:test';
import assert from 'node:assert/strict';
import {comparisonCapacity,restoreComparison} from '../site/comparison.js';
test('comparison capacity follows the largest catalog genus, including unmapped species',()=>{
  assert.deepEqual(comparisonCapacity([{genus:'B'},{genus:'A'},{genus:'A'}]),{genus:'A',count:2});
  assert.equal(comparisonCapacity(Array.from({length:93},()=>({genus:'Cybaeus'}))).count,93);
});
test('URL restoration retains species without environment information, deduplicates, bounds and rejects unknown IDs',()=>{
  const species=[{id:'1',environmentCount:1},{id:'2',environmentCount:0},{id:'3',environmentCount:2}];
  assert.deepEqual(restoreComparison('2,1,2,unknown,<script>,3',species,3),['2','1','3']);
  assert.deepEqual(restoreComparison('2,1,3',species,2),['2','1']);
  assert.deepEqual(restoreComparison(null,species,3),[]);
});
