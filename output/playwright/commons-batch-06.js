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
  }, ["pet feeding bowl","bicycle helmet","bicycle cable lock","phone charger","Bluetooth headset","Badminton racket","running shoes","Camping tent","hand weights","Yoga mat","Flashlight","table tennis table","fishing rod","sports water bottle","Labubu The Monsters"]);
}