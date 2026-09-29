import { useApp } from '../AppContext.jsx';

// Placeholder until the character sheet (Phase 3).
export default function PlayerHome() {
  const { identity, pcs } = useApp();
  const pc = pcs.find((c) => c.id === identity.characterId);
  return (
    <main className="p-4">
      <h1 className="text-2xl font-semibold">{pc?.name}</h1>
      <p className="mt-2 text-sm opacity-70">Your character sheet arrives in the next phase.</p>
    </main>
  );
}
