const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');

require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });

const CHECK_URLS = process.argv.includes('--check-urls');
const OUTPUT = path.join(__dirname, '../../output/product-image-audit.json');

function imageUrls(product) {
  const values = [...(Array.isArray(product.images) ? product.images : []), product.image];
  return [...new Set(values.filter(value => typeof value === 'string' && value.trim()).map(value => value.trim()))];
}

function isHttpUrl(value) {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

async function checkUrl(url) {
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000)
    });
    return { url, ok: response.ok, status: response.status };
  } catch (error) {
    return { url, ok: false, status: 0, error: error.message };
  }
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI || process.env.MONGODB_ATLAS_URI);
  try {
    const products = await mongoose.connection.collection('posts')
      .find({}, { projection: { title: 1, name: 1, category: 1, images: 1, image: 1 } })
      .toArray();

    const rows = products.map(product => ({
      id: String(product._id),
      title: product.title || product.name || '',
      category: product.category || '',
      images: imageUrls(product)
    }));
    const missing = rows.filter(product => product.images.length === 0);
    const malformed = rows.filter(product => product.images.some(url => !isHttpUrl(url)));
    const validUrls = [...new Set(rows.flatMap(product => product.images).filter(isHttpUrl))];
    const checks = CHECK_URLS ? await Promise.all(validUrls.map(checkUrl)) : [];
    const failed = new Map(checks.filter(check => !check.ok).map(check => [check.url, check]));
    const unavailable = CHECK_URLS
      ? rows.filter(product => product.images.length && product.images.every(url => !isHttpUrl(url) || failed.has(url)))
      : [];
    const report = {
      checkedAt: new Date().toISOString(),
      summary: {
        totalProducts: rows.length,
        missingImages: missing.length,
        malformedImageUrls: malformed.length,
        uniqueUrls: validUrls.length,
        checkedUrls: checks.length,
        failedUrls: failed.size,
        productsWithNoReachableImage: unavailable.length
      },
      missing,
      malformed,
      failedUrls: [...failed.values()],
      unavailable
    };

    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.writeFileSync(OUTPUT, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report.summary));
    console.log(`Report: ${OUTPUT}`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
