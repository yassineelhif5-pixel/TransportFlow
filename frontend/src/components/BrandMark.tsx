import clsx from 'clsx';

/** Logotype : une trace de route reliant un point de départ (bleu) et une arrivée (vert). */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={clsx('shrink-0', className)} aria-hidden>
      <rect width="40" height="40" rx="11" fill="#142337" />
      <rect x=".5" y=".5" width="39" height="39" rx="10.5" fill="none" stroke="#2CAABF" strokeOpacity=".35" />
      <path d="M9 28c6 0 7-15 14-15s8 7 8 7" fill="none" stroke="#2CAABF" strokeWidth="3" strokeLinecap="round" />
      <circle cx="9" cy="28" r="3.2" fill="#236EBE" />
      <circle cx="31" cy="20" r="3.2" fill="#2A9B64" />
    </svg>
  );
}

export function BrandName({ className }: { className?: string }) {
  return (
    <span className={clsx('font-semibold tracking-tight text-white', className)} style={{ fontStretch: '118%' }}>
      Transport<span className="text-cyan">Flow</span>
    </span>
  );
}
