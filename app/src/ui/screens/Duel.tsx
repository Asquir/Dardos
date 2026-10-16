// Retos entre amigos sin conexión: se juega un Duelo de 9 dardos y se pasa el código por WhatsApp,
// Telegram… El amigo juega el mismo reto (mismos números dobles) e intenta superar la puntuación.

import { useState } from 'preact/hooks';
import { Modal } from '../components/common';
import { closeModal, go, toast } from '../state';
import { audio } from '../../services/audio';
import { shareText } from '../../services/platform';
import { decodeDuel, newDuelSeed } from '../../meta/duel';
import { duelSetup, launch } from '../../game/launch';
import { MODES } from '../../meta/modes';
import type { MatchResult } from '../../game/match';

export function DuelModal() {
  const [code, setCode] = useState('');
  const parsed = code.length >= 8 ? decodeDuel(code) : null;
  const start = (seed: number, rival?: { name: string; score: number }) => {
    audio.click();
    closeModal();
    go('game');
    launch(duelSetup(seed, rival));
  };
  return (
    <Modal title="⚔️ Reta a un amigo">
      <div class="col">
        <div class="muted" style={{ fontSize: '12px', fontWeight: 800 }}>
          {MODES.duel9.short} No hace falta conexión: el reto viaja en un código.
        </div>
        <ul class="rules-list" style={{ marginTop: 0 }}>
          {MODES.duel9.rules.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <button class="btn block gold" onClick={() => start(newDuelSeed())}>
          Crear reto nuevo
        </button>
        <div class="muted" style={{ textAlign: 'center', fontWeight: 800 }}>— o acepta el de un amigo —</div>
        <input class="form-field duel-code" maxLength={26} placeholder="4F9K-187-JAVI-Q" value={code} onInput={(e) => setCode((e.target as HTMLInputElement).value.toUpperCase())} />
        {code.length >= 8 && !parsed && <div class="duel-bad">Ese código no es válido: revisa que esté completo.</div>}
        {parsed && (
          <div class="duel-ok">
            Reto de <b>{parsed.name}</b>: <b>{parsed.score}</b> puntos a batir
          </div>
        )}
        <button class="btn block blue" disabled={!parsed} onClick={() => parsed && start(parsed.seed, { name: parsed.name, score: parsed.score })}>
          Aceptar el reto
        </button>
      </div>
    </Modal>
  );
}

/** Panel de resultados del reto: comparación con el amigo y el código para compartir. */
export function DuelResultPanel({ r }: { r: MatchResult }) {
  const d = r.duel!;
  const share = async () => {
    audio.click();
    const text = d.rival
      ? `He jugado tu reto en Diana Legends: ${d.score} puntos contra tus ${d.rival.score}. ¿Te atreves con este? Código: ${d.code}`
      : `¡Te reto en Diana Legends! He hecho ${d.score} puntos en el Duelo de 9 dardos. ¿Me superas? Código: ${d.code}`;
    const ok = await shareText('Reto de Diana Legends', text);
    toast(ok ? 'Reto listo para compartir' : 'No se pudo compartir: copia el código', ok ? 'good' : 'bad');
  };
  return (
    <div class="duel-panel">
      {d.rival ? (
        <div class="duel-vs">
          <div class={'dv' + (d.score > d.rival.score ? ' win' : '')}>
            <span>Tú</span>
            <b>{d.score}</b>
          </div>
          <div class="dv-mid">{d.score > d.rival.score ? '🏆' : d.score === d.rival.score ? '🤝' : '😬'}</div>
          <div class={'dv' + (d.rival.score > d.score ? ' win' : '')}>
            <span>{d.rival.name}</span>
            <b>{d.rival.score}</b>
          </div>
        </div>
      ) : (
        <div class="duel-score">
          <span>Tu puntuación</span>
          <b>{d.score}</b>
        </div>
      )}
      <div class="duel-codebox">
        <span>Código del reto</span>
        <b>{d.code}</b>
      </div>
      <button class="btn block gold" onClick={share}>
        📤 {d.rival ? 'Devolver el reto' : 'Retar a un amigo'}
      </button>
    </div>
  );
}
