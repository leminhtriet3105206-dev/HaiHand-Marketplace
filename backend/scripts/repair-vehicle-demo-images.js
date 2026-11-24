const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const mongoose = require('mongoose');
const sharp = require('sharp');
const cloud = require('cloudinary').v2;
const { embedImage, IMAGE_EMBEDDING_MODEL } = require('../services/imageEmbeddingService');
const { imageVectorFields } = require('../services/imageVectorIndex');
const items = [
 ['6af173a0c91caafe16621f03', 'Mũ bảo hiểm xe đạp'],
 ['6af173a0c91caafe16621f04', 'Khóa dây số xe đạp'],
 ['6af17dbc2e06332d9bb40e8a', 'Xe đạp địa hình'],
 ['6af17dc02e06332d9bb40ea4', 'Xe máy số màu trắng'],
 ['6af17dc02e06332d9bb40ea5', 'Mũ bảo hiểm fullface'],
 ['6af17dc02e06332d9bb40ea6', 'Camera hành trình ô tô'],
 ['6af17dc12e06332d9bb40ea7', 'Bơm lốp xe di động'],
 ['6af17dc12e06332d9bb40ea8', 'Chai dầu nhớt động cơ']
];
async function main() {
 await mongoose.connect(process.env.MONGO_URI);
 cloud.config({cloud_name:process.env.CLOUDINARY_CLOUD_NAME,api_key:process.env.CLOUDINARY_API_KEY,api_secret:process.env.CLOUDINARY_API_SECRET});
 const c = mongoose.connection.db.collection('posts');
 const output = path.join(__dirname, '../../output');
 const rows = await c.find({_id:{$in:items.map(([id])=>new mongoose.Types.ObjectId(id))}}).toArray();
 if(rows.length !== 8) throw new Error('Expected 8 existing vehicle demo products');
 fs.writeFileSync(path.join(output, `vehicle-backup-${Date.now()}.json`),JSON.stringify(rows));
 const sheet = path.join(output,'imagegen/product-sheets/vehicles.png');
 const {width,height} = await sharp(sheet).metadata();
 for(let i=0;i<items.length;i++) {
  const [id,title]=items[i];
  const local=path.join(output,`imagegen/product-crops/vehicle-${i}.jpg`);
  await sharp(sheet).extract({left:Math.floor(i%4*width/4)+3,top:Math.floor(i/4)*Math.floor(height/2)+3,width:Math.floor(width/4)-6,height:Math.floor(height/2)-6}).jpeg({quality:92}).toFile(local);
  const upload=await cloud.uploader.upload(local,{folder:'haihand-demo/vehicles',public_id:id,overwrite:false});
  const vector=await embedImage(upload.secure_url);
  const description=`${title}. Ảnh minh họa AI và dữ liệu demo, không đại diện cho thương hiệu hoặc mẫu hàng thực tế.`;
  await c.updateOne({_id:new mongoose.Types.ObjectId(id)},{$set:{title,name:title,description,images:[upload.secure_url],ragText:`${title}. ${description}`,imageEmbedding:vector,imageEmbeddings:[vector],imageEmbeddingImages:[upload.secure_url],imageEmbeddingModel:IMAGE_EMBEDDING_MODEL,...imageVectorFields([vector])}});
  console.log(`Updated ${i+1}/8: ${title}`);
 }
}
main().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>mongoose.disconnect());
