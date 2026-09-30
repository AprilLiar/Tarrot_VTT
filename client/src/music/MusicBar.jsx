import { useState } from 'react';
import { useApp } from '../AppContext.jsx';
import { useMusicContext } from './MusicContext.jsx';
import { MusicPanel, VolumeControl } from './MusicPanel.jsx';

// The slim music bar: a spinning record and the first 15 characters of the song
// name. It only takes up as much room as it needs; everything around it stays
// clickable. The GM clicks it for the full player. On the Display, a click or
// right-click opens the volume control.
const shorten = (name) => {
  const chars = Array.from(name);
  return chars.length > 15 ? `${chars.slice(0, 15).join('')}…` : name;
};

export default function MusicBar() {
  const music = useMusicContext();
  const { identity } = useApp();
  const [open, setOpen] = useState(false);
  const [volumeOpen, setVolumeOpen] = useState(false);
  if (!music.enabled) return null;

  const isGm = identity?.role === 'gm';
  const s = music.state;
  const hasTrack = s?.trackId != null;
  // The Display shows the bar only while there is something to hear (or to unlock).
  if (!isGm && !hasTrack && !music.blocked) return null;

  const label = hasTrack ? shorten(s.name) : 'Music';

  return (
    <>
      <div className="relative">
        <button
          type="button"
          data-testid="music-bar"
          title={hasTrack ? s.name : 'Music'}
          className="pointer-events-auto flex max-w-[22rem] items-center gap-2 rounded-full bg-black/45 px-3 py-1 text-sm text-white backdrop-blur"
          onClick={() => {
            if (music.blocked) music.unlock();
            else if (isGm) setOpen(true);
            else setVolumeOpen((v) => !v);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            setVolumeOpen((v) => !v);
          }}
        >
          <span className={`record ${s?.isPlaying ? 'spinning' : ''}`} data-testid="music-record" data-playing={s?.isPlaying ? 'true' : 'false'} />
          <span className="truncate" data-testid="music-title">
            {label}
          </span>
          {music.blocked && (
            <span className="shrink-0 rounded-full bg-amber-500/80 px-2 text-xs text-black" data-testid="music-unlock">
              Click for sound
            </span>
          )}
        </button>
        {volumeOpen && (
          <div className="pointer-events-auto absolute right-0 top-full z-50 mt-2 w-56 rounded-xl bg-[#1a1626] p-3 shadow-xl" data-testid="volume-popover">
            <VolumeControl music={music} />
            <button className="mt-2 w-full rounded-lg bg-white/10 py-2 text-sm" onClick={() => setVolumeOpen(false)}>
              Close
            </button>
          </div>
        )}
      </div>
      {open && isGm && <MusicPanel onClose={() => setOpen(false)} />}
    </>
  );
}
