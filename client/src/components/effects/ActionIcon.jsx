import { ACTION_ICONS } from './basicActionIconData.js';

// A Basic Action's icon (the one the Foundry DC20 system gives it), drawn in the text colour. With no icon it leaves an empty square of the
// same size (`keepSpace`) so the names in a list line up.
export function ActionIcon({ icon, size = 24, keepSpace = true }) {
  const body = ACTION_ICONS[icon];
  if (!body) return keepSpace ? <span aria-hidden className="inline-block shrink-0" style={{ width: size, height: size }} /> : null;
  return (
    <svg viewBox="0 0 512 512" width={size} height={size} fill="currentColor" aria-hidden="true" className="shrink-0 opacity-90" data-testid="action-icon" data-icon={icon} dangerouslySetInnerHTML={{ __html: body }} />
  );
}
