const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../../output/image-search-all-products');
const readJson = (name) => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));

function loadExamples() {
  const apiResults = readJson('api-results-v3.json');
  const grades = [
    ...readJson('returned-card-grades-final.json').grades,
    ...readJson('returned-card-grades-v3-extra.json')
  ];
  const textRanks = readJson('image-text-ranks.json');
  const gradeByPair = new Map(grades.map((row) => [`${row.queryId}|${row.returnedId}`, row.grade]));
  const ranksByQuery = new Map(textRanks.map((row) => [
    row.id,
    new Map(row.returned.map((candidate) => [candidate.id, candidate.textRank]))
  ]));

  return apiResults.flatMap((query) => (query.products || []).map((product) => {
    const grade = gradeByPair.get(`${query.id}|${product.id}`);
    if (!grade) throw new Error(`Thiếu nhãn cho ${query.id} -> ${product.id}`);
    const textRank = ranksByQuery.get(query.id)?.get(product.id) ?? null;
    return {
      queryId: query.id,
      productId: product.id,
      label: grade === 'same_type' ? 1 : 0,
      grade,
      score: Number(product.similarity),
      textRank,
      features: [
        Number(product.similarity),
        textRank ? 1 / Math.sqrt(textRank) : 0,
        textRank && textRank <= 10 ? 1 : 0,
        textRank == null ? 1 : 0
      ]
    };
  }));
}

function sigmoid(value) {
  return 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, value))));
}

function fitScaler(rows) {
  const size = rows[0].features.length;
  const mean = Array(size).fill(0);
  const scale = Array(size).fill(1);
  for (const row of rows) row.features.forEach((value, index) => { mean[index] += value; });
  mean.forEach((_, index) => { mean[index] /= rows.length; });
  mean.forEach((_, index) => {
    const variance = rows.reduce((sum, row) => sum + (row.features[index] - mean[index]) ** 2, 0) / rows.length;
    scale[index] = Math.sqrt(variance) || 1;
  });
  return { mean, scale };
}

function transform(features, scaler) {
  return features.map((value, index) => (value - scaler.mean[index]) / scaler.scale[index]);
}

function train(rows) {
  const scaler = fitScaler(rows);
  const weights = Array(rows[0].features.length + 1).fill(0);
  const positives = rows.filter((row) => row.label).length;
  const positiveWeight = rows.length / (2 * positives);
  const negativeWeight = rows.length / (2 * (rows.length - positives));

  for (let epoch = 0; epoch < 4000; epoch += 1) {
    const gradient = Array(weights.length).fill(0);
    for (const row of rows) {
      const features = transform(row.features, scaler);
      const probability = sigmoid(weights[0] + features.reduce((sum, value, index) => sum + value * weights[index + 1], 0));
      const sampleWeight = row.label ? positiveWeight : negativeWeight;
      const error = (probability - row.label) * sampleWeight;
      gradient[0] += error;
      features.forEach((value, index) => { gradient[index + 1] += error * value; });
    }
    const learningRate = 0.08 / Math.sqrt(1 + epoch / 500);
    weights.forEach((weight, index) => {
      const regularization = index === 0 ? 0 : 0.02 * weight;
      weights[index] -= learningRate * (gradient[index] / rows.length + regularization);
    });
  }
  return { weights, scaler };
}

function predict(row, model) {
  const features = transform(row.features, model.scaler);
  return sigmoid(model.weights[0] + features.reduce((sum, value, index) => sum + value * model.weights[index + 1], 0));
}

function metrics(rows, accepts) {
  let tp = 0; let fp = 0; let fn = 0; let tn = 0;
  rows.forEach((row, index) => {
    const accepted = accepts[index];
    if (accepted && row.label) tp += 1;
    else if (accepted) fp += 1;
    else if (row.label) fn += 1;
    else tn += 1;
  });
  const precision = tp / (tp + fp) || 0;
  const recall = tp / (tp + fn) || 0;
  return { tp, fp, fn, tn, precision, recall, f1: 2 * precision * recall / (precision + recall) || 0 };
}

function selectThreshold(rows, model) {
  let best = null;
  for (let threshold = 0.05; threshold <= 0.95; threshold += 0.01) {
    const result = metrics(rows, rows.map((row) => predict(row, model) >= threshold));
    if (result.recall < 0.9) continue;
    const beta = 0.5;
    const fBeta = (1 + beta ** 2) * result.precision * result.recall
      / (beta ** 2 * result.precision + result.recall) || 0;
    if (!best || fBeta > best.fBeta) best = { threshold: Number(threshold.toFixed(2)), fBeta, ...result };
  }
  return best || { threshold: 0.5 };
}

function addCounts(total, value) {
  for (const key of ['tp', 'fp', 'fn', 'tn']) total[key] += value[key];
}

function finishCounts(counts) {
  const precision = counts.tp / (counts.tp + counts.fp) || 0;
  const recall = counts.tp / (counts.tp + counts.fn) || 0;
  return { ...counts, precision, recall, f1: 2 * precision * recall / (precision + recall) || 0 };
}

function main() {
  const examples = loadExamples();
  const queryIds = [...new Set(examples.map((row) => row.queryId))].sort();
  const folds = Array.from({ length: 5 }, () => []);
  queryIds.forEach((id, index) => folds[index % folds.length].push(id));
  const learnedCounts = { tp: 0, fp: 0, fn: 0, tn: 0 };
  const top10Counts = { tp: 0, fp: 0, fn: 0, tn: 0 };
  const foldResults = [];

  folds.forEach((testIds, fold) => {
    const testSet = new Set(testIds);
    const training = examples.filter((row) => !testSet.has(row.queryId));
    const testing = examples.filter((row) => testSet.has(row.queryId));
    const model = train(training);
    const selected = selectThreshold(training, model);
    const learned = metrics(testing, testing.map((row) => predict(row, model) >= selected.threshold));
    const top10 = metrics(testing, testing.map((row) => row.textRank != null && row.textRank <= 10));
    addCounts(learnedCounts, learned);
    addCounts(top10Counts, top10);
    foldResults.push({ fold: fold + 1, queries: testIds.length, cards: testing.length, threshold: selected.threshold, learned, top10 });
  });

  const model = train(examples);
  const selected = selectThreshold(examples, model);
  const learned = finishCounts(learnedCounts);
  const top10 = finishCounts(top10Counts);
  const accepted = learned.f1 > top10.f1 && learned.precision > top10.precision;
  const artifact = {
    version: 1,
    trainedAt: new Date().toISOString(),
    featureNames: ['siglipScore', 'inverseSqrtTextRank', 'textRankTop10', 'missingTextRank'],
    labels: { positive: ['same_type'], negative: ['related', 'wrong_type', 'wrong_catalog_photo'] },
    training: { cards: examples.length, queries: queryIds.length, positives: examples.filter((row) => row.label).length },
    crossValidation: { folds: 5, learned, top10, accepted, foldResults },
    threshold: selected.threshold,
    weights: model.weights,
    scaler: model.scaler
  };
  const reportOutput = path.join(root, 'trained-image-reranker.json');
  const modelOutput = path.resolve(__dirname, '../data/image-reranker.json');
  fs.writeFileSync(reportOutput, `${JSON.stringify(artifact, null, 2)}\n`);
  fs.writeFileSync(modelOutput, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(JSON.stringify({ reportOutput, modelOutput, ...artifact.crossValidation, threshold: artifact.threshold }, null, 2));
}

main();
