// Faint drawings behind the Defence values: a shield for Physical, a brain for Mental.
const cls = 'pointer-events-none absolute right-1 top-1/2 h-14 w-14 -translate-y-1/2 opacity-[0.13]';
const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' };

export function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" className={cls} aria-hidden="true" data-testid="icon-shield">
      <path d="M12 2.5l8 3v6.2c0 5-3.4 8.4-8 9.8-4.6-1.4-8-4.8-8-9.8V5.5z" {...stroke} />
      <path d="M12 6v12" {...stroke} />
      <path d="M7 10.5h10" {...stroke} />
    </svg>
  );
}

export function BrainIcon() {
  return (
    <svg viewBox="0 0 24 24" className={cls} aria-hidden="true" data-testid="icon-brain">
      <path d="M12 5.5c-.8-1.8-3.3-2.3-4.7-1-1.6-.2-3 1.2-2.7 2.8-1.6.7-2 2.8-.9 4.1-.8 1.5 0 3.4 1.6 3.9-.1 1.8 1.6 3.2 3.4 2.6.6 1.2 2 1.9 3.3 1.5z" {...stroke} />
      <path d="M12 5.5c.8-1.8 3.3-2.3 4.7-1 1.6-.2 3 1.2 2.7 2.8 1.6.7 2 2.8.9 4.1.8 1.5 0 3.4-1.6 3.9.1 1.8-1.6 3.2-3.4 2.6-.6 1.2-2 1.9-3.3 1.5z" {...stroke} />
      <path d="M12 5.5v13.4M8 9.5c1.2.2 2 1 2.4 2.2M16 9.5c-1.2.2-2 1-2.4 2.2M8.6 14.2c1 0 1.9.4 2.6 1.1M15.4 14.2c-1 0-1.9.4-2.6 1.1" {...stroke} />
    </svg>
  );
}
