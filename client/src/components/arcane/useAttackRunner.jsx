import { useRef, useState } from 'react';
import { call, useApp } from '../../AppContext.jsx';
import Dialog, { btn, btnPrimary } from '../Dialog.jsx';
import { useHelpPrompt } from '../HelpDice.jsx';
import { useT } from '../../i18n.jsx';

// Makes an attack for a character: the Help Dice question, `attack:roll`, and the warning when a target is out of range.
// Shared by the Arcane footer (Done) and the Attack Presets. `run(request, onSent)` takes the body of `attack:roll` (see
// attackDraft.js); `onSent` is called once the attack has gone to the GM. Render `dialogs` somewhere.
export function useAttackRunner(s) {
  const t = useT();
  const { toast } = useApp();
  const helpPrompt = useHelpPrompt(s.sheet.helpDice);
  const [busy, setBusy] = useState(false);
  const [far, setFar] = useState(null); // { range, targets: [{ name, distance }] }
  const held = useRef(null); // { request, help, onSent }, kept while a range warning is answered

  async function send(confirmRange) {
    const { request, help, onSent } = held.current;
    setBusy(true);
    const r = await call('attack:roll', { characterId: s.characterId, ...request, help, confirmRange });
    setBusy(false);
    if (!r.ok) return toast(r.error);
    if (r.needsConfirm) return setFar(r.needsConfirm);
    held.current = null;
    setFar(null);
    onSent?.();
  }

  async function run(request, onSent) {
    const help = await helpPrompt.ask();
    if (help === null) return; // cancelled: no attack
    held.current = { request, help, onSent };
    await send(false);
  }

  const dialogs = (
    <>
      {helpPrompt.dialog}
      {far && (
        <Dialog title={t('Out of range')} onClose={() => setFar(null)}>
          <p className="mb-3 text-sm" data-testid="range-warning">
            {t('Some targets are farther than the weapon\'s range of {range} Spaces: {list}. The range is only a suggestion. Attack anyway?', {
              range: far.range,
              list: far.targets.map((x) => t('{name} ({n} Spaces)', { name: x.name, n: x.distance })).join(', '),
            })}
          </p>
          <div className="flex justify-end gap-2">
            <button className={btn} onClick={() => setFar(null)}>
              {t('No')}
            </button>
            <button className={btnPrimary} data-testid="range-yes" onClick={() => send(true)}>
              {t('Attack anyway')}
            </button>
          </div>
        </Dialog>
      )}
    </>
  );

  return { run, busy, dialogs };
}
