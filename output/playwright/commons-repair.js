async (page) => {
  await page.goto('https://commons.wikimedia.org/wiki/Special:MediaSearch?type=image');
  await page.evaluate(async (queries) => {
    const stored = JSON.parse(localStorage.getItem('haihand-commons') || '{}');
    for (const query of queries) {
      const params = new URLSearchParams({ action: 'query', generator: 'search', gsrsearch: query,
        gsrnamespace: '6', gsrlimit: '10', prop: 'imageinfo', iiprop: 'url|mime', iiurlwidth: '500', format: 'json' });
      try {
        const data = await (await fetch('/w/api.php?' + params)).json();
        stored[query] = Object.values(data.query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0))
          .map((item) => ({ title: item.title, mime: item.imageinfo?.[0]?.mime || '',
            imageUrl: item.imageinfo?.[0]?.thumburl || item.imageinfo?.[0]?.url || '',
            sourceUrl: 'https://commons.wikimedia.org/wiki/' + encodeURIComponent(item.title).replace(/%3A/i, ':') }))
          .filter((item) => /^image\/(jpeg|png|webp)$/.test(item.mime) && item.imageUrl &&
            !/\b(icon|logo|map|diagram|drawing|illustration|poster|flag|symbol)\b/i.test(item.title))
          .slice(0, 6);
      } catch (error) { stored[query] = { error: String(error.message || error) }; }
      localStorage.setItem('haihand-commons', JSON.stringify(stored));
    }
  }, ['dog', 'dog kibble food', 'turtle aquarium', 'dog food bowl', 'wireless earbuds',
    'baby stroller', 'computer desk', 'massage chair', 'textile roller machine',
    'plastic slide sandals', 'pajamas clothing']);
}
