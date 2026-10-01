// Hit Points with Temp HP. Temp HP is a shield with no maximum: all damage hits it first and only what is left over
// (the overkill) hurts HP. Temp HP cannot stack: gaining some keeps the larger of what you had and what you gain.
// Healing never touches it.

// hp: { current, max, temp } -> { current, temp, absorbed, rest }  (`rest` is what went through to HP)
export function takeDamage(hp, amount, heal = 0) {
  const temp = hp.temp ?? 0;
  const absorbed = Math.min(temp, Math.max(0, amount));
  const rest = Math.max(0, amount) - absorbed;
  return {
    current: Math.min(hp.max, Math.max(0, hp.current - rest + heal)),
    temp: temp - absorbed,
    absorbed,
    rest,
  };
}

// The Temp HP a character has after gaining `value`: the larger of the two, never the sum.
export const gainTemp = (current, value) => Math.max(current ?? 0, value ?? 0);
