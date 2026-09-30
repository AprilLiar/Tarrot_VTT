// The colour of each stat, used as a faint tint on the stat cards and on the skills that scale off it.
export const STAT_COLORS = {
  strength: [239, 68, 68], // red
  dexterity: [34, 197, 94], // green
  intelligence: [59, 130, 246], // blue
  spirit: [168, 85, 247], // purple
  luck: [234, 179, 8], // yellow
};
const ALL = ['strength', 'dexterity', 'intelligence', 'spirit', 'luck'];

const rgba = (stat, a) => `rgba(${STAT_COLORS[stat].join(',')},${a})`;

// A background of 20% of the stat's colour; a skill that takes the better of two stats gets a gradient from one
// colour to the other, and the Prime skill (the highest of all five) one through all five.
export function tint(stats, alpha = 0.2) {
  const list = stats === 'prime' ? ALL : stats;
  if (list.length === 1) return { backgroundColor: rgba(list[0], alpha) };
  return { backgroundImage: `linear-gradient(90deg, ${list.map((s) => rgba(s, alpha)).join(', ')})` };
}

export const skillTint = (skill) => tint(skill.scaling.prime ? 'prime' : skill.scaling.stats);
