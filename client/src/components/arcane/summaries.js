import * as D from '../../../../shared/rules-data.js';

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const signed = (n) => (n > 0 ? `+${n}` : String(n));

export function weaponSummary(cfg, t) {
  const parts = [
    t('{base} {kind}, {defence}, {ap} AP', { base: cfg.base, kind: { t: cap(cfg.kind) }, defence: { t: `${cap(cfg.defence)} Defence` }, ap: cfg.ap }),
  ];
  if (cfg.range != null) parts.push(t('Range {n}', { n: cfg.range }));
  for (const st of cfg.statuses) parts.push(t(D.STATUSES.find((x) => x.key === st.key)?.name));
  for (const d of cfg.dice) parts.push(`${d.sign < 0 ? '-' : '+'}d${d.sides}`);
  for (const u of cfg.unique) parts.push(u.name);
  return parts.join('; ');
}

function statusNames(list, t) {
  return list.map((st) => {
    const info = D.STATUSES.find((x) => x.key === st.key);
    return info?.stackable ? `${t(info.name)} ${st.stacks}` : t(info?.name);
  });
}

export function enhancementSummary(e, items, t) {
  const cost = [];
  if (e.cost.ap) cost.push(t('{n} AP', { n: e.cost.ap }));
  if (e.cost.damage) cost.push(t('{n} {kind} damage to you', { n: e.cost.damage.amount, kind: { t: e.cost.damage.kind === 'true' ? 'True' : cap(e.cost.damage.kind) } }));
  cost.push(...statusNames(e.cost.statuses, t));
  if (e.cost.item) cost.push(t('{n} uses of {item}', { n: e.cost.item.uses, item: items.find((i) => i.id === e.cost.item.itemId)?.name ?? '?' }));
  const fx = [];
  if (e.effect.damage) fx.push(t('Damage {n}', { n: signed(e.effect.damage) }));
  if (e.effect.range) fx.push(t('Range {n}', { n: signed(e.effect.range) }));
  if (e.effect.advantage) fx.push(t('Advantage {n}', { n: signed(e.effect.advantage) }));
  fx.push(...statusNames(e.effect.statuses, t));
  for (const d of e.effect.dice) fx.push(`${d.sign < 0 ? '-' : '+'}d${d.sides}`);
  for (const u of e.effect.unique) fx.push(u.name);
  const out = [];
  if (cost.length) out.push(t('Cost: {list}', { list: cost.join(', ') }));
  if (fx.length) out.push(t('Effect: {list}', { list: fx.join(', ') }));
  return out.join('. ');
}


// The effect of a Stance band as short pieces of text, in the viewer's language.
export function bandParts(e, t) {
  const parts = [];
  if (e.bonus) parts.push(t('Roll {n}', { n: signed(e.bonus) }));
  if (e.advantage) parts.push(t('Advantage {n}', { n: signed(e.advantage) }));
  if (e.range) parts.push(t('Range {n}', { n: signed(e.range) }));
  if (e.damage) parts.push(t('Damage {n}', { n: signed(e.damage) }));
  for (const st of e.statuses) {
    const info = D.STATUSES.find((x) => x.key === st.key);
    parts.push(info?.stackable ? `${t(info.name)} ${st.stacks}` : t(info?.name));
  }
  for (const d of e.dice) parts.push(`${d.sign < 0 ? '-' : '+'}d${d.sides}`);
  for (const u of e.unique) parts.push(u.name);
  return parts;
}
