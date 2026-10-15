// Genera una demo web de un solo archivo HTML (sin dependencias externas salvo Google Fonts).
// Uso: node scripts/build-web-demo.mjs [salida.html]
import { build } from 'vite';
import preact from '@preact/preset-vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'app');
const out = process.argv[2] ?? path.join(root, 'dist-demo', 'diana-legends.html');
const tmp = path.join(root, 'dist-demo-tmp');
const empty = path.join(tmp, 'empty.css');
fs.mkdirSync(tmp, { recursive: true });
fs.writeFileSync(empty, '');

await build({
  root,
  configFile: false,
  logLevel: 'warn',
  plugins: [preact()],
  base: './',
  resolve: {
    alias: [
      { find: '@shared', replacement: path.join(root, '..', 'shared') },
      // las fuentes se cargan desde Google Fonts en la demo
      { find: /^@fontsource\/.*\.css$/, replacement: empty },
    ],
  },
  build: {
    outDir: path.join(tmp, 'dist'),
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    modulePreload: false,
    target: 'es2020',
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});

const dist = path.join(tmp, 'dist');
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const assets = fs.readdirSync(path.join(dist, 'assets'));
const js = assets.filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(path.join(dist, 'assets', f), 'utf8')).join('\n');
const css = assets.filter((f) => f.endsWith('.css')).map((f) => fs.readFileSync(path.join(dist, 'assets', f), 'utf8')).join('\n');
const headStyle = html.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
const body = html.match(/<body>([\s\S]*?)<\/body>/)?.[1] ?? '';
const bodyNoScripts = body.replace(/<script[\s\S]*?<\/script>/g, '');
const page = `<title>Diana Legends</title>
<meta name="theme-color" content="#0b0f24">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Lilita+One&family=Nunito:wght@600;700;800;900&display=swap">
<style>:root{color-scheme:dark;background:#0b0f24}html,body{height:100%}${headStyle}
${css}</style>
${bodyNoScripts.trim()}
<script type="module">
${js.replace(/<\/script/gi, '<\\/script')}
</script>
`;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, page);
fs.rmSync(tmp, { recursive: true, force: true });
console.log('Demo web:', out, (page.length / 1024 / 1024).toFixed(2) + ' MB');
