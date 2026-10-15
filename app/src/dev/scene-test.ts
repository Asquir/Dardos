// Página de pruebas visuales del motor 3D (solo desarrollo): /scene-test.html?mode=game&arena=0
import '@fontsource/lilita-one';
import { engine } from '../engine/renderer';
import { gameView } from '../engine/gameView';
import { previewView, itemThumbnail } from '../engine/previewView';
import { scoreAt } from '@shared/board';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('gl') as HTMLCanvasElement;
const t0 = performance.now();
const W = window as any;
document.fonts.load('40px "Lilita One"').finally(async () => {
  engine.init(canvas, (params.get('q') as 'high') ?? 'high');
  const mode = params.get('mode') ?? 'game';
  const look = { barrel: params.get('b') ?? 'b_t90', shaft: params.get('s') ?? 's_carbon', flight: params.get('f') ?? 'f_flames' };
  if (mode === 'chest') {
    const { chestView, chestIcon } = await import('../engine/chestView');
    const c = chestView();
    c.present((params.get('type') as 'gold') ?? 'gold');
    engine.setView(c);
    engine.start();
    if (params.get('open')) setTimeout(() => c.open(), 1200);
    const img = new Image();
    img.src = chestIcon('epic');
    img.style.cssText = 'position:fixed;left:0;bottom:0;width:110px;background:#223';
    document.body.appendChild(img);
    W.__done = true;
    return;
  }
  if (mode === 'avatar') {
    const { avatarView, avatarPortrait } = await import('../engine/avatar');
    const { randomAvatar } = await import('../game/launch');
    const a = avatarView();
    a.set(randomAvatar(Number(params.get('seed') ?? 3)));
    engine.setView(a);
    engine.start();
    const div = document.createElement('div');
    div.style.cssText = 'position:fixed;left:0;bottom:0;display:flex;flex-wrap:wrap;gap:4px;background:#223';
    for (let i = 0; i < 8; i++) {
      const img = new Image();
      img.src = avatarPortrait(randomAvatar(i * 17 + 1));
      img.style.width = '90px';
      div.appendChild(img);
    }
    document.body.appendChild(div);
    W.__done = true;
    return;
  }
  if (mode === 'preview') {
    const p = previewView();
    p.setLook(look, 'epic');
    engine.setView(p);
    engine.start();
    W.__ready = performance.now() - t0;
    if (params.get('thumbs')) {
      const ids = params.get('thumbs')!.split(',');
      const div = document.createElement('div');
      div.style.cssText = 'position:fixed;left:0;bottom:0;display:flex;flex-wrap:wrap;gap:4px;background:#223';
      for (const id of ids) {
        const img = new Image();
        img.src = itemThumbnail(id);
        img.style.width = '90px';
        div.appendChild(img);
      }
      document.body.appendChild(div);
    }
    W.__done = true;
    return;
  }
  const v = gameView();
  W.__v = v;
  v.setArena(Number(params.get('arena') ?? 0));
  if (mode === 'menu') v.setMenuMode(true);
  else v.setGameMode(false);
  engine.setView(v);
  engine.start();
  W.__ready = performance.now() - t0;
  if (mode === 'game') {
    await new Promise((r) => setTimeout(r, 100));
    const pts = [[2, 103], [-8, 101], [6, 158]];
    for (const [x, y] of pts) {
      await v.throwDart({ x, y, look });
      v.highlight(scoreAt(x, y));
    }
    if (params.get('aim')) v.humanAim({ look, stats: { acc: 40, stab: 40, ctrl: 40 }, sensitivity: 1, control: 'flick' });
  }
  W.__done = true;
});
