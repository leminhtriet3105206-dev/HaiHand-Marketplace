const path=require('node:path');
require('dotenv').config({path:path.join(__dirname,'../.env'),quiet:true});
const mongoose=require('mongoose');
const {embedImage}=require('../services/imageEmbeddingService');
const {searchImageVectors}=require('../services/imageVectorIndex');
async function main(){
 await mongoose.connect(process.env.MONGO_URI,{serverSelectionTimeoutMS:20000});
 const posts=mongoose.connection.db.collection('posts');
 const catalog=await posts.find({status:{$in:['active','APPROVED']}},{projection:{_id:1}}).toArray();
 for(const term of ['Củ sạc Anker','Micro thu âm FIFINE','Chuột máy tính Keychron']){
  const p=await posts.findOne({title:{$regex:`^${term}`},imageSourceHash:{$exists:true}});
  if(!p)throw new Error(`Missing sample ${term}`);
  const query=await embedImage(p.images[0]);
  const hits=await searchImageVectors({aggregate:pipeline=>posts.aggregate(pipeline).toArray()},query,catalog,0);
  const rank=hits.findIndex(h=>String(h._id)===String(p._id));
  if(rank<0 || hits[rank].score<0.999)throw new Error(`New image absent from vector results: ${p.title}`);
  console.log(JSON.stringify({title:p.title,rank:rank+1,score:hits[rank].score,queryDimensions:query.length}));
 }
}
main().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>mongoose.disconnect());
