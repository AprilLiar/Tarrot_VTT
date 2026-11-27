import { useCallback, useEffect, useState } from 'react';
import { socket } from '../../socket.js';
import { call, useApp } from '../../AppContext.jsx';
import { useT } from '../../i18n.jsx';
import { useHelpPrompt } from '../HelpDice.jsx';

// A character's sheet, loaded and kept live, with the ways to change it: used by the full sheet (SheetPage) and the combat card.
// -> { data: { character, sheet } | null, error, set(path, value), list(list, action, payload), roll(kind, key, opts), helpPrompt }
// (render `helpPrompt.dialog` where the sheet is shown: it asks for Help Dice before a roll).
export function useSheet(characterId) {
  const t = useT();
  const { toast, setChatOpen } = useApp();
  const [data, setData] = useState(null); // { character, sheet }
  const [error, setError] = useState(null);

  useEffect(() => {
    let live = true;
    setData(null);
    setError(null);
    const load = () =>
      call('sheet:get', { characterId }).then((r) => {
        if (!live) return;
        if (r.ok) setData({ character: r.character, sheet: r.sheet });
        else setError(r.error ?? t('Could not load the sheet.'));
      });
    const onUpdated = (u) => {
      if (u.characterId === characterId) setData((d) => (d ? { ...d, sheet: u.sheet } : d));
    };
    const onCharacter = (u) => {
      if (u.character.id === characterId) setData((d) => (d ? { ...d, character: u.character } : d));
    };
    load();
    socket.on('sheet:updated', onUpdated);
    socket.on('character:updated', onCharacter); // the Portrait changed
    socket.on('connect', load); // catch up after a dropped connection
    return () => {
      live = false;
      socket.off('sheet:updated', onUpdated);
      socket.off('character:updated', onCharacter);
      socket.off('connect', load);
    };
  }, [characterId]);

  // Edits report their error as a toast; success arrives as `sheet:updated`.
  const set = useCallback(
    async (path, value) => {
      const r = await call('sheet:set', { characterId, path, value });
      if (!r.ok) toast(r.error ?? t('That change was not saved.'));
      return r;
    },
    [characterId, toast, t],
  );

  const list = useCallback(
    async (listName, action, payload = {}) => {
      const r = await call('sheet:list', { characterId, list: listName, action, ...payload });
      if (!r.ok) toast(r.error ?? t('That change was not saved.'));
      return r;
    },
    [characterId, toast, t],
  );

  // Before any roll the player may spend Help Dice.
  const helpPrompt = useHelpPrompt(data?.sheet.helpDice);
  const askHelp = helpPrompt.ask;
  const roll = useCallback(
    async (kind, key, opts = {}) => {
      // Luck is a pure roll: no Help Dice are offered.
      const help = kind === 'attribute' && key === 'luck' ? [] : await askHelp();
      if (help === null) return; // cancelled: no roll
      const r = await call('roll:make', { characterId, kind, key, ...opts, help });
      if (r.ok) setChatOpen(true);
      else toast(r.error ?? t('The roll failed.'));
    },
    [characterId, toast, setChatOpen, t, askHelp],
  );

  return { data, error, set, list, roll, helpPrompt };
}
