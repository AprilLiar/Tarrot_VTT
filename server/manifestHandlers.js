import { randomUUID } from 'node:crypto';
import * as sheets from './sheet.js';
import * as roster from './roster.js';
import { AppError } from './errors.js';
import { listLocks, lockedError } from './locks.js';
import { tarotLocked } from '../shared/locks.js';
import { normalizeCard, normalizeManifestation, selectedCard, MAX_CARDS, MAX_MANIFESTATIONS } from '../shared/manifest.js';

// Socket events for the Manifest tab. Only the GM makes Tarot Cards and Manifestations; a player reads them
// and swaps the active card.
//  - tarot:add / tarot:update / tarot:remove   (GM) { characterId, card | id }
//  - tarot:select   { characterId, id }   a tap on a card: it becomes the selected one; a tap on the selected one unselects it; a tap on
//                   another card while one is selected does nothing (a player only for their own PC)
//  - tarot:peek     { characterId }   the selected card of a character, for the gold star on the maps: everyone can ask, a hidden card
//                   (or a locked Tarot) is only given to the GM and the owner
//  - tarot:transfer  (GM) { fromId, toId, id }
//  - manifestation:add / :update / :remove  (GM) { characterId, manifestation | id }
export function registerManifestHandlers(ctx) {
  const { db, on, requireControl, emitSheet, isGm, identity } = ctx;

  const name = (v) => {
    if (typeof v !== 'string' || !v.trim()) throw new AppError('bad_name', 'A name is required.');
  };
  const find = (list, id) => {
    const i = list.findIndex((x) => x.id === id);
    if (i < 0) throw new AppError('not_found', 'That entry no longer exists.');
    return i;
  };
  const change = async (characterId, fn) => {
    const c = await requireControl(characterId);
    const sheet = await sheets.updateSheet(db, c.id, (s) => {
      const next = structuredClone(s);
      fn(next);
      return sheets.normalizeSheet(next);
    });
    emitSheet(c.id, sheet);
    return { sheet };
  };

  on('tarot:add', { gmOnly: true }, (p) =>
    change(p.characterId, (s) => {
      name(p.card?.name);
      if (s.tarot.cards.length >= MAX_CARDS) throw new AppError('limit', 'Too many cards.');
      const card = { ...normalizeCard(p.card, randomUUID()), id: randomUUID() };
      s.tarot.cards.push(card);
    }),
  );
  on('tarot:update', { gmOnly: true }, (p) =>
    change(p.characterId, (s) => {
      name(p.card?.name);
      const i = find(s.tarot.cards, p.id);
      s.tarot.cards[i] = { ...normalizeCard(p.card, p.id), id: p.id };
    }),
  );
  on('tarot:remove', { gmOnly: true }, (p) =>
    change(p.characterId, (s) => {
      s.tarot.cards.splice(find(s.tarot.cards, p.id), 1);
      if (s.tarot.active === p.id) s.tarot.active = null;
    }),
  );
  on('tarot:select', { needsIdentity: true }, async (p) => {
    if (!isGm() && tarotLocked(await listLocks(db))) throw lockedError();
    return change(p.characterId, (s) => {
      find(s.tarot.cards, p.id);
      if (s.tarot.active === p.id) s.tarot.active = null;
      else if (s.tarot.active == null) s.tarot.active = p.id;
      // another card is selected: nothing happens
    });
  });
  on('tarot:peek', { needsIdentity: true }, async (p) => {
    const c = await roster.getCharacter(db, p.characterId);
    if (!c) throw new AppError('not_found', 'That character no longer exists.');
    const card = selectedCard((await sheets.getSheet(db, c.id)).tarot);
    if (!card) return { name: c.name, card: null, hidden: false };
    const owner = identity()?.role === 'player' && identity().characterId === c.id;
    const locked = tarotLocked(await listLocks(db));
    if (!isGm() && (locked || (card.hidden && !owner))) return { name: c.name, card: null, hidden: true };
    return { name: c.name, card: { name: card.name, description: card.description }, hidden: false };
  });
  on('tarot:transfer', { gmOnly: true }, async (p) => {
    if (p.fromId === p.toId) throw new AppError('bad_transfer', 'Choose a different character.');
    const to = await roster.getCharacter(db, p.toId);
    if (!to) throw new AppError('not_found', 'That character no longer exists.');
    let card;
    const from = await change(p.fromId, (s) => {
      card = s.tarot.cards[find(s.tarot.cards, p.id)];
      s.tarot.cards = s.tarot.cards.filter((x) => x.id !== p.id);
      if (s.tarot.active === p.id) s.tarot.active = null;
    });
    await change(to.id, (s) => {
      if (s.tarot.cards.length >= MAX_CARDS) throw new AppError('limit', 'Too many cards.');
      s.tarot.cards.push({ ...card, id: randomUUID() });
    });
    return from;
  });

  on('manifestation:add', { gmOnly: true }, (p) =>
    change(p.characterId, (s) => {
      name(p.manifestation?.name);
      if (s.manifestations.length >= MAX_MANIFESTATIONS) throw new AppError('limit', 'Too many Manifestations.');
      const id = randomUUID();
      s.manifestations.push({ ...normalizeManifestation(p.manifestation, id), id });
    }),
  );
  on('manifestation:update', { gmOnly: true }, (p) =>
    change(p.characterId, (s) => {
      name(p.manifestation?.name);
      const i = find(s.manifestations, p.id);
      s.manifestations[i] = { ...normalizeManifestation(p.manifestation, p.id), id: p.id };
    }),
  );
  on('manifestation:remove', { gmOnly: true }, (p) =>
    change(p.characterId, (s) => {
      s.manifestations.splice(find(s.manifestations, p.id), 1);
    }),
  );
}
