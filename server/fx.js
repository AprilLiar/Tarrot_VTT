// Board animations (see the README): short visual events sent to every screen with a battle view ('battle:fx'). They only animate; the
// state itself still arrives with the stage and the sheets. Kinds:
//   attack  { from: tokenId|null, to: [tokenId], sources: ['stance'|'spell'|'manifestation'] }   one combined strike
//   outcome { tokenId, outcome: 'hit'|'miss'|'crit' }                                              per target of an attack
//   hp      { characterId, loss, tempLoss, heal }                                                 from a sheet's change
//   status  { characterId, key, delta }                                                            a status gained (+) or lost (-)
//   save    { characterId, passed }                                                                a Save made against a status
//   turn    { tokenId, name }                                                                      a turn begins

export function createFx(io, rooms) {
  const send = (fx) => io.to(rooms.GM_ROOM).to(rooms.VIEW_ROOM).emit('battle:fx', fx);
  return { send };
}

// What changed between two sheets of a character, as fx (nothing the first time a sheet is seen).
export function sheetFx(characterId, before, after) {
  if (!before) return [];
  const out = [];
  const hpB = before.hp ?? {};
  const hpA = after.hp ?? {};
  const tempLoss = Math.max(0, (hpB.temp ?? 0) - (hpA.temp ?? 0));
  const loss = Math.max(0, (hpB.current ?? 0) - (hpA.current ?? 0));
  const heal = Math.max(0, (hpA.current ?? 0) - (hpB.current ?? 0));
  if (loss || tempLoss || heal) out.push({ kind: 'hp', characterId, loss, tempLoss, heal });
  const sB = before.statuses ?? {};
  const sA = after.statuses ?? {};
  for (const key of new Set([...Object.keys(sB), ...Object.keys(sA)])) {
    const delta = (sA[key] ?? 0) - (sB[key] ?? 0);
    if (delta) out.push({ kind: 'status', characterId, key, delta });
  }
  return out;
}
