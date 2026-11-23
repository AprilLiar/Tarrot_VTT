import { describe, it, expect } from 'vitest';
import { createDb, initSchema } from '../db.js';
import * as roster from '../roster.js';
import { cleanCrop, cropSquare, portraitBase, ZOOM_MAX } from '../../shared/crop.js';

describe('crops', () => {
  it('cleans a crop: numbers in range, the automatic cut is null', () => {
    expect(cleanCrop(null)).toBeNull();
    expect(cleanCrop({ x: 0, y: 0, zoom: 1 })).toBeNull();
    expect(cleanCrop({ x: 'a', y: 0, zoom: 1 })).toBeNull();
    expect(cleanCrop({ x: 9, y: -9, zoom: 99 })).toEqual({ x: 3, y: -3, zoom: ZOOM_MAX });
  });

  it('works out the square shown: the Portrait base is the top square, a crop moves and zooms it', () => {
    expect(portraitBase(200, 400)).toEqual({ cx: 100, cy: 100, side: 200 });
    expect(cropSquare({ cx: 100, cy: 100, side: 200 }, { x: 0.5, y: 0, zoom: 2 })).toEqual({ cx: 200, cy: 100, side: 100 });
  });

  it('keeps a crop per character, and a new Portrait starts again from the automatic cut', async () => {
    const db = createDb({ url: 'file::memory:' });
    await initSchema(db);
    const cid = await roster.createCharacter(db, { name: 'Ada', type: 'pc' });
    await roster.setPortrait(db, cid, 'img1');
    await roster.setCrop(db, cid, 'portrait', { x: 0.1, y: 0, zoom: 2 });
    await roster.setCrop(db, cid, 'token', { x: 0, y: 0.2, zoom: 1.5 });
    let c = await roster.getCharacter(db, cid);
    expect(c.portraitCrop).toEqual({ x: 0.1, y: 0, zoom: 2 });
    expect(c.tokenCrop).toEqual({ x: 0, y: 0.2, zoom: 1.5 });
    expect((await roster.listPcs(db))[0].portraitCrop).toEqual({ x: 0.1, y: 0, zoom: 2 });
    await roster.setPortrait(db, cid, 'img2');
    c = await roster.getCharacter(db, cid);
    expect(c.portraitCrop).toBeNull();
    expect(c.tokenCrop).toEqual({ x: 0, y: 0.2, zoom: 1.5 });
    db.close();
  });
});
