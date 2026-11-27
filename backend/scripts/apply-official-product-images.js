const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({path:path.join(__dirname,'../.env'),quiet:true});
const mongoose = require('mongoose');
const { EJSON } = require('bson');
const cloud = require('cloudinary').v2;
const { embedImage, IMAGE_EMBEDDING_MODEL } = require('../services/imageEmbeddingService');
const { imageVectorFields } = require('../services/imageVectorIndex');
const output = path.join(__dirname,'../../output');
async function main() {
 const [group, indexes] = process.argv.slice(2);
 if(!group || !indexes) throw new Error('Pass existing group title and visually reviewed image indexes');
 const manifest=JSON.parse(fs.readFileSync(path.join(output,'official-images/manifest.json')));
 const titlesFile=path.join(output,'reviewed-image-titles.json');
 const titles=fs.existsSync(titlesFile) ? JSON.parse(fs.readFileSync(titlesFile)) : {};
 const approved=indexes.split(',').map(Number).map(i=>{const r=manifest.find(x=>x.index===i);if(!r)throw new Error(`Missing image ${i}`);return r;});
 if(new Set(approved.map(r=>r.hash)).size!==approved.length) throw new Error('Duplicate image selection');
 await mongoose.connect(process.env.MONGO_URI,{serverSelectionTimeoutMS:20000});
 const posts=mongoose.connection.db.collection('posts');
 const existing=await posts.find({imageSourceHash:{$in:approved.map(r=>r.hash)}},{projection:{imageSourceHash:1}}).toArray();
 const candidates=approved.filter(r=>!existing.some(x=>x.imageSourceHash===r.hash));
 const targetId=process.argv.find(a=>a.startsWith('--id='))?.slice(5);
 if(targetId && candidates.length!==1)throw new Error('Single-ID update requires one unused image');
 const filter=targetId ? {_id:new mongoose.Types.ObjectId(targetId)} : {title:group,_id:{$gte:new mongoose.Types.ObjectId('6b2c00000000000000000000'),$lt:new mongoose.Types.ObjectId('6b2d00000000000000000000')}};
 const rows=await posts.find(filter).sort({_id:1}).toArray();
 const plan=rows.slice(0,candidates.length).map((row,i)=>({row,source:candidates[i]}));
 console.log(JSON.stringify({group,remaining:rows.length,updates:plan.map(p=>({id:p.row._id,title:p.source.title,index:p.source.index}))},null,2));
 if(!process.argv.includes('--apply') || !plan.length)return;
 fs.writeFileSync(path.join(output,`official-backup-${Date.now()}.json`),EJSON.stringify(plan.map(p=>p.row)));
 cloud.config({cloud_name:process.env.CLOUDINARY_CLOUD_NAME,api_key:process.env.CLOUDINARY_API_KEY,api_secret:process.env.CLOUDINARY_API_SECRET});
 for(const {row,source} of plan) {
  const bytes=fs.readFileSync(source.file);
  const vector=await embedImage(`data:image/jpeg;base64,${bytes.toString('base64')}`);
  if(vector.length!==768 || !vector.every(Number.isFinite))throw new Error('Invalid vector');
  const uploaded=await cloud.uploader.upload(source.file,{folder:'haihand-demo/individual-products',public_id:`${row._id}-${source.hash.slice(0,12)}`,overwrite:false});
  const title=process.argv.find(a=>a.startsWith('--title='))?.slice(8) || `${group} ${titles[source.index] || source.title}`.trim();
  const description=`${title}. Ảnh sản phẩm tham khảo từ website hãng, phục vụ demo tìm kiếm bằng hình ảnh. Giá và thông tin tình trạng là dữ liệu demo. Nguồn: ${source.source}`;
  const fields={title,name:title,description,ragText:`${title}. ${description}`,images:[uploaded.secure_url],imageSourceUrl:source.source,imageSourceImage:source.image,imageSourceHash:source.hash,imageEmbedding:vector,imageEmbeddings:[vector],imageEmbeddingImages:[uploaded.secure_url],imageEmbeddingModel:IMAGE_EMBEDDING_MODEL,...imageVectorFields([vector])};
  const result=await posts.updateOne({_id:row._id,title:row.title,images:row.images},{$set:fields});
  if(result.modifiedCount!==1) throw new Error(`Concurrent change on ${row._id}; stopped without overwriting it`);
  fs.appendFileSync(path.join(output,'official-image-updates.jsonl'),JSON.stringify({id:String(row._id),title,source:source.source,image:uploaded.secure_url,hash:source.hash,at:new Date().toISOString()})+'\n');
  console.log(`Updated ${row._id}: ${title}`);
 }
 const verified=await posts.countDocuments({_id:{$in:plan.map(p=>p.row._id)},'imageVector0.767':{$exists:true},imageEmbeddingModel:IMAGE_EMBEDDING_MODEL,$expr:{$eq:['$images','$imageEmbeddingImages']}});
 if(verified!==plan.length)throw new Error(`Verification failed: ${verified}/${plan.length}`);
 console.log(`VERIFIED ${verified}/${plan.length}: images and 768-dimensional embeddings match`);
}
main().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>mongoose.disconnect());
