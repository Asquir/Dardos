// Utilidades de texto: limpieza de nombres y filtro básico de palabras ofensivas (requisito de las tiendas para contenido de usuarios).

const BAD = ['puta', 'puto', 'mierda', 'cabron', 'cabrón', 'gilipollas', 'polla', 'coño', 'joder', 'maricon', 'maricón', 'zorra', 'hijoputa', 'fuck', 'shit', 'bitch', 'cunt', 'nigger', 'nigga', 'fag', 'retard', 'nazi', 'hitler', 'pendejo', 'verga', 'culero', 'pinche'];

export function censor(text: string): string {
  let out = text;
  for (const w of BAD) {
    const re = new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    out = out.replace(re, (m) => m[0] + '*'.repeat(Math.max(1, m.length - 1)));
  }
  return out;
}

export function cleanName(name: string): string {
  return censor(name.replace(/[^\p{L}\p{N} _.\-'"]/gu, '').trim().slice(0, 16));
}
