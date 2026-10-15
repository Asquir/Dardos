// Iconos vectoriales propios con degradados (sin dependencias externas).

import type { JSX } from 'preact';

type P = { class?: string; style?: JSX.CSSProperties };

/** Degradados compartidos: se montan una vez en la raíz de la app. */
export function IconDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <defs>
        <linearGradient id="gGold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#fff3a0" />
          <stop offset="0.5" stop-color="#ffc21a" />
          <stop offset="1" stop-color="#d98200" />
        </linearGradient>
        <linearGradient id="gGoldD" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#ffb000" />
          <stop offset="1" stop-color="#a85a00" />
        </linearGradient>
        <linearGradient id="gGem" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#b9fbff" />
          <stop offset="0.45" stop-color="#3fd6ff" />
          <stop offset="1" stop-color="#7a3cff" />
        </linearGradient>
        <linearGradient id="gGemD" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#2a9dff" />
          <stop offset="1" stop-color="#5a1fd6" />
        </linearGradient>
        <linearGradient id="gBlue" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#9fd6ff" />
          <stop offset="1" stop-color="#2a6dff" />
        </linearGradient>
        <linearGradient id="gGreen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#9dffbf" />
          <stop offset="1" stop-color="#16a34a" />
        </linearGradient>
        <linearGradient id="gRed" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#ff9aa9" />
          <stop offset="1" stop-color="#d4123a" />
        </linearGradient>
        <linearGradient id="gPurple" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#e6b8ff" />
          <stop offset="1" stop-color="#7a2be2" />
        </linearGradient>
        <linearGradient id="gWhite" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#ffffff" />
          <stop offset="1" stop-color="#b8c4ff" />
        </linearGradient>
        <linearGradient id="gWood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#c47a3a" />
          <stop offset="1" stop-color="#6b3a14" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export const Coin = (p: P) => (
  <svg viewBox="0 0 40 40" {...p}>
    <circle cx="20" cy="21.5" r="16" fill="url(#gGoldD)" />
    <circle cx="20" cy="19.5" r="16" fill="url(#gGold)" stroke="#a85a00" stroke-width="1.5" />
    <circle cx="20" cy="19.5" r="11" fill="none" stroke="#fff6c0" stroke-width="2" opacity="0.7" />
    <path d="M15 13h5.5a6.5 6.5 0 010 13H15z M18 16v7h2.5a3.5 3.5 0 000-7z" fill="#b86b00" fill-rule="evenodd" />
    <ellipse cx="14" cy="12" rx="4" ry="2.5" fill="#fff" opacity="0.6" transform="rotate(-30 14 12)" />
  </svg>
);

export const Gem = (p: P) => (
  <svg viewBox="0 0 40 40" {...p}>
    <path d="M10 8h20l7 9-17 19L3 17z" fill="url(#gGemD)" />
    <path d="M10 6h20l7 9-17 19L3 15z" fill="url(#gGem)" stroke="#3b1fa0" stroke-width="1.2" stroke-linejoin="round" />
    <path d="M3 15h34M14 6l-4 9 10 19 10-19-4-9M10 15l10-9 10 9" fill="none" stroke="#fff" stroke-width="1" opacity="0.6" />
    <path d="M12 8h7l-5 6z" fill="#fff" opacity="0.7" />
  </svg>
);

export const Trophy = (p: P) => (
  <svg viewBox="0 0 40 40" {...p}>
    <path d="M9 7H5a5 5 0 005 8M31 7h4a5 5 0 01-5 8" fill="none" stroke="url(#gGold)" stroke-width="3" />
    <path d="M10 4h20v8c0 7-4.5 12-10 12S10 19 10 12z" fill="url(#gGold)" stroke="#a85a00" stroke-width="1.4" />
    <rect x="17" y="23" width="6" height="6" fill="url(#gGoldD)" />
    <rect x="12" y="29" width="16" height="6" rx="2" fill="url(#gGold)" stroke="#a85a00" stroke-width="1.4" />
    <path d="M14 7v5c0 3 1 5 3 7" stroke="#fff" stroke-width="2" fill="none" opacity="0.6" stroke-linecap="round" />
  </svg>
);

export const Star = (p: P) => (
  <svg viewBox="0 0 40 40" {...p}>
    <path d="M20 4l4.9 10 11 1.6-8 7.8 1.9 11L20 29.2 10.2 34.4l1.9-11-8-7.8 11-1.6z" fill="url(#gGold)" stroke="#a85a00" stroke-width="1.5" stroke-linejoin="round" />
    <path d="M20 9l3 6.2" stroke="#fff" stroke-width="2" opacity="0.7" stroke-linecap="round" />
  </svg>
);

export const XpStar = (p: P) => (
  <svg viewBox="0 0 40 40" {...p}>
    <path d="M20 4l4.9 10 11 1.6-8 7.8 1.9 11L20 29.2 10.2 34.4l1.9-11-8-7.8 11-1.6z" fill="url(#gBlue)" stroke="#123f9a" stroke-width="1.5" stroke-linejoin="round" />
    <text x="20" y="25" text-anchor="middle" font-family="Lilita One, sans-serif" font-size="10" fill="#fff">XP</text>
  </svg>
);

export const ShopIco = (p: P) => (
  <svg viewBox="0 0 40 40" {...p}>
    <path d="M6 15h28l-2.5 19a2 2 0 01-2 1.8H10.5a2 2 0 01-2-1.8z" fill="url(#gRed)" stroke="#7a0a1f" stroke-width="1.4" />
    <path d="M13 16V11a7 7 0 0114 0v5" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" />
    <circle cx="20" cy="25" r="5" fill="url(#gGold)" stroke="#a85a00" />
  </svg>
);

export const DartIco = (p: P) => (
  <svg viewBox="0 0 40 40" {...p}>
    <g transform="rotate(45 20 20)">
      <rect x="18.5" y="2" width="3" height="10" rx="1" fill="#e6e8ee" />
      <rect x="16.5" y="11" width="7" height="12" rx="3" fill="url(#gGold)" stroke="#a85a00" />
      <rect x="18.8" y="23" width="2.4" height="7" fill="#333" />
      <path d="M20 28l-7 10h14z" fill="url(#gRed)" stroke="#7a0a1f" />
      <path d="M20 28v10" stroke="#fff" stroke-width="1" />
    </g>
  </svg>
);

export const TargetIco = (p: P) => (
  <svg viewBox="0 0 40 40" {...p}>
    <circle cx="20" cy="20" r="17" fill="#1a1a1a" stroke="#fff" stroke-width="1.5" />
    <circle cx="20" cy="20" r="13" fill="url(#gRed)" />
    <circle cx="20" cy="20" r="9.5" fill="#efe3c4" />
    <circle cx="20" cy="20" r="6" fill="url(#gGreen)" />
    <circle cx="20" cy="20" r="2.8" fill="#d4123a" />
  </svg>
);

export const SocialIco = (p: P) => (
  <svg viewBox="0 0 40 40" {...p}>
    <circle cx="27" cy="13" r="6" fill="url(#gPurple)" />
    <path d="M17 34c0-7 4-11 10-11s10 4 10 11z" fill="url(#gPurple)" />
    <circle cx="15" cy="14" r="7" fill="url(#gBlue)" stroke="#123f9a" />
    <path d="M2 35c0-8 5-12 13-12s13 4 13 12z" fill="url(#gBlue)" stroke="#123f9a" />
  </svg>
);

export const EventsIco = (p: P) => (
  <svg viewBox="0 0 40 40" {...p}>
    <rect x="5" y="8" width="30" height="27" rx="5" fill="url(#gWhite)" stroke="#3a4aa6" stroke-width="1.5" />
    <rect x="5" y="8" width="30" height="9" rx="4" fill="url(#gRed)" />
    <rect x="11" y="4" width="4" height="8" rx="2" fill="#555" />
    <rect x="25" y="4" width="4" height="8" rx="2" fill="#555" />
    <path d="M20 19l2.2 4.5 5 .7-3.6 3.5.9 4.9-4.5-2.4-4.5 2.4.9-4.9-3.6-3.5 5-.7z" fill="url(#gGold)" stroke="#a85a00" />
  </svg>
);

export const Gear = (p: P) => (
  <svg viewBox="0 0 24 24" {...p}>
    <path
      fill="#cfd6ff"
      d="M19.4 13a7.5 7.5 0 000-2l2.1-1.6-2-3.5-2.5 1a7.3 7.3 0 00-1.7-1L15 3.3h-4l-.4 2.6a7.3 7.3 0 00-1.7 1l-2.5-1-2 3.5L6.6 11a7.5 7.5 0 000 2l-2.1 1.6 2 3.5 2.5-1a7.3 7.3 0 001.7 1l.4 2.6h4l.4-2.6a7.3 7.3 0 001.7-1l2.5 1 2-3.5zM13 15.5a3.5 3.5 0 110-7 3.5 3.5 0 010 7z"
      transform="translate(-1 0)"
    />
  </svg>
);

export const Plus = (p: P) => (
  <svg viewBox="0 0 24 24" {...p}>
    <path d="M12 5v14M5 12h14" stroke="#fff" stroke-width="3.2" stroke-linecap="round" />
  </svg>
);

export const Close = (p: P) => (
  <svg viewBox="0 0 24 24" {...p}>
    <path d="M6 6l12 12M18 6L6 18" stroke="#fff" stroke-width="3.2" stroke-linecap="round" />
  </svg>
);

export const Back = (p: P) => (
  <svg viewBox="0 0 24 24" {...p}>
    <path d="M15 5l-7 7 7 7" stroke="#fff" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
);

export const Fwd = (p: P) => (
  <svg viewBox="0 0 24 24" {...p}>
    <path d="M9 5l7 7-7 7" stroke="#fff" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
);

export const Check = (p: P) => (
  <svg viewBox="0 0 24 24" {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" stroke="#fff" stroke-width="3.4" fill="none" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
);

export const Lock = (p: P) => (
  <svg viewBox="0 0 24 24" {...p}>
    <rect x="4.5" y="10" width="15" height="11" rx="2.5" fill="url(#gGold)" stroke="#a85a00" />
    <path d="M8 10V7.5a4 4 0 018 0V10" fill="none" stroke="#e8e8e8" stroke-width="2.4" />
    <circle cx="12" cy="15.5" r="1.8" fill="#7a4a00" />
  </svg>
);

export const Crown = (p: P) => (
  <svg viewBox="0 0 40 40" {...p}>
    <path d="M5 30l-2-18 9 7 8-12 8 12 9-7-2 18z" fill="url(#gGold)" stroke="#a85a00" stroke-width="1.5" stroke-linejoin="round" />
    <rect x="5" y="30" width="30" height="5" rx="1.5" fill="url(#gGoldD)" />
    <circle cx="20" cy="22" r="3" fill="#ff2d55" />
    <circle cx="11" cy="25" r="2" fill="#2a9dff" />
    <circle cx="29" cy="25" r="2" fill="#2a9dff" />
  </svg>
);

export const Clock = (p: P) => (
  <svg viewBox="0 0 24 24" {...p}>
    <circle cx="12" cy="12" r="9" fill="url(#gWhite)" stroke="#3a4aa6" stroke-width="1.6" />
    <path d="M12 7v5l3.5 2" stroke="#1b2152" stroke-width="2.2" fill="none" stroke-linecap="round" />
  </svg>
);

export const AdIco = (p: P) => (
  <svg viewBox="0 0 24 24" {...p}>
    <rect x="2" y="5" width="20" height="14" rx="3" fill="url(#gPurple)" stroke="#3b1566" />
    <path d="M10 9l5 3-5 3z" fill="#fff" />
  </svg>
);

export const GiftIco = (p: P) => (
  <svg viewBox="0 0 40 40" {...p}>
    <rect x="6" y="16" width="28" height="20" rx="3" fill="url(#gRed)" stroke="#7a0a1f" />
    <rect x="4" y="11" width="32" height="8" rx="2.5" fill="url(#gRed)" stroke="#7a0a1f" />
    <rect x="17.5" y="11" width="5" height="25" fill="url(#gGold)" />
    <path d="M20 11c-3-6-10-6-9-2s9 2 9 2c0 0 8 2 9-2s-6-4-9 2z" fill="url(#gGold)" stroke="#a85a00" />
  </svg>
);

export const WheelIco = (p: P) => (
  <svg viewBox="0 0 40 40" {...p}>
    <circle cx="20" cy="20" r="16" fill="#fff" stroke="#a85a00" stroke-width="2" />
    {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
      const a0 = (i / 8) * Math.PI * 2;
      const a1 = ((i + 1) / 8) * Math.PI * 2;
      const c = ['#ff4d6d', '#3f9bff', '#ffb31a', '#11a86a'][i % 4];
      return <path key={i} d={`M20 20L${20 + Math.cos(a0) * 15} ${20 + Math.sin(a0) * 15}A15 15 0 0 1 ${20 + Math.cos(a1) * 15} ${20 + Math.sin(a1) * 15}z`} fill={c} />;
    })}
    <circle cx="20" cy="20" r="4" fill="url(#gGold)" stroke="#a85a00" />
    <path d="M16 1h8l-4 7z" fill="url(#gGold)" stroke="#a85a00" />
  </svg>
);

export const ScrollIco = (p: P) => (
  <svg viewBox="0 0 40 40" {...p}>
    <rect x="8" y="5" width="24" height="30" rx="3" fill="#f6e7c1" stroke="#8a5a2a" stroke-width="1.5" />
    <path d="M13 13h14M13 19h14M13 25h9" stroke="#8a5a2a" stroke-width="2" stroke-linecap="round" />
    <circle cx="29" cy="30" r="7" fill="url(#gGreen)" stroke="#0b6b2f" />
    <path d="M26 30l2 2 4-4" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" />
  </svg>
);

export const CalendarIco = (p: P) => (
  <svg viewBox="0 0 40 40" {...p}>
    <rect x="5" y="8" width="30" height="27" rx="5" fill="url(#gWhite)" stroke="#3a4aa6" stroke-width="1.5" />
    <rect x="5" y="8" width="30" height="9" rx="4" fill="url(#gBlue)" />
    <text x="20" y="31" text-anchor="middle" font-family="Lilita One, sans-serif" font-size="14" fill="#1b2152">7</text>
    <path d="M28 4l1.3 2.7 3 .4-2.2 2.1.5 3-2.6-1.4-2.6 1.4.5-3-2.2-2.1 3-.4z" fill="url(#gGold)" />
  </svg>
);

export const PassIco = (p: P) => (
  <svg viewBox="0 0 40 40" {...p}>
    <path d="M7 6h26v28l-13-6-13 6z" fill="url(#gPurple)" stroke="#3b1566" stroke-width="1.5" stroke-linejoin="round" />
    <path d="M20 10l2.4 4.8 5.3.8-3.8 3.7.9 5.2-4.8-2.5-4.8 2.5.9-5.2-3.8-3.7 5.3-.8z" fill="url(#gGold)" stroke="#a85a00" />
  </svg>
);

export const ChatIco = (p: P) => (
  <svg viewBox="0 0 24 24" {...p}>
    <path d="M4 4h16a2 2 0 012 2v10a2 2 0 01-2 2H10l-5 4v-4H4a2 2 0 01-2-2V6a2 2 0 012-2z" fill="url(#gWhite)" stroke="#3a4aa6" stroke-width="1.2" />
    <circle cx="8" cy="11" r="1.4" fill="#3a4aa6" />
    <circle cx="12" cy="11" r="1.4" fill="#3a4aa6" />
    <circle cx="16" cy="11" r="1.4" fill="#3a4aa6" />
  </svg>
);

export const PauseIco = (p: P) => (
  <svg viewBox="0 0 24 24" {...p}>
    <rect x="6" y="5" width="4" height="14" rx="1.5" fill="#fff" />
    <rect x="14" y="5" width="4" height="14" rx="1.5" fill="#fff" />
  </svg>
);

export const GlobeIco = (p: P) => (
  <svg viewBox="0 0 40 40" {...p}>
    <circle cx="20" cy="20" r="16" fill="url(#gBlue)" stroke="#123f9a" stroke-width="1.5" />
    <path d="M8 13c4 1 6 4 5 8s3 5 2 9M24 5c-2 4 2 6 6 6s4 6 1 9-1 7-4 10" fill="none" stroke="#7dffa6" stroke-width="3" stroke-linecap="round" opacity="0.9" />
    <ellipse cx="14" cy="11" rx="4" ry="2.5" fill="#fff" opacity="0.45" transform="rotate(-30 14 11)" />
  </svg>
);

export const BoltIco = (p: P) => (
  <svg viewBox="0 0 24 24" {...p}>
    <path d="M13 2L4 14h7l-1 8 9-12h-7z" fill="url(#gGold)" stroke="#a85a00" stroke-linejoin="round" />
  </svg>
);

export const ShareIco = (p: P) => (
  <svg viewBox="0 0 24 24" {...p}>
    <circle cx="18" cy="5" r="3" fill="#fff" />
    <circle cx="6" cy="12" r="3" fill="#fff" />
    <circle cx="18" cy="19" r="3" fill="#fff" />
    <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" stroke="#fff" stroke-width="2" />
  </svg>
);

export const InfoIco = (p: P) => (
  <svg viewBox="0 0 24 24" {...p}>
    <circle cx="12" cy="12" r="10" fill="url(#gBlue)" />
    <rect x="10.8" y="10" width="2.4" height="8" rx="1" fill="#fff" />
    <circle cx="12" cy="7" r="1.5" fill="#fff" />
  </svg>
);

export const SwordsIco = (p: P) => (
  <svg viewBox="0 0 40 40" {...p}>
    <path d="M6 6l20 20M34 6L14 26" stroke="url(#gWhite)" stroke-width="5" stroke-linecap="round" />
    <path d="M22 30l8-8M10 22l8 8" stroke="url(#gGold)" stroke-width="5" stroke-linecap="round" />
    <circle cx="31" cy="31" r="3.5" fill="url(#gRed)" />
    <circle cx="9" cy="31" r="3.5" fill="url(#gRed)" />
  </svg>
);

export const MedalIco = (p: P) => (
  <svg viewBox="0 0 40 40" {...p}>
    <path d="M12 3h6l4 12h-6zM28 3h-6l-4 12h6z" fill="url(#gRed)" />
    <circle cx="20" cy="25" r="11" fill="url(#gGold)" stroke="#a85a00" stroke-width="1.5" />
    <path d="M20 18l2 4.2 4.6.6-3.3 3.2.8 4.6-4.1-2.2-4.1 2.2.8-4.6-3.3-3.2 4.6-.6z" fill="#fff6c0" />
  </svg>
);

export const RefreshIco = (p: P) => (
  <svg viewBox="0 0 24 24" {...p}>
    <path d="M20 12a8 8 0 11-2.3-5.7M20 4v5h-5" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
);

export const NoAdsIco = (p: P) => (
  <svg viewBox="0 0 40 40" {...p}>
    <rect x="4" y="9" width="32" height="22" rx="5" fill="url(#gPurple)" stroke="#3b1566" />
    <text x="20" y="25" text-anchor="middle" font-family="Lilita One, sans-serif" font-size="12" fill="#fff">ADS</text>
    <circle cx="20" cy="20" r="17" fill="none" stroke="#ff2d55" stroke-width="4" />
    <path d="M8 8l24 24" stroke="#ff2d55" stroke-width="4" />
  </svg>
);

export const UserIco = (p: P) => (
  <svg viewBox="0 0 24 24" {...p}>
    <circle cx="12" cy="8" r="4.5" fill="#fff" />
    <path d="M3 21c0-5 4-8 9-8s9 3 9 8z" fill="#fff" />
  </svg>
);

/** Icono de gemas en montón (tienda). */
export const GemPile = ({ n = 1, ...p }: P & { n?: number }) => (
  <svg viewBox="0 0 80 80" {...p}>
    {Array.from({ length: Math.min(7, n + 1) }).map((_, i) => {
      const pos = [
        [40, 40],
        [24, 48],
        [56, 48],
        [32, 26],
        [50, 26],
        [16, 32],
        [64, 32],
      ][i];
      const s = i === 0 ? 1.1 : 0.8;
      return (
        <g key={i} transform={`translate(${pos[0] - 20 * s} ${pos[1] - 20 * s}) scale(${s})`}>
          <path d="M10 8h20l7 9-17 19L3 17z" fill="url(#gGemD)" />
          <path d="M10 6h20l7 9-17 19L3 15z" fill="url(#gGem)" stroke="#3b1fa0" stroke-width="1.2" />
          <path d="M12 8h7l-5 6z" fill="#fff" opacity="0.7" />
        </g>
      );
    })}
  </svg>
);

export const CoinPile = ({ n = 1, ...p }: P & { n?: number }) => (
  <svg viewBox="0 0 80 80" {...p}>
    {Array.from({ length: Math.min(6, n + 2) }).map((_, i) => (
      <g key={i} transform={`translate(${12 + (i % 3) * 18} ${46 - Math.floor(i / 3) * 18 - (i % 2) * 4})`}>
        <ellipse cx="14" cy="16" rx="14" ry="7" fill="#a85a00" />
        <ellipse cx="14" cy="12" rx="14" ry="7" fill="url(#gGold)" stroke="#a85a00" />
        <ellipse cx="14" cy="12" rx="8" ry="3.5" fill="none" stroke="#fff6c0" opacity="0.7" />
      </g>
    ))}
  </svg>
);
