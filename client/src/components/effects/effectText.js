import * as D from '../../../../shared/rules-data.js';
import { SCOPE_GROUP_LABELS, DURATION_LABELS } from '../../../../shared/effects.js';

const signed = (n) => (n > 0 ? `+${n}` : String(n));
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// The name of a scope (which rolls a part touches) in the viewer's language. `t` is the translator.
export function scopeText(scope, t) {
  if (SCOPE_GROUP_LABELS[scope]) return t(SCOPE_GROUP_LABELS[scope]);
  const [kind, key] = scope.split(':');
  if (kind === 'stat') return t('{stat} (Attribute)', { stat: { t: D.STAT_LABELS[key] } });
  if (kind === 'save') return D.GROUP_SAVES[key] ? t('{save} Save', { save: { t: D.GROUP_SAVES[key].label } }) : t('{stat} Save', { stat: { t: D.STAT_LABELS[key] } });
  if (kind === 'skill') return t(D.SKILLS.find((s) => s.key === key)?.label ?? scope);
  if (kind === 'mastery') return t('{mastery} (Combat Mastery)', { mastery: { t: D.MASTERY_LABELS[key] } });
  return scope;
}

const advText = (n, t) => (n > 0 ? t('Advantage {n}', { n }) : t('Disadvantage {n}', { n: -n }));
const dieText = (d) => `${d.sign < 0 ? '-' : '+'}d${d.sides}`;

// What one part does, as short pieces of text.
export function partParts(p, t) {
  const out = [];
  switch (p.type) {
    case 'roll': {
      const what = [];
      if (p.adv) what.push(advText(p.adv, t));
      if (p.bonus) what.push(signed(p.bonus));
      for (const d of p.dice) what.push(dieText(d));
      out.push(t('{scope}: {what}', { scope: scopeText(p.scope, t), what: what.join(', ') }));
      break;
    }
    case 'against': {
      const what = [];
      if (p.adv) what.push(advText(p.adv, t));
      if (p.bonus) what.push(signed(p.bonus));
      out.push(t('Attacks against: {what}', { what: what.join(', ') }));
      break;
    }
    case 'defence':
      if (p.physical) out.push(t('Physical Defence {n}', { n: signed(p.physical) }));
      if (p.mental) out.push(t('Mental Defence {n}', { n: signed(p.mental) }));
      break;
    case 'stats':
      if (p.movement) out.push(t('Movement {n}', { n: signed(p.movement) }));
      if (p.maxAp) out.push(t('Max AP {n}', { n: signed(p.maxAp) }));
      if (p.maxHp) out.push(t('Max HP {n}', { n: signed(p.maxHp) }));
      break;
    case 'combat':
      if (p.damageDealt) out.push(t('Damage dealt {n}', { n: signed(p.damageDealt) }));
      if (p.damageTaken) out.push(t('Damage taken {n}', { n: signed(p.damageTaken) }));
      if (p.crit) out.push(t('Critical Hit on {n}', { n: 20 + p.crit }));
      if (p.dc) out.push(t('Save DC {n}', { n: signed(p.dc) }));
      break;
    case 'resist': {
      const kind = { t: cap(p.kind) };
      if (p.mode === 'flat') out.push(t('Resistance ({n}) to {kind}', { n: p.flat, kind }));
      else if (p.mode === 'half') out.push(t('Resistance (Half) to {kind}', { kind }));
      else if (p.mode === 'double') out.push(t('Resistance (Double) to {kind}', { kind }));
      else out.push(t('Immunity to {kind}', { kind }));
      break;
    }
    case 'grant':
      for (const s of p.statuses) {
        const info = D.STATUSES.find((x) => x.key === s.key);
        out.push(t('Starts with {status}', { status: info?.stackable ? `${t(info.name)} ${s.stacks}` : t(info?.name) }));
      }
      if (p.temp) out.push(t('Starts with {n} Temp HP', { n: p.temp }));
      break;
    case 'text':
      if (p.text.trim()) out.push(p.text.trim());
      break;
    default:
  }
  return out;
}

// A whole Effect in one line: its parts, how long it lasts and its uses.
export function effectSummary(e, t) {
  const parts = e.parts.flatMap((p) => partParts(p, t));
  const tail = [t(DURATION_LABELS[e.duration])];
  const uses = e.uses && typeof e.uses === 'object' ? e.uses.max : e.uses;
  if (uses) tail.push(t('{n} uses', { n: e.uses?.current != null ? e.uses.current : uses }));
  return [...parts, ...tail].join('; ');
}
