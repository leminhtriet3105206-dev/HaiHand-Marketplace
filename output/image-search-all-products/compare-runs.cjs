const fs = require('node:fs');
const path = require('node:path');

const directory = __dirname;
const before = new Map(JSON.parse(fs.readFileSync(path.join(directory, 'api-results-before.json')))
  .filter((row) => row.status === 'done').map((row) => [row.id, row]));
const after = JSON.parse(fs.readFileSync(path.join(directory, 'api-results-after.json')));
const common = after.filter((row) => row.status === 'done' && before.has(row.id));
const metrics = (rows, select) => ({
  cases: rows.length,
  targetHits: rows.filter((row) => select(row).targetHit).length,
  returnedCards: rows.reduce((total, row) => total + select(row).products.length, 0),
  empty: rows.filter((row) => !select(row).products.length).length
});
const summary = {
  comparableCases: common.length,
  before: metrics(common, (row) => before.get(row.id)),
  after: metrics(common, (row) => row),
  changed: common.filter((row) => row.targetHit !== before.get(row.id).targetHit ||
    row.products.map((item) => item.id).join('|') !== before.get(row.id).products.map((item) => item.id).join('|'))
    .map((row) => ({ id: row.id, title: row.title,
      beforeIds: before.get(row.id).products.map((item) => item.id),
      afterIds: row.products.map((item) => item.id) }))
};
fs.writeFileSync(path.join(directory, 'before-after-comparison.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ comparableCases: summary.comparableCases, before: summary.before, after: summary.after,
  changedCases: summary.changed.length }));
