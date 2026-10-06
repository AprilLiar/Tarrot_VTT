import * as D from './rules-data.js';

// Hit Severity and damage, shared by the server (which applies an attack) and the client (which
// previews it live on the confirm card, so what the GM sees is what gets applied).
//
// difference = attack total - the target's Defence
//   below 0     Miss (a natural 20 always hits)
//   0 to 4      Hit          base damage
//   5 to 9      Heavy Hit    base + 1
//   10 or more  Brutal Hit   base + 2
//   Critical Hit (natural roll at or above the threshold, 20 by default): +2 on top.

export const DEFAULT_CRIT = 20;
export const DAMAGE_KINDS = [...D.DAMAGE_TYPES, 'true']; // 'true' ignores resistances

export const SEVERITY_LABELS = { miss: 'Miss', hit: 'Hit', heavy: 'Heavy Hit', brutal: 'Brutal Hit' };

// The label of a hit result as a message parameter: { t: 'Heavy Hit' } or a nested Critical Hit message.
export function hitParam(result) {
  const name = { t: SEVERITY_LABELS[result.severity] };
  return result.critical ? { key: 'Critical Hit ({severity})', params: { severity: name } } : name;
}

// The label of a hit result in a language: t is a translator, (text, params) -> string.
export function hitLabel(result, t) {
  const name = t(SEVERITY_LABELS[result.severity]);
  return result.critical ? t('Critical Hit ({severity})', { severity: name }) : name;
}

// -> { difference, severity, critical, hit, bonus, label }
export function hitResult({ total, natural, defence, critThreshold = DEFAULT_CRIT }) {
  const difference = total - defence;
  const critical = natural >= critThreshold;
  let severity = difference >= 10 ? 'brutal' : difference >= 5 ? 'heavy' : difference >= 0 ? 'hit' : 'miss';
  let severityBonus = severity === 'brutal' ? 2 : severity === 'heavy' ? 1 : 0;
  // A critical always hits, even below the Defence.
  if (severity === 'miss' && critical) severity = 'hit';
  const bonus = severityBonus + (critical ? 2 : 0);
  const label = critical ? `Critical Hit (${SEVERITY_LABELS[severity]})` : SEVERITY_LABELS[severity];
  return { difference, severity, critical, hit: severity !== 'miss', bonus, label };
}

// Flat resistance first (positive takes less, negative takes more), then Half and Double.
// Immunity takes nothing. Consumption takes nothing and heals half of the raw damage.
// -> { damage, heal, steps }  (`steps` explain the number; each is a message { key, params })
export function applyResistance(res, raw) {
  const r = res ?? { flat: 0, half: false, double: false, immunity: false, consumption: false };
  if (r.consumption) {
    const n = Math.round(raw / 2);
    return { damage: 0, heal: n, steps: [{ key: 'Consumption: heals {n}', params: { n } }] };
  }
  if (r.immunity) return { damage: 0, heal: 0, steps: [{ key: 'Immune' }] };
  const steps = [];
  let v = raw;
  if (r.flat) {
    v = Math.max(0, v - r.flat);
    steps.push({ key: 'Resistance {flat}: {v}', params: { flat: r.flat, v } });
  }
  if (r.half) {
    v = Math.round(v / 2);
    steps.push({ key: 'Half: {v}', params: { v } });
  }
  if (r.double) {
    v *= 2;
    steps.push({ key: 'Double: {v}', params: { v } });
  }
  return { damage: v, heal: 0, steps };
}

// One target of an attack.
// input: { total, natural, critThreshold?, defence, base, kind, resistance?, taken?, override? }
// `override` (a number) replaces the final damage; the rest is still worked out for the record.
// -> { ...hitResult, raw, damage, heal, steps, overridden }
export function computeTarget(input) {
  const hit = hitResult(input);
  if (!hit.hit) return { ...hit, raw: 0, damage: 0, heal: 0, steps: [], overridden: false };
  const raw = Math.max(0, input.base + hit.bonus);
  const res = input.kind === 'true' ? { damage: raw, heal: 0, steps: [] } : applyResistance(input.resistance, raw);
  // The target's Effects change the damage it takes by a flat amount (after its resistances, never below 0).
  if (input.taken && res.damage > 0) {
    const v = Math.max(0, res.damage + input.taken);
    res.steps = [...res.steps, { key: 'Effects {n}: {v}', params: { n: input.taken, v } }];
    res.damage = v;
  }
  if (Number.isInteger(input.override)) return { ...hit, raw, damage: input.override, heal: 0, steps: res.steps, overridden: true };
  return { ...hit, raw, damage: res.damage, heal: res.heal, steps: res.steps, overridden: false };
}
