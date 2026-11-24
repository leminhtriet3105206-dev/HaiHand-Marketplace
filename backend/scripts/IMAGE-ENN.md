# Image retrieval: Atlas ENN + cosine

SigLIP `Xenova/siglip-base-patch16-224` creates 768-dimensional image vectors in the backend. Atlas Auto Embedding is not used.

`indexProductImage()` saves the original per-image vectors and mirrors up to five of them into `imageVector0` through `imageVector4` on the same product. Missing/removed slots are cleared. The bulk RAG indexing script writes these fields too.

`imageVectorSearch()` resolves catalog, price, location and excluded-photo filters to eligible IDs, then `searchImageVectors()` queries each image field with `$vectorSearch`, `exact: true`, and no `numCandidates`. The Atlas index uses `similarity: cosine`, `numDimensions: 768` and an `_id` filter. The backend merges results by product, keeps its highest scoring image and returns at most 20 candidates for the existing relevance checks. Cosine is evaluated in Atlas; the text-search branch still has its own local scoring.

Each image slot returns the top 20 products, which is sufficient to find the overall top 20 under maximum-per-image scoring (apart from arbitrary ordering of exact ties). Five queries retain the existing five-image cap without introducing a separate collection to synchronize.

From backend:

```
npm run image:setup-enn
npm run image:verify-enn
npm run test:image
```

Setup copies existing embeddings without invoking the model, and creates or extends the existing image index without removing its original fields. Index builds are asynchronous: rerun verification after Atlas reports READY. Verification checks that a stored image vector retrieves its own product with a score near 1.

Default index: `IMAGE_ENN_INDEX_NAME`, otherwise `IMAGE_VECTOR_INDEX_NAME`, otherwise `product_image_vector_index`.

Products with no successful SigLIP embedding cannot be retrieved visually. `npm run rag:index` creates embeddings for existing catalog data (requires accessible image URLs, model resources and configured LM Studio for its text branch). Upload and edit API paths continue to refresh embeddings automatically. Direct database writes do not trigger the model. Atlas indexing is eventually consistent, so changes may not be searchable immediately.

Atlas errors propagate to the existing image-search unavailable response; the system does not silently substitute ANN or local scanning. Report live ENN verification separately from end-to-end vision/LM Studio testing.
