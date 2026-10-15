// Genera capturas para App Store / Google Play (1290x2796) con Playwright.
// Requiere el servidor de desarrollo:  npm run dev   y luego:  node scripts/store-screenshots.cjs [url]
const path = require('path');
const fs = require('fs');
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require('/opt/node-tools/node_modules/playwright'));
}
const URL = process.argv[2] || 'http://127.0.0.1:5173/';
const OUT = path.join(__dirname, '..', 'docs', 'capturas');
fs.mkdirSync(OUT, { recursive: true });

// misma rotación que app/src/meta/liveEvents.ts
function liveKey() {
  const ids = ['bull_fever', 'treble_night', 'lightning_cup', 'cricket_masters', 'checkout_kings', 'max_madness'];
  const n = Math.floor((Date.now() - Date.UTC(2026, 0, 2, 12)) / (3 * 86400e3));
  return `${ids[((n % ids.length) + ids.length) % ids.length]}_${n}`;
}

const profile = (extra = {}) => ({
  v: 1, id: 'demo0001', name: 'TúMismo', nameSet: true, country: 'ES',
  avatar: { skin: 3, hair: 'quiff', hairColor: 1, eyes: 2, beard: 'stubble', glasses: 'none', hat: 'none', shirt: 'champion', shirtColor: 10, number: 18, body: 2, face: 'square', eyeStyle: 'sharp', brows: 'thick', mouth: 'grin', nose: 'button', marks: 'none', pants: 'jeans', pantsColor: 1, shoes: 'hightops', shoesColor: 0, acc: 'chain' },
  coins: 12850, gems: 640, xp: 300, level: 21, trophies: 1340, bestTrophies: 1340, selectedArena: 3,
  items: { b_brass: { level: 5, cards: 3 }, b_t90: { level: 4, cards: 12 }, b_dragon: { level: 2, cards: 1 }, b_gold: { level: 3, cards: 4 }, s_nylon_w: { level: 4, cards: 2 }, s_carbon: { level: 3, cards: 9 }, s_gold: { level: 1, cards: 0 }, f_red: { level: 4, cards: 1 }, f_flames: { level: 3, cards: 6 }, f_galaxy: { level: 2, cards: 3 }, f_spain: { level: 3, cards: 8 }, f_dragon: { level: 1, cards: 0 }, b_copper: { level: 3, cards: 2 }, b_sapphire: { level: 2, cards: 5 } },
  equipped: { barrel: 'b_dragon', shaft: 's_gold', flight: 'f_dragon' },
  boardSkin: 'classic', ownedBoards: ['classic'], emotes: ['gg', 'nice', 'oops', 'go'], ownedEmotes: ['gg', 'nice', 'oops', 'go'], ownedAvatar: ['hair:quiff', 'shirt:champion', 'eyeStyle:sharp', 'shoes:hightops', 'acc:chain', 'hair:spiky', 'shirt:hoodie', 'glasses:sun'],
  chests: [{ type: 'gold', arena: 3, readyAt: null }, { type: 'epic', arena: 3, readyAt: Date.now() + 3 * 3600e3 }, { type: 'silver', arena: 3, readyAt: null }, null],
  seenEvent: liveKey(),
  liveEvent: { key: liveKey(), points: 690, claimed: [0, 1, 2, 3], tickets: 4, ticketAt: Date.now() - 600e3, adTickets: { day: '', count: 0 }, played: 9 },
  winCycle: 4, freeChestAt: Date.now() - 1000, adChests: { day: '', count: 0 },
  tutorial: { done: true, tips: [] }, createdAt: Date.now() - 2 * 86400e3, lastLogin: Date.now(),
  ...extra,
});

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await ctx.addInitScript((p) => localStorage.setItem('diana_profile_v1', JSON.stringify(p)), profile());
  const page = await ctx.newPage();
  const ready = () => page.waitForFunction(() => !document.getElementById('splash'), null, { timeout: 180000 });
  const shot = async (name, wait = 2500) => {
    await page.waitForTimeout(wait);
    await page.screenshot({ path: path.join(OUT, name + '.png'), timeout: 120000 });
    console.log('captura', name);
  };
  await page.goto(URL + '?q=high');
  await ready();
  if (process.env.ONLY_AVATAR) {
    await page.evaluate(() => window.__diana.go('avatar'));
    await shot('7-personaje', 7000);
    await page.evaluate(() => window.__diana.go('profile'));
    await shot('8-perfil', 6000);
    return b.close();
  }
  if (!process.env.ONLY_GAME) await shot('1-inicio', 4000);
  // partida: lanzamientos de demostración con celebración de 180
  await page.evaluate(async () => {
    const d = window.__diana;
    const { botPlayer, humanPlayer, launch } = await import('/src/game/launch.ts');
    d.go('game');
    const m = launch({ type: 'training', config: { mode: 'x01', start: 501, doubleOut: true }, arena: 4, players: [humanPlayer(), botPlayer(4, { name: 'La Pantera', seed: 77 })], starter: 0 });
    window.__m = m;
  });
  await page.waitForFunction(() => window.__m?.ui.phase === 'aim', null, { timeout: 120000, polling: 500 });
  await page.evaluate(() => (window.__diana.gameView().intro = 0));
  await page.waitForTimeout(3000);
  for (let i = 0; i < 2; i++) {
    await page.evaluate(() => {
      const v = window.__diana.gameView();
      v.aim.x = 0; v.aim.y = 103;
      v.autoRelease();
    });
    await page.waitForFunction(() => window.__m?.ui.phase === 'aim', null, { timeout: 120000, polling: 300 });
    await page.waitForTimeout(1500);
  }
  await shot('2-partida', 500);
  if (process.env.ONLY_GAME) return b.close();
  await page.evaluate(() => window.__diana.go('collection'));
  await shot('3-coleccion', 5000);
  await page.evaluate(() => window.__diana.go('shop'));
  await shot('4-tienda', 3000);
  await page.evaluate(() => window.__diana.go('events'));
  await shot('5-eventos', 3000);
  await page.evaluate(() => window.__diana.go('liveEvent'));
  await shot('6-evento-en-vivo', 3000);
  await page.evaluate(() => window.__diana.go('avatar'));
  await shot('7-personaje', 7000);
  await page.evaluate(() => window.__diana.go('profile'));
  await shot('8-perfil', 6000);
  await b.close();
})();
