import { useEffect, useState } from 'react';
import { socket } from '../socket.js';

// A Card the GM shows to everyone (a scene note of kind Card): the screen darkens, a big title and a smaller line fade in, hold for a few
// seconds and fade out (about 5 seconds in all, the `card-play` animation in index.css). It never blocks a click. The same Card shown
// again restarts it.
export function CardCutscene() {
  const [card, setCard] = useState(null); // { seq, title, body }
  useEffect(() => {
    const onPlayed = ({ title, body }) => setCard({ seq: Date.now(), title, body });
    socket.on('card:played', onPlayed);
    return () => socket.off('card:played', onPlayed);
  }, []);
  if (!card) return null;
  return (
    <div key={card.seq} className="card-play pointer-events-none fixed inset-0 z-[5000] flex items-center justify-center" data-testid="card-cutscene" onAnimationEnd={() => setCard(null)}>
      <div className="absolute inset-0 bg-black/90" />
      <div className="relative max-w-[90vw] px-4 text-center">
        <p className="break-words text-5xl font-bold text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)] md:text-7xl" data-testid="card-title">
          {card.title}
        </p>
        {card.body && (
          <p className="mt-3 break-words text-lg text-zinc-200 md:text-2xl" data-testid="card-subtitle">
            {card.body}
          </p>
        )}
      </div>
    </div>
  );
}
