const fs = require('node:fs');
const path = require('node:path');

const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, 'catalog.json')));
const terms = new Map(JSON.parse(fs.readFileSync(path.join(__dirname, 'search-terms.json'))).map((row) => [row.id, row]));
const found = JSON.parse(fs.readFileSync(path.join(__dirname, 'commons-search.json')));
const previousDirectory = path.resolve(__dirname, '..', 'image-search-evaluation-2026-11-15');
const previous = new Map(JSON.parse(fs.readFileSync(path.join(previousDirectory, 'labels.json')))
  .flatMap((row) => row.expectedIds.map((id) => [id, row])));
const stop = new Set(['the', 'and', 'for', 'with', 'old', 'new', 'womens', 'mens', 'a', 'an', 'of', 'in', 'on', 'to', 'no']);
const words = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ')
  .filter((word) => word.length > 2 && !stop.has(word));

function pick(query, candidates) {
  const requested = words(query);
  const scored = candidates.map((candidate, index) => {
    const title = candidate.title.replace(/^File:/, '').replace(/\.[^.]+$/, '').toLowerCase();
    const available = new Set(words(title));
    const matching = requested.filter((word) => available.has(word)).length;
    const exact = title.includes(query.toLowerCase());
    const suspicious = /necklace|painting|museum|film|book cover|advert|historic|portrait|festival|exhibition/i.test(title);
    return { index, score: matching + (exact ? 3 : 0) - (suspicious ? 2 : 0), matching };
  }).sort((a, b) => b.score - a.score || a.index - b.index);
  const best = scored[0];
  if (!best || best.score < (requested.length > 1 ? 2 : 1)) return null;
  return candidates[best.index];
}

const rows = catalog.map((product) => {
  const term = terms.get(product.id);
  const old = previous.get(product.id);
  if (old) return {
    ...product, query: term?.queryEn || '', sourceStatus: 'previously_reviewed',
    sourceUrl: old.sourceUrl, image: path.relative(__dirname, path.join(previousDirectory, old.image)).replace(/\\/g, '/'),
    reviewNote: old.reviewNote || '', trainable: old.trainable !== false
  };
  const query = term?.queryEn || '';
  if (!query) return { ...product, query, sourceStatus: 'ambiguous_product', sourceUrl: '', image: '' };
  const source = pick(query, Array.isArray(found[query]) ? found[query] : []);
  return { ...product, query, sourceStatus: source ? 'needs_visual_review' : 'no_reliable_source',
    sourceUrl: source?.sourceUrl || '', imageUrl: source?.imageUrl || '', sourceTitle: source?.title || '', image: '' };
});
fs.writeFileSync(path.join(__dirname, 'source-picks.json'), JSON.stringify(rows, null, 2));
console.log(JSON.stringify(rows.reduce((counts, row) => {
  counts[row.sourceStatus] = (counts[row.sourceStatus] || 0) + 1;
  return counts;
}, {}), null, 2));
