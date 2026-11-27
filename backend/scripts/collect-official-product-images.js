const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.join(__dirname, '../..');
const output = path.join(root, 'output/official-products.json');
function browser(code) {
  const p = spawnSync(process.execPath, [path.join(root, 'node_modules/@playwright/cli/playwright-cli.js'), 'run-code', code], {cwd:root,encoding:'utf8',timeout:90000,maxBuffer:8*1024*1024});
  const match = p.stdout?.match(/### Result\r?\n([\s\S]*?)\r?\n### /);
  if (!match) throw new Error((p.stderr || p.stdout || p.error?.message).slice(0,500));
  return JSON.parse(match[1]);
}
const collection = process.argv[2];
if (!collection?.startsWith('https://')) throw new Error('Pass public collection URL');
const rows = fs.existsSync(output) ? JSON.parse(fs.readFileSync(output)) : [];
const allUrls = process.argv.includes('--single') ? [collection] : browser(`async page => { const response=await page.goto(${JSON.stringify(collection)}, {waitUntil:'domcontentloaded'}); if(!response.ok())throw new Error('Collection HTTP '+response.status()); await page.locator('a[href*=products]').first().waitFor({state:'attached'}); if(page.url().includes('www.anker.com')) await page.locator('a[href*="Sort_by"]').first().waitFor({state:'attached',timeout:20000}); const main=page.locator('main a[href*=products]'); const links=await main.count() ? main : page.locator('a[href*=products]'); return await links.evaluateAll(as => [...new Set(as.map(a=>a.href.split('?')[0]).filter(u=>u.includes('/products/')))]); }`);
const scoped = allUrls.filter(u=>u.startsWith(collection+'/products/'));
const urls = (scoped.length ? scoped : allUrls).slice(0,Number(process.argv[3]) || 40);
for(const url of urls) {
  if(process.argv.includes('--gallery')) {
    try {
      const images=browser(`async page => {const response=await page.goto(${JSON.stringify(url)},{waitUntil:'domcontentloaded'});if(!response.ok())throw new Error('HTTP '+response.status());return await page.locator('main img').evaluateAll(ms=>ms.map(m=>({title:m.alt,image:m.currentSrc||m.src})).filter(m=>m.image.startsWith('https://') && /mouse/i.test(m.title) && !/feature|scroll|connection|sensor|custom|polling|design/i.test(m.title)).slice(0,10));}`);
      for(const img of images) if(!rows.some(r=>r.image===img.image)){rows.push({...img,source:url,collection});console.log(`${rows.length}: ${img.title}`);}
      fs.writeFileSync(output,JSON.stringify(rows,null,2));
    }catch(e){console.log(`Skipped gallery ${url}: ${e.message}`);}
    continue;
  }
  if(rows.some(r=>r.source===url)) continue;
  try {
    const item = browser(`async page => { const response=await page.goto(${JSON.stringify(url)}, {waitUntil:'domcontentloaded'}); if(!response.ok())throw new Error('Product HTTP '+response.status()); return await page.locator('meta[property^="og:"]').evaluateAll(ms=>Object.fromEntries(ms.map(m=>[m.getAttribute('property'),m.content]))); }`);
    if(!item['og:image'] || !item['og:title'] || item['og:title'].includes('Charge Fast, Live More')) throw new Error('Missing product metadata');
    rows.push({title:item['og:title'],image:item['og:image'],source:url,collection});
    fs.writeFileSync(output,JSON.stringify(rows,null,2));
    console.log(`${rows.length}: ${item['og:title']}`);
  } catch(e) {console.log(`Skipped ${url}: ${e.message}`);}
}
