const fs=require('node:fs');
const path=require('node:path');
require('dotenv').config({path:path.join(__dirname,'../.env'),quiet:true});
const mongoose=require('mongoose');
async function main(){
 await mongoose.connect(process.env.MONGO_URI,{serverSelectionTimeoutMS:20000});
 const rows=await mongoose.connection.db.collection('posts').find({},{projection:{title:1,images:1,imageEmbeddingImages:1,imageVector0:1,imageSourceHash:1}}).toArray();
 const groups=new Map();
 for(const p of rows)for(const url of new Set(p.images||[])){if(!groups.has(url))groups.set(url,[]);groups.get(url).push({id:String(p._id),title:p.title});}
 const duplicates=[...groups].filter(([,posts])=>posts.length>1).map(([url,posts])=>({url,count:posts.length,posts})).sort((a,b)=>b.count-a.count);
 const repaired=rows.filter(p=>p.imageSourceHash);
 const badEmbeddings=repaired.filter(p=>p.imageVector0?.length!==768 || !p.imageVector0.every(Number.isFinite) || JSON.stringify(p.images)!==JSON.stringify(p.imageEmbeddingImages));
 const report={at:new Date().toISOString(),summary:{total:rows.length,duplicateGroups:duplicates.length,affectedProducts:new Set(duplicates.flatMap(g=>g.posts.map(p=>p.id))).size,officialImagesUpdated:repaired.length,updatedWithInvalidEmbeddings:badEmbeddings.length},duplicates};
 fs.writeFileSync(path.join(__dirname,'../../output/duplicate-product-images.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report.summary));
 console.log(JSON.stringify(duplicates.slice(0,10).map(g=>({title:g.posts[0].title,count:g.count}))));
}
main().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>mongoose.disconnect());
