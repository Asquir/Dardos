// Simulaciones para el navegador: anuncio de prueba y compra de prueba (sin cobro real).

import { useEffect, useState } from 'preact/hooks';
import { useStore } from '../../core/store';
import { mockAd } from '../../services/ads';
import { mockPurchase } from '../../services/iap';

export function MockLayers() {
  const ad = useStore(mockAd);
  const buy = useStore(mockPurchase);
  return (
    <>
      {ad && <MockAd kind={ad.kind} done={ad.done} />}
      {buy && (
        <div class="modal-back" style={{ zIndex: 210 }}>
          <div class="modal" style={{ background: '#f2f2f7', color: '#111', border: 'none' }}>
            <div style={{ padding: '18px', textAlign: 'center' }}>
              <div style={{ fontWeight: 900, fontSize: '13px', color: '#888' }}>COMPRA DE PRUEBA (modo desarrollo)</div>
              <div style={{ fontWeight: 900, fontSize: '20px', margin: '8px 0' }}>{buy.product.title}</div>
              <div style={{ fontWeight: 800, fontSize: '28px' }}>{buy.product.price}</div>
              <div style={{ fontSize: '12px', color: '#666', margin: '8px 0 14px' }}>En el móvil se abrirá la ventana real de App Store / Google Play.</div>
              <div class="row">
                <button class="btn gray grow" onClick={() => buy.done(false)}>
                  Cancelar
                </button>
                <button class="btn blue grow" onClick={() => buy.done(true)}>
                  Comprar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function MockAd({ kind, done }: { kind: 'interstitial' | 'rewarded'; done: (ok: boolean) => void }) {
  const total = kind === 'rewarded' ? 5 : 3;
  const [left, setLeft] = useState(total);
  useEffect(() => {
    const id = setInterval(() => setLeft((l) => Math.max(0, l - 1)), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div class="mock-ad">
      <div class="adbox">
        <div style={{ fontSize: '14px', opacity: 0.8 }}>ANUNCIO DE PRUEBA</div>
        <div>🎯 Tu anuncio aquí</div>
        <div style={{ fontSize: '14px', opacity: 0.8 }}>{kind === 'rewarded' ? 'Vídeo con recompensa' : 'Anuncio intersticial'}</div>
      </div>
      <div style={{ fontWeight: 800 }}>{left > 0 ? `Recompensa en ${left}s` : '¡Listo!'}</div>
      <button class="btn small gray skip" disabled={left > 0 && kind === 'interstitial' && left > total - 2} onClick={() => done(left === 0)}>
        {left > 0 ? (kind === 'rewarded' ? 'Saltar (sin premio)' : 'Cerrar') : 'Cerrar ✕'}
      </button>
    </div>
  );
}
