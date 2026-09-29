import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { STATUSES, SKILLS, DAMAGE_TYPES } from '../../shared/rules-data.js';

// The README is the design source of truth; the code copy must not drift.
const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8');

describe('rules data matches the README', () => {
  it('has every status row, with matching stacking and text', () => {
    const rows = [...readme.matchAll(/^\| (.+?) \| (yes|no) \| (.+) \|$/gm)].filter((m) => m[1] !== 'Status');
    expect(rows.length).toBe(STATUSES.length);
    for (const [, name, stacks, text] of rows) {
      const s = STATUSES.find((x) => x.name === name);
      expect(s, name).toBeTruthy();
      expect(s.stackable).toBe(stacks === 'yes');
      expect(s.text).toBe(text);
    }
  });

  it('lists every skill and damage type from the README', () => {
    for (const s of SKILLS) expect(readme).toContain(`| ${s.label} |`);
    for (const t of DAMAGE_TYPES) expect(readme.toLowerCase()).toContain(t);
  });
});
