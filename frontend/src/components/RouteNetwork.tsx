import { useEffect, useMemo, useState } from 'react';

/**
 * Illustration de la page de connexion : réseau de routes sur une carte stylisée de la France.
 * Un camion parcourt la liaison Paris → Lyon (animation désactivée si « réduire les animations »).
 */
const CITIES = {
  lille: { x: 300, y: 70, label: 'Lille' },
  rouen: { x: 215, y: 135, label: 'Rouen' },
  paris: { x: 290, y: 160, label: 'Paris' },
  strasbourg: { x: 470, y: 175, label: 'Strasbourg' },
  nantes: { x: 120, y: 260, label: 'Nantes' },
  lyon: { x: 385, y: 330, label: 'Lyon' },
  bordeaux: { x: 150, y: 400, label: 'Bordeaux' },
  grenoble: { x: 430, y: 365, label: 'Grenoble' },
  toulouse: { x: 245, y: 480, label: 'Toulouse' },
  marseille: { x: 420, y: 480, label: 'Marseille' },
} as const;

type City = keyof typeof CITIES;
const ROUTES: [City, City][] = [
  ['lille', 'paris'], ['rouen', 'paris'], ['paris', 'strasbourg'], ['paris', 'nantes'], ['nantes', 'bordeaux'],
  ['bordeaux', 'toulouse'], ['toulouse', 'marseille'], ['lyon', 'marseille'], ['lyon', 'grenoble'], ['strasbourg', 'lyon'],
];

function curve(a: City, b: City, bend = 0.18) {
  const p = CITIES[a];
  const q = CITIES[b];
  const mx = (p.x + q.x) / 2;
  const my = (p.y + q.y) / 2;
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  return `M${p.x},${p.y} Q${mx - dy * bend},${my + dx * bend} ${q.x},${q.y}`;
}

export function RouteNetwork() {
  const [animate, setAnimate] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    setAnimate(!mq?.matches);
  }, []);
  const active = useMemo(() => curve('paris', 'lyon', -0.12), []);

  return (
    <svg viewBox="0 0 580 560" className="h-full w-full" role="img" aria-label="Réseau de transport : un camion relie Paris à Lyon">
      <defs>
        <radialGradient id="rn-glow" cx="50%" cy="45%" r="60%">
          <stop offset="0%" stopColor="#236EBE" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#236EBE" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="rn-active" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#236EBE" />
          <stop offset="100%" stopColor="#2CAABF" />
        </linearGradient>
        <pattern id="rn-grid" width="28" height="28" patternUnits="userSpaceOnUse">
          <path d="M28 0H0V28" fill="none" style={{ stroke: 'rgb(var(--ink))' }} strokeOpacity="0.06" />
        </pattern>
        <filter id="rn-blur"><feGaussianBlur stdDeviation="6" /></filter>
        <radialGradient id="rn-fade" cx="50%" cy="50%" r="50%">
          <stop offset="55%" stopColor="#fff" />
          <stop offset="100%" stopColor="#000" />
        </radialGradient>
        <mask id="rn-mask"><rect width="580" height="560" fill="url(#rn-fade)" /></mask>
      </defs>

      <rect width="580" height="560" fill="url(#rn-grid)" mask="url(#rn-mask)" />
      <ellipse cx="300" cy="280" rx="280" ry="250" fill="url(#rn-glow)" />

      {/* Silhouette stylisée de l'Hexagone */}
      <path
        d="M300 40 L360 70 L470 120 L500 175 L470 240 L455 300 L470 360 L455 420 L470 470 L410 515 L330 500 L260 520 L190 500 L140 460 L150 400 L115 330 L80 280 L60 240 L95 210 L150 200 L190 150 L230 115 L270 60 Z"
        style={{ fill: 'rgb(var(--ink))' }} fillOpacity="0.03" stroke="#236EBE" strokeOpacity="0.25" strokeWidth="1.2" strokeLinejoin="round"
      />

      {ROUTES.map(([a, b]) => (
        <path key={`${a}-${b}`} d={curve(a, b)} fill="none" stroke="#7D8FA6" strokeOpacity="0.45" strokeWidth="1.4" strokeDasharray="2 6" strokeLinecap="round" />
      ))}

      {/* Liaison active */}
      <path d={active} fill="none" stroke="#2CAABF" strokeOpacity="0.5" strokeWidth="10" filter="url(#rn-blur)" />
      <path d={active} fill="none" stroke="url(#rn-active)" strokeWidth="3" strokeLinecap="round" />
      <path d={active} fill="none" stroke="#ffffff" strokeOpacity="0.85" strokeWidth="1.2" strokeDasharray="6 18" className={animate ? 'animate-dash-run' : undefined} />

      {(Object.keys(CITIES) as City[]).map((k) => {
        const c = CITIES[k];
        const hot = k === 'paris' || k === 'lyon';
        return (
          <g key={k}>
            {hot && <circle cx={c.x} cy={c.y} r="14" fill={k === 'paris' ? '#236EBE' : '#2A9B64'} fillOpacity="0.18" />}
            <circle cx={c.x} cy={c.y} r={hot ? 6 : 3.5} fill={k === 'paris' ? '#236EBE' : k === 'lyon' ? '#2A9B64' : '#8FA3BA'} style={{ stroke: 'rgb(var(--surface))' }} strokeWidth="2" />
            <text x={c.x + 12} y={c.y + 4} fontSize="12" style={{ fill: 'rgb(var(--ink))' }} fillOpacity={hot ? 0.9 : 0.5} fontFamily="'Archivo Variable', sans-serif" fontWeight={hot ? 600 : 400}>
              {c.label}
            </text>
          </g>
        );
      })}

      {/* Camion en déplacement */}
      <g>
        <g transform={animate ? undefined : 'translate(345 245)'}>
          <circle r="15" style={{ fill: 'rgb(var(--surface))' }} stroke="#2CAABF" strokeWidth="1.5" />
          <g transform="translate(-8 -6)" fill="none" stroke="#2CAABF" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 2h9v8H1z" />
            <path d="M10 5h3.2l2.3 2.6V10H10" />
            <circle cx="4" cy="11" r="1.6" style={{ fill: 'rgb(var(--surface))' }} />
            <circle cx="12.5" cy="11" r="1.6" style={{ fill: 'rgb(var(--surface))' }} />
          </g>
          {animate && <animateMotion dur="7s" repeatCount="indefinite" path={active} keyPoints="0;1" keyTimes="0;1" calcMode="linear" />}
        </g>
      </g>
    </svg>
  );
}
