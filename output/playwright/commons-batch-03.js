async (page) => {
  await page.goto('https://commons.wikimedia.org/wiki/Special:MediaSearch?type=image');
  await page.evaluate(async (queries) => {
    const stored = JSON.parse(localStorage.getItem('haihand-commons') || '{}');
    for (const query of queries) {
      if (stored[query]) continue;
      try {
        const params = new URLSearchParams({ action: 'query', generator: 'search',
          gsrsearch: query, gsrnamespace: '6', gsrlimit: '8', prop: 'imageinfo',
          iiprop: 'url|mime', iiurlwidth: '500', format: 'json' });
        const response = await fetch('/w/api.php?' + params);
        if (!response.ok) throw Error('HTTP ' + response.status);
        const data = await response.json();
        stored[query] = Object.values(data.query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0))
          .map((item) => ({ title: item.title, mime: item.imageinfo?.[0]?.mime || '',
            imageUrl: item.imageinfo?.[0]?.thumburl || item.imageinfo?.[0]?.url || '',
            sourceUrl: 'https://commons.wikimedia.org/wiki/' + encodeURIComponent(item.title).replace(/%3A/i, ':') }))
          .filter((item) => /^image\/(jpeg|png|webp)$/.test(item.mime) && item.imageUrl &&
            !/\b(icon|logo|map|diagram|drawing|illustration|poster|flag|symbol|advertisement)\b/i.test(item.title))
          .slice(0, 4);
      } catch (error) {
        stored[query] = { error: String(error.message || error) };
      }
      localStorage.setItem('haihand-commons', JSON.stringify(stored));
    }
  }, ["Small ornamental bonsai","motorbike helmet","panasonic refrigerator","electric ashtray","sofa","daikin air conditioner","red whiskered bulbul bird","green iguana","industrial fabric roller","townhouse","ampere meter","Heat press machine","Apple Watch Ultra","Steam iron","JBL karaoke speakers"]);
}