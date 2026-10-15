// Renderiza el icono y la pantalla de carga a PNG usando Chromium (Playwright).
// Uso: node scripts/render-icon.cjs   (genera app/assets/icon.png, icon-foreground.png, icon-background.png, splash.png)
const path = require('path');
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require('/opt/node-tools/node_modules/playwright'));
}
(async () => {
  const dir = path.join(__dirname, '..', 'app', 'assets');
  const src = 'file://' + path.join(dir, 'icon-source.html');
  const b = await chromium.launch();
  const shot = async (url, out, w, h, omit = true) => {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    await p.goto(url);
    await p.waitForTimeout(300);
    await p.screenshot({ path: path.join(dir, out), omitBackground: omit });
    await p.close();
  };
  await shot(src, 'icon.png', 1024, 1024, false);
  await shot(src + '?fg=1', 'icon-foreground.png', 1024, 1024, true);
  // fondo del icono adaptativo
  const bg = await b.newPage({ viewport: { width: 1024, height: 1024 } });
  await bg.setContent('<body style="margin:0"><div style="width:1024px;height:1024px;background:radial-gradient(circle at 50% 38%,#4b5ce6,#1d2470 55%,#0b0f24)"></div></body>');
  await bg.screenshot({ path: path.join(dir, 'icon-background.png') });
  // splash 2732x2732 (se recorta al tamaño de cada pantalla)
  const sp = await b.newPage({ viewport: { width: 2732, height: 2732 } });
  await sp.setContent(`<body style="margin:0"><div style="width:2732px;height:2732px;background:radial-gradient(circle at 50% 45%,#2a3590,#0b0f24 60%);display:flex;align-items:center;justify-content:center;flex-direction:column;gap:60px;font-family:'Arial Black',sans-serif">
    <img src="data:image/png;base64,${require('fs').readFileSync(path.join(dir, 'icon.png')).toString('base64')}" style="width:620px;height:620px;border-radius:140px;box-shadow:0 40px 80px rgba(0,0,0,.6)">
    <div style="font-size:190px;color:#ffc21a;text-shadow:0 14px 0 #7a4a00;line-height:1">DIANA</div>
    <div style="font-size:120px;color:#fff;letter-spacing:.1em;text-shadow:0 10px 0 #1d2d86;margin-top:-40px">LEGENDS</div></div></body>`);
  await sp.waitForTimeout(400);
  await sp.screenshot({ path: path.join(dir, 'splash.png') });
  await sp.screenshot({ path: path.join(dir, 'splash-dark.png') });
  await b.close();
  console.log('Iconos y splash generados en', dir);
})();
