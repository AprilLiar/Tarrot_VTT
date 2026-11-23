import { call, useApp } from '../../AppContext.jsx';
import { btn } from '../Dialog.jsx';
import { useT } from '../../i18n.jsx';

// GM Rewind (see the README): puts the battle back as it was before its newest saved step (an applied attack, a move or Next turn), up to
// 5 in a row. The count says how many steps are saved; the tooltip names what the next one undoes.
export function RewindButton({ className = '' }) {
  const t = useT();
  const { stage, toast } = useApp();
  const steps = stage.battle?.rewind ?? [];
  const next = steps[0];
  const what = next ? t(next.key, next.params) : null;
  return (
    <button
      className={`${btn} min-h-9 text-sm ${className}`}
      data-testid="rewind"
      data-steps={steps.length}
      disabled={!steps.length}
      title={what ? t('Undo: {what}', { what }) : t('Nothing to rewind.')}
      onClick={async () => {
        const r = await call('battle:rewind');
        if (!r.ok) toast(r.error);
      }}
    >
      {t('Rewind ({n})', { n: steps.length })}
    </button>
  );
}
