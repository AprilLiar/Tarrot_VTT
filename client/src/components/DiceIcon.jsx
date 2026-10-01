// Simple vector drawings of the polyhedral dice (my own artwork, shaded to look three-dimensional): d4 to d12.
// Three tones of violet make the facets; the number of sides is written on the die.
const LIGHT = '#a78bfa';
const MID = '#7c3aed';
const DARK = '#5b21b6';
const EDGE = '#ede9fe';

// Each die is a list of facets: [points, tone].
const SHAPES = {
  4: [
    ['24,4 44,38 24,30', LIGHT],
    ['24,4 24,30 4,38', MID],
    ['4,38 24,30 44,38 24,44', DARK],
  ],
  6: [
    ['24,4 42,13 24,22 6,13', LIGHT],
    ['6,13 24,22 24,44 6,35', MID],
    ['24,22 42,13 42,35 24,44', DARK],
  ],
  8: [
    ['24,3 44,16 24,24 4,16', LIGHT],
    ['4,16 24,24 4,32', MID],
    ['44,16 44,32 24,24', MID],
    ['4,32 24,24 44,32 24,45', DARK],
  ],
  10: [
    ['24,3 44,19 24,24 4,19', LIGHT],
    ['4,19 24,24 24,45', MID],
    ['24,24 44,19 24,45', DARK],
  ],
  12: [
    ['24,3 44,18 36,42 12,42 4,18', MID],
    ['24,12 36,21 32,34 16,34 12,21', LIGHT],
    ['24,3 24,12 12,21 4,18', DARK],
    ['24,3 44,18 36,21 24,12', DARK],
    ['36,42 32,34 36,21 44,18', DARK],
    ['12,42 16,34 32,34 36,42', DARK],
    ['4,18 12,21 16,34 12,42', DARK],
  ],
};

export function DiceIcon({ sides, size = 48, selected = false }) {
  const facets = SHAPES[sides] ?? SHAPES[6];
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label={`d${sides}`} data-testid="dice-icon" data-sides={sides} style={selected ? { filter: 'drop-shadow(0 0 4px #fbbf24)' } : undefined}>
      {facets.map(([points, tone], i) => (
        <polygon key={i} points={points} fill={tone} stroke={EDGE} strokeWidth="1.2" strokeLinejoin="round" />
      ))}
      <text x="24" y={sides === 4 ? 34 : 28} textAnchor="middle" fontSize={sides >= 10 ? 12 : 13} fontWeight="700" fill="#fff" stroke="#2e1065" strokeWidth="0.5" paintOrder="stroke">
        {sides}
      </text>
    </svg>
  );
}
