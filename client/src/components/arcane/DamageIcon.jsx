// Plain placeholder glyphs for the twelve damage types (drawn here, easy to swap for real art later).
// Each is a 24 x 24 drawing in the colour of its type.
const ICONS = {
  fire: { color: '#f97316', d: 'M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-4-1-6 1-10z' },
  cold: { color: '#67e8f9', d: 'M12 2v20M4 7l16 10M20 7L4 17M9 4l3 2 3-2M9 20l3-2 3 2', line: true },
  acid: { color: '#84cc16', d: 'M12 2c4 6 7 9 7 13a7 7 0 0 1-14 0c0-4 3-7 7-13z' },
  poison: { color: '#a3e635', d: 'M12 3a7 7 0 0 0-4 12v3h8v-3a7 7 0 0 0-4-12zM9 21h6M9.5 11h.01M14.5 11h.01', line: true },
  lightning: { color: '#facc15', d: 'M13 2L5 14h6l-1 8 8-12h-6z' },
  sound: { color: '#c084fc', d: 'M4 9v6h4l5 4V5L8 9zM16 8a5 5 0 0 1 0 8M19 5a9 9 0 0 1 0 14', line: true },
  bludgeoning: { color: '#94a3b8', d: 'M4 20l9-9M11 4l9 9-4 4-9-9z', line: true },
  slashing: { color: '#e2e8f0', d: 'M5 20L19 4M8 21l-4-4', line: true },
  piercing: { color: '#cbd5e1', d: 'M12 2l3 9-3 11-3-11z' },
  soul: { color: '#a5b4fc', d: 'M12 3a6 6 0 0 0-6 6v12l3-2 3 2 3-2 3 2V9a6 6 0 0 0-6-6zM10 10h.01M14 10h.01', line: true },
  decay: { color: '#a16207', d: 'M4 20c0-9 6-15 16-16 0 10-6 16-15 16M4 20l8-8', line: true },
  psychic: { color: '#f472b6', d: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z', line: true },
};

export const ICON_KEYS = Object.keys(ICONS);

export function DamageIcon({ kind, size = 24, title }) {
  const icon = ICONS[kind] ?? ICONS.fire;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={title ?? kind} data-testid="damage-icon" data-kind={kind} className="shrink-0">
      {icon.line ? (
        <path d={icon.d} fill="none" stroke={icon.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d={icon.d} fill={icon.color} />
      )}
    </svg>
  );
}
