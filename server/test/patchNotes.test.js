import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PATCH } from '../../client/src/lib/patchNotes.js';

const json = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));

describe('the patch note', () => {
  it('names the version every package file carries, and says something', () => {
    expect(PATCH.version).toMatch(/^\d+\.\d+\.\d+$/);
    for (const file of ['../../package.json', '../../client/package.json']) expect(json(file).version, file).toBe(PATCH.version);
    for (const file of ['../../package-lock.json', '../../client/package-lock.json']) {
      let lock;
      try {
        lock = json(file);
      } catch {
        continue; // no lockfile there
      }
      expect(lock.version, file).toBe(PATCH.version);
      expect(lock.packages?.['']?.version ?? PATCH.version, file).toBe(PATCH.version);
    }
    expect(PATCH.note.trim().length).toBeGreaterThan(10);
  });
});
