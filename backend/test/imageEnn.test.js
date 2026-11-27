const test = require('node:test');
const assert = require('node:assert/strict');
const { imageVectorFields, searchImageVectors, indexDefinition } = require('../services/imageVectorIndex');
const vector = Array.from({ length: 768 }, (_, i) => i === 0 ? 1 : 0);
test('SigLIP slots validate dimensions and clear removed images', () => {
  assert.equal(imageVectorFields([vector]).imageVector1, null);
  assert.throws(() => imageVectorFields([[1, 0]]));
  assert.throws(() => imageVectorFields([Array(768).fill(NaN)]));
  assert.ok(indexDefinition.fields.filter(f => f.type === 'vector').every(f => f.similarity === 'cosine' && f.numDimensions === 768));
});
test('ENN uses exact queries, preserves ID filters and best secondary image score', async () => {
  let calls = 0;
  const products = await searchImageVectors({ aggregate: async pipeline => {
    const query = pipeline[0].$vectorSearch;
    assert.equal(query.exact, true);
    assert.equal(query.numCandidates, undefined);
    assert.deepEqual(query.filter, { _id: { $in: ['a', 'b'] } });
    calls++;
    return query.path === 'imageVector1'
      ? [{ _id: 'a', score: 0.99, matchedImage: 'back.jpg' }]
      : [{ _id: 'a', score: 0.8 }, { _id: 'b', score: 0.7 }];
  } }, vector, [{ _id: 'a' }, { _id: 'b' }], 0.75);
  assert.equal(calls, 5);
  assert.equal(products.length, 1);
  assert.equal(products[0].matchedImage, 'back.jpg');
  assert.equal(products[0].score, 0.99);
});
test('empty candidates skip Atlas and Atlas errors propagate', async () => {
  assert.deepEqual(await searchImageVectors({}, vector, [], 0), []);
  await assert.rejects(searchImageVectors({ aggregate: async () => { throw new Error('index unavailable'); } }, vector, [{ _id: 'a' }], 0), /index unavailable/);
});
