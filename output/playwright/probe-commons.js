async (page) => {
  const output = [];
  for (const term of ['vợt cầu lông', 'badminton racket', 'gà đá']) {
    const result = await page.evaluate(async (search) => {
      const params = new URLSearchParams({ action: 'query', generator: 'search', gsrsearch: search,
        gsrnamespace: '6', gsrlimit: '5', prop: 'imageinfo', iiprop: 'url|mime',
        iiurlwidth: '512', format: 'json' });
      const response = await fetch(`/w/api.php?${params}`);
      const data = await response.json();
      return Object.values(data.query?.pages || {}).map((item) => ({ title: item.title,
        url: item.imageinfo?.[0]?.thumburl || item.imageinfo?.[0]?.url }));
    }, term);
    output.push({ term, results: result });
  }
  await (await import('node:fs/promises')).writeFile('output/playwright/probe-results.json', JSON.stringify(output, null, 2));
}
