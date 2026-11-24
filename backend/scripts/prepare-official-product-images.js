const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const dir = path.join(__dirname,'../../output/official-images');
async function main() {
 fs.mkdirSync(dir,{recursive:true});
 const rows=JSON.parse(fs.readFileSync(path.join(dir,'../official-products.json')));
 const selected=[];
 for(let i=0;i<rows.length;i++) {
  const r=rows[i];
  const file=path.join(dir,`${i}.jpg`);
  try {
   if(!fs.existsSync(file)) {
    const response=await fetch(r.image,{signal:AbortSignal.timeout(30000)});
    if(!response.ok) throw new Error(`HTTP ${response.status}`);
    await sharp(Buffer.from(await response.arrayBuffer())).flatten({background:'#fff'}).resize(1000,1000,{fit:'inside',withoutEnlargement:true}).jpeg({quality:92}).toFile(file);
   }
   const hash=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
   if(selected.some(x=>x.hash===hash)) {console.log(`Duplicate excluded: ${i} ${r.title}`);continue;}
   selected.push({...r,index:i,file,hash});
  } catch(e) {console.log(`Skipped ${i}: ${e.message}`);}
 }
 fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(selected,null,2));
 for(let start=0;start<selected.length;start+=24) {
  const batch=selected.slice(start,start+24);
  const tiles=await Promise.all(batch.map(async(r,i)=>({input:await sharp(r.file).resize(220,200,{fit:'contain',background:'#fff'}).extend({bottom:30,background:'#fff'}).composite([{input:Buffer.from(`<svg width="220" height="30"><text x="8" y="22" font-size="18">${r.index}</text></svg>`),top:200,left:0}]).png().toBuffer(),left:i%6*220,top:Math.floor(i/6)*230})));
  await sharp({create:{width:1320,height:Math.ceil(batch.length/6)*230,channels:3,background:'#fff'}}).composite(tiles).jpeg({quality:90}).toFile(path.join(dir,`review-${start}.jpg`));
 }
 console.log(`Prepared ${selected.length} unique images`);
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
