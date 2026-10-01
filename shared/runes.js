// Runes: the symbols of Spell Fine Tuning. A spell draft keeps a chain of them, typed left to right (at most MAX_CHAIN).
// The rune reference (a PDF with each rune's picture, name and category) is ported here; the pictures are in
// client/src/components/arcane/runeGlyphs.js. A last category, Spell Stones, offers the twelve stone symbols as
// runes too (symbols only, not the physical stones). Names are English here and translated on screen.

export const MAX_CHAIN = 99;

export const RUNE_CATEGORIES = [
  {
    id: 'logic',
    name: 'Logic',
    runes: [
      { id: 'if', name: 'If' },
      { id: 'then', name: 'Then' },
      { id: 'or', name: 'Or' },
      { id: 'and', name: 'And' },
      { id: 'else', name: 'Else' },
      { id: 'equal_to', name: 'Equal to' },
      { id: 'greater_than', name: 'Greater than' },
      { id: 'less_than', name: 'Less than' },
      { id: 'not', name: 'Not' },
      { id: 'where', name: 'Where' },
    ],
  },
  {
    id: 'properties',
    name: 'Properties',
    runes: [
      { id: 'force', name: 'Force / Strength' },
      { id: 'counteraction', name: 'Counteraction' },
      { id: 'speed', name: 'Speed' },
      { id: 'weight', name: 'Weight' },
      { id: 'time', name: 'Time' },
      { id: 'space', name: 'Space' },
      { id: 'sound', name: 'Sound' },
      { id: 'size', name: 'Size' },
      { id: 'form', name: 'Form / Shape' },
      { id: 'hardness', name: 'Hardness' },
      { id: 'pressure', name: 'Pressure' },
      { id: 'consciousness', name: 'Consciousness' },
      { id: 'temperature', name: 'Temperature' },
      { id: 'emotion', name: 'Emotion' },
      { id: 'control', name: 'Control' },
    ],
  },
  {
    id: 'modifiers',
    name: 'Modifiers',
    runes: [
      { id: 'separation', name: 'Separation' },
      { id: 'positive', name: 'Positive' },
      { id: 'negative', name: 'Negative' },
      { id: 'increase', name: 'Increase' },
      { id: 'decrease', name: 'Decrease' },
      { id: 'ignoring', name: 'Ignoring' },
      { id: 'recognition', name: 'Recognition' },
      { id: 'unification', name: 'Unification' },
      { id: 'duration', name: 'Duration' },
      { id: 'filling', name: 'Filling' },
    ],
  },
  {
    id: 'targeting_geometry',
    name: 'Targeting & Geometry',
    runes: [
      { id: 'range', name: 'Range' },
      { id: 'attack', name: 'Attack' },
      { id: 'avoidance', name: 'Avoidance' },
      { id: 'chance', name: 'Chance' },
      { id: 'movement', name: 'Movement' },
      { id: 'radius', name: 'Radius' },
      { id: 'cone', name: 'Cone' },
      { id: 'square', name: 'Square' },
      { id: 'surround', name: 'Surround' },
    ],
  },
  {
    id: 'actions',
    name: 'Actions',
    runes: [
      { id: 'apply', name: 'Apply' },
      { id: 'create', name: 'Create' },
      { id: 'summon', name: 'Summon' },
      { id: 'transform', name: 'Transform' },
      { id: 'find', name: 'Find' },
      { id: 'enchant', name: 'Enchant' },
    ],
  },
  {
    id: 'elements_essences',
    name: 'Elements & Essences',
    runes: [
      { id: 'earth', name: 'Earth' },
      { id: 'fire', name: 'Fire' },
      { id: 'energy', name: 'Energy' },
      { id: 'life', name: 'Life' },
      { id: 'light', name: 'Light' },
      { id: 'metal', name: 'Metal' },
      { id: 'water', name: 'Water' },
      { id: 'air', name: 'Air' },
      { id: 'wood', name: 'Wood / Tree' },
      { id: 'darkness', name: 'Darkness / Void' },
      { id: 'death', name: 'Death' },
    ],
  },
];

// The special category: the stones' symbols. A rune id is `stone_<sign>`; the name and the symbol come from the stone
// (shared/spells.js), which imports this file, so only the signs are listed here.
const STONE_SIGNS = ['cancer', 'virgo', 'taurus', 'leo', 'scorpio', 'sagittarius', 'pisces', 'libra', 'capricorn', 'aries', 'gemini', 'aquarius'];
export const STONE_CATEGORY = {
  id: 'spell_stones',
  name: 'Spell Stones',
  runes: STONE_SIGNS.map((sign) => ({ id: `stone_${sign}`, sign })),
};

export const ALL_CATEGORIES = [...RUNE_CATEGORIES, STONE_CATEGORY];
const BY_ID = new Map(ALL_CATEGORIES.flatMap((c) => c.runes.map((r) => [r.id, { ...r, category: c.id }])));

export const runeInfo = (id) => BY_ID.get(id) ?? null;

// A chain from anything: only known runes stay, at most MAX_CHAIN of them.
export const normalizeChain = (raw) => (Array.isArray(raw) ? raw : []).filter((id) => typeof id === 'string' && BY_ID.has(id)).slice(0, MAX_CHAIN);

// Terms the data adds to LOCALIZATION.md (the category names and the runes; the stones' names are terms already).
export const runeTermKeys = () => ALL_CATEGORIES.flatMap((c) => [c.name, ...c.runes.filter((r) => r.name).map((r) => r.name)]);
