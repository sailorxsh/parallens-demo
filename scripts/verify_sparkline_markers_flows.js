async parent => {
 const context = await parent.context().browser().newContext({ viewport: { width: 1600, height: 1000 }, reducedMotion: 'reduce' });
 const page = await context.newPage(), results = [];
 try {
  for (const code of 'ABCDEFG') {
   await page.goto('http://127.0.0.1:8765/#/' + code);
   await page.waitForFunction(() => lastRenderedHash === location.hash && document.querySelector('#main[aria-busy=false]'));
   for (const width of [1366, 1600, 1920]) for (const textScale of [100, 200]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(scale => document.documentElement.style.fontSize = scale + '%', textScale);
    const markers = await page.evaluate(() => [...document.querySelectorAll('.topic-sparkline-marker')].map(marker => {
     const rect = marker.getBoundingClientRect(), svg = marker.parentElement.querySelector('svg'), matrix = svg.getScreenCTM();
     const vertices = [...svg.querySelector('path').getAttribute('d').matchAll(/[ML]([\d.]+),([\d.]+)/g)].map(m => new DOMPoint(+m[1], +m[2]).matrixTransform(matrix));
     return { width: rect.width, height: rect.height, distance: Math.min(...vertices.map(p => Math.hypot(p.x - rect.x - rect.width / 2, p.y - rect.y - rect.height / 2))) };
    }));
    if (!markers.length || markers.some(m => m.width !== 5 || m.height !== 5 || m.distance > .15)) throw Error('Distorted or misplaced marker: ' + JSON.stringify({ code, width, textScale, markers }));
    results.push({ code, width, textScale, markers: markers.length });
   }
   await page.evaluate(() => document.documentElement.style.fontSize = '100%');
  }
  await page.goto('http://127.0.0.1:8765/#/F');
  await page.waitForFunction(() => lastRenderedHash === location.hash && document.querySelector('#main[aria-busy=false]'));
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.locator('#topic-F-metric-51').screenshot({ path: 'output/playwright/v211-visual/fixed-marker.png' });
  return { status: 'PASS', results };
 } finally { await context.close(); }
}
