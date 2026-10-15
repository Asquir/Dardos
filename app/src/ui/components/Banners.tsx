// Avisos tipo notificación que bajan desde arriba: cofre listo, eventos, misiones…

import { useEffect, useRef, useState } from 'preact/hooks';
import { useStore } from '../../core/store';
import { ui, dismissBanner } from '../state';
import { matchStore } from '../../game/match';
import { audio } from '../../services/audio';
import { haptics } from '../../services/haptics';

const SHOW_MS = 4300;

export function BannerHost() {
  const s = useStore(ui);
  const m = useStore(matchStore);
  const b = s.banners[0];
  const busy = !!s.chest || s.screen === 'onboarding' || s.screen === 'matchmaking' || (s.screen === 'game' && m?.phase !== 'ended');
  const show = !!b && (!busy || !!b.inGame);
  const [out, setOut] = useState(false);
  const startY = useRef<number | null>(null);
  const [dy, setDy] = useState(0);

  const close = (run: boolean) => {
    if (!b || out) return;
    setOut(true);
    if (run && b.onTap) {
      audio.click();
      b.onTap();
    }
    const id = b.id;
    setTimeout(() => {
      dismissBanner(id);
      setOut(false);
      setDy(0);
    }, 320);
  };

  useEffect(() => {
    if (!show || !b) return;
    audio.notify();
    haptics.light();
    const t = setTimeout(() => close(false), SHOW_MS);
    return () => clearTimeout(t);
  }, [show ? b?.id : 0]);

  if (!show || !b) return null;
  return (
    <div class="banner-wrap">
      <div
        key={b.id}
        class={`banner tone-${b.tone}${out ? ' out' : ''}`}
        style={dy < 0 ? { transform: `translateY(${dy}px)`, transition: 'none' } : undefined}
        onPointerDown={(e) => (startY.current = e.clientY)}
        onPointerMove={(e) => startY.current !== null && setDy(Math.min(0, e.clientY - startY.current))}
        onPointerUp={() => {
          const d = dy;
          startY.current = null;
          if (d < -24) close(false);
          else {
            setDy(0);
            close(true);
          }
        }}
        role="status"
      >
        <div class="b-ico">
          <span>{b.icon}</span>
        </div>
        <div class="b-txt">
          <div class="b-top">
            <span class="b-app">DIANA LEGENDS</span>
            <span class="b-time">ahora</span>
          </div>
          <b>{b.title}</b>
          <span>{b.text}</span>
        </div>
        <i class="b-timer" style={{ animationDuration: SHOW_MS + 'ms' }} />
        <i class="b-shine" />
      </div>
    </div>
  );
}
