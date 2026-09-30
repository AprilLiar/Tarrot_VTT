import { normalizeEffect } from './spells.js';
import * as D from './rules-data.js';

// Tarot Cards and Manifestations of a character. Only the GM creates them; a player reads them and swaps the
// active card.
export const MAX_CARDS = 100;
export const MAX_MANIFESTATIONS = 100;

const text = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

export function normalizeCard(raw, id) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    id: typeof r.id === 'string' && r.id ? r.id : id,
    name: text(r.name, D.NAME_MAX).trim() || 'Card',
    description: text(r.description, D.TEXT_MAX),
  };
}

// { cards: [{ id, name, description }], active: cardId | null }
export function normalizeTarot(raw, newId) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const cards = (Array.isArray(r.cards) ? r.cards : []).slice(0, MAX_CARDS).map((c) => normalizeCard(c, newId()));
  return { cards, active: cards.some((c) => c.id === r.active) ? r.active : null };
}

// A Manifestation is a gift of a god: text, and an effect that is a Weapon or an Enhancement.
export function normalizeManifestation(raw, id) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const mid = typeof r.id === 'string' && r.id ? r.id : id;
  return {
    id: mid,
    name: text(r.name, D.NAME_MAX).trim() || 'Manifestation',
    description: text(r.description, D.TEXT_MAX),
    effect: normalizeEffect(r.effect, mid),
  };
}
