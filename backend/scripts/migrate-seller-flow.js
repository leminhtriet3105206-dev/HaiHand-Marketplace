#!/usr/bin/env node
/**
 * Migration Script: Normalize Seller Flow Data (Products/Posts & Variants)
 *
 * Usage:
 *   node backend/scripts/migrate-seller-flow.js --dry-run   (default: preview only, no writes)
 *   node backend/scripts/migrate-seller-flow.js --apply     (apply changes to MongoDB)
 *
 * What this script normalizes:
 * 1. Product/Post `status` in collection `posts`:
 *    - 'PENDING', 'Pending', 'Chờ duyệt' -> 'pending'
 *    - 'APPROVED'                        -> 'active'
 *    - 'SOLD'                            -> 'out_of_stock'
 *    - 'DELETED', 'REJECTED', 'Bị từ chối', 'Đã ẩn' -> 'inactive'
 * 2. Product/Post `variants` array items:
 *    - Ensures `stock` (Number, default 0), `sku` (String, default ''), and `options` (Array) exist.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { Post } = require('../models/Product');

const STATUS_MAP = {
  PENDING: 'pending',
  Pending: 'pending',
  'Chờ duyệt': 'pending',
  APPROVED: 'active',
  SOLD: 'out_of_stock',
  DELETED: 'inactive',
  REJECTED: 'inactive',
  'Bị từ chối': 'inactive',
  'Đã ẩn': 'inactive'
};

async function runMigration({ apply = false } = {}) {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.error('[migrate-seller-flow] Missing MONGO_URI / MONGODB_URI environment variable.');
    process.exitCode = 1;
    return;
  }

  console.log(`[migrate-seller-flow] Mode: ${apply ? 'APPLY (WRITING TO DB)' : 'DRY-RUN (READ ONLY)'}`);
  await mongoose.connect(uri);

  try {
    const legacyStatuses = Object.keys(STATUS_MAP);
    const statusCandidates = await Post.find({
      $or: [
        { status: { $in: legacyStatuses } },
        { 'variants.0': { $exists: true } }
      ]
    }).lean();

    let statusCount = 0;
    let variantCount = 0;
    const bulkOps = [];

    for (const doc of statusCandidates) {
      const updateSet = {};

      if (doc.status && STATUS_MAP[doc.status]) {
        updateSet.status = STATUS_MAP[doc.status];
        statusCount += 1;
      }

      if (Array.isArray(doc.variants) && doc.variants.length > 0) {
        let variantChanged = false;
        const normalizedVariants = doc.variants.map((v) => {
          if (!v || typeof v !== 'object') return v;
          const next = { ...v };
          if (next.stock === undefined || next.stock === null) {
            next.stock = 0;
            variantChanged = true;
          }
          if (next.sku === undefined || next.sku === null) {
            next.sku = '';
            variantChanged = true;
          }
          if (!Array.isArray(next.options)) {
            next.options = [];
            variantChanged = true;
          }
          return next;
        });

        if (variantChanged) {
          updateSet.variants = normalizedVariants;
          variantCount += 1;
        }
      }

      if (Object.keys(updateSet).length > 0) {
        bulkOps.push({
          updateOne: {
            filter: { _id: doc._id },
            update: { $set: updateSet }
          }
        });
      }
    }

    console.log(`[migrate-seller-flow] Scanned ${statusCandidates.length} documents.`);
    console.log(`[migrate-seller-flow] Documents needing status normalization: ${statusCount}`);
    console.log(`[migrate-seller-flow] Documents needing variants normalization: ${variantCount}`);
    console.log(`[migrate-seller-flow] Total bulk update operations prepared: ${bulkOps.length}`);

    if (apply && bulkOps.length > 0) {
      const result = await Post.bulkWrite(bulkOps, { ordered: false });
      console.log(`[migrate-seller-flow] Applied updates. Modified count: ${result.modifiedCount}`);
    } else if (!apply) {
      console.log('[migrate-seller-flow] Dry-run complete. Re-run with --apply to persist changes.');
    }
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const shouldApply = args.includes('--apply') && !args.includes('--dry-run');
  runMigration({ apply: shouldApply }).catch((err) => {
    console.error('[migrate-seller-flow] Error:', err);
    process.exit(1);
  });
}

module.exports = { runMigration, STATUS_MAP };

