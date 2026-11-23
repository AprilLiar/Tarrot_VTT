import { useCallback, useEffect, useRef, useState } from 'react';
import { socket } from '../socket.js';
import { loadYouTubeApi, YT_STATE } from './youtube.js';

// One synced YouTube player. The server sends an anchor ("at server time T the
// music was at position P and playing"); this works out where the music should
// be right now and nudges the player there, so every screen stays together and
// a screen that joins late starts at the right second.

const VOLUME_KEY = 'tarrot.music.volume';
const MUTE_KEY = 'tarrot.music.muted';
const DRIFT_SECONDS = 1.5;
// A track that takes over from another fades: the old one out, then the new one in, each over this long (the server starts the new
// track this much later, so every screen does it together). Stopping fades out too.
const FADE_MS = 1000;

function loadVolume() {
  try {
    const v = Number(localStorage.getItem(VOLUME_KEY));
    if (Number.isFinite(v) && v >= 0 && v <= 1 && localStorage.getItem(VOLUME_KEY) !== null) return v;
  } catch {}
  return 0.7;
}
const loadMuted = () => {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
};

const call = (event, payload) => new Promise((resolve) => socket.emit(event, payload, resolve));

// How far this device's clock is from the server's, measured with a few pings
// (the one with the shortest round trip is the most accurate).
async function measureOffset() {
  let best = null;
  for (let i = 0; i < 5; i++) {
    const t0 = Date.now();
    const r = await call('audio:ping', { t0 });
    const t1 = Date.now();
    if (r?.ok) {
      const rtt = t1 - t0;
      if (!best || rtt < best.rtt) best = { rtt, offset: r.serverMs + rtt / 2 - t1 };
    }
  }
  return best?.offset ?? 0;
}

export function useMusic({ enabled }) {
  const [state, setState] = useState(null);
  const [blocked, setBlocked] = useState(false);
  const [engineFailed, setEngineFailed] = useState(false);
  const [volume, setVolumeState] = useState(loadVolume);
  const [muted, setMutedState] = useState(loadMuted);
  const stateRef = useRef(null);
  const offsetRef = useRef(0);
  const playerRef = useRef(null);
  const loadedRef = useRef({ trackId: null });
  const volumeRef = useRef({ volume, muted });
  volumeRef.current = { volume, muted };
  const gainRef = useRef(1); // the fade, on top of the volume (0 to 1)
  const fadeRef = useRef(null);
  const switchingRef = useRef(false); // fading out before the next track or a stop: syncing waits

  // Where the music is right now, in milliseconds.
  const positionMs = useCallback(() => {
    const s = stateRef.current;
    if (!s || s.trackId == null) return 0;
    if (!s.isPlaying) return s.positionMs;
    return s.positionMs + (Date.now() + offsetRef.current - s.anchoredAtMs);
  }, []);

  const applyVolume = useCallback(() => {
    const p = playerRef.current;
    if (!p?.setVolume) return;
    const { volume: v, muted: m } = volumeRef.current;
    p.setVolume(Math.round(v * gainRef.current * 100));
    if (m) p.mute();
    else p.unMute();
  }, []);

  // Moves the fade to `target` over `ms`. A newer fade replaces an older one (whose promise then never resolves).
  const rampTo = useCallback(
    (target, ms) => {
      clearInterval(fadeRef.current);
      return new Promise((resolve) => {
        const from = gainRef.current;
        const t0 = Date.now();
        fadeRef.current = setInterval(() => {
          const k = Math.min(1, (Date.now() - t0) / ms);
          gainRef.current = from + (target - from) * k;
          applyVolume();
          if (k >= 1) {
            clearInterval(fadeRef.current);
            fadeRef.current = null;
            resolve();
          }
        }, 50);
      });
    },
    [applyVolume],
  );

  const sync = useCallback(() => {
    const p = playerRef.current;
    const s = stateRef.current;
    if (!p?.loadVideoById || !s || switchingRef.current) return;
    // Fade out what is playing, then (unless the music stopped meanwhile) carry on with whatever the state is by then.
    const fadeOut = () => {
      switchingRef.current = true;
      rampTo(0, FADE_MS).then(() => {
        switchingRef.current = false;
        if (stateRef.current?.trackId == null) {
          p.stopVideo();
          loadedRef.current = { trackId: null };
        } else {
          loadedRef.current = { trackId: null, faded: true };
          syncRef.current();
        }
      });
    };
    if (s.trackId == null) {
      if (loadedRef.current.trackId != null) fadeOut();
      return;
    }
    const target = Math.max(0, positionMs() / 1000);
    const loaded = loadedRef.current;
    if (loaded.trackId !== s.trackId || loaded.youtubeId !== s.youtubeId) {
      if (loaded.trackId != null) {
        fadeOut();
        return;
      }
      loadedRef.current = { trackId: s.trackId, youtubeId: s.youtubeId, anchorId: s.anchorId };
      gainRef.current = 0;
      if (s.isPlaying) p.loadVideoById({ videoId: s.youtubeId, startSeconds: target });
      else p.cueVideoById({ videoId: s.youtubeId, startSeconds: target });
      applyVolume();
      rampTo(1, FADE_MS);
      // If nothing started shortly after, the browser blocked autoplay.
      setTimeout(() => {
        const cur = stateRef.current;
        if (cur?.isPlaying && cur.trackId === s.trackId && p.getPlayerState?.() !== YT_STATE.PLAYING && p.getPlayerState?.() !== YT_STATE.BUFFERING) {
          setBlocked(true);
        }
      }, 2500);
      return;
    }
    const cur = p.getCurrentTime?.() ?? 0;
    const ps = p.getPlayerState?.();
    // The same track started again (repeat one, or a new anchor after a seek).
    if (loaded.anchorId !== s.anchorId) loadedRef.current = { ...loaded, anchorId: s.anchorId };
    if (s.isPlaying) {
      if (Math.abs(cur - target) > DRIFT_SECONDS || ps === YT_STATE.ENDED) p.seekTo(target, true);
      if (ps !== YT_STATE.PLAYING && ps !== YT_STATE.BUFFERING) p.playVideo();
    } else {
      if (ps === YT_STATE.PLAYING || ps === YT_STATE.BUFFERING) p.pauseVideo();
      if (Math.abs(cur - target) > 0.5) p.seekTo(target, true);
    }
  }, [applyVolume, positionMs, rampTo]);

  const syncRef = useRef(sync);
  syncRef.current = sync;

  // Listening: join the audio room, measure the clock, follow the state.
  useEffect(() => {
    if (!enabled) return undefined;
    let live = true;
    const onState = (s) => {
      stateRef.current = s;
      setState(s);
      syncRef.current();
    };
    async function join() {
      offsetRef.current = await measureOffset();
      const r = await call('audio:listen', { on: true });
      if (live && r.ok) onState(r.state);
    }
    socket.on('audio:state', onState);
    socket.on('connect', join);
    if (socket.connected) join();
    return () => {
      live = false;
      socket.off('audio:state', onState);
      socket.off('connect', join);
      call('audio:listen', { on: false });
      stateRef.current = null;
      setState(null);
    };
  }, [enabled]);

  // The player itself.
  useEffect(() => {
    if (!enabled) return undefined;
    let live = true;
    let host = document.createElement('div');
    host.setAttribute('data-testid', 'music-player-host');
    host.style.cssText = 'position:fixed;bottom:0;right:0;width:2px;height:2px;opacity:0;pointer-events:none;overflow:hidden';
    const target = document.createElement('div');
    host.appendChild(target);
    document.body.appendChild(host);

    loadYouTubeApi()
      .then((YT) => {
        if (!live) return;
        playerRef.current = new YT.Player(target, {
          width: 2,
          height: 2,
          playerVars: { controls: 0, disablekb: 1, playsinline: 1, rel: 0, fs: 0, iv_load_policy: 3 },
          events: {
            onReady: () => {
              applyVolume();
              syncRef.current();
            },
            onAutoplayBlocked: () => setBlocked(true),
            onStateChange: (e) => {
              const s = stateRef.current;
              if (!s || s.trackId == null) return;
              if (e.data === YT_STATE.ENDED) {
                call('audio:track_ended', { trackId: s.trackId, anchorId: s.anchorId });
              } else if (e.data === YT_STATE.PLAYING) {
                setBlocked(false);
                const d = playerRef.current?.getDuration?.();
                if (d > 0) call('audio:duration', { trackId: s.trackId, durationMs: Math.round(d * 1000) });
              }
            },
            onError: (e) => {
              const s = stateRef.current;
              if (s?.trackId != null) call('audio:error', { trackId: s.trackId, anchorId: s.anchorId, code: e.data });
            },
          },
        });
      })
      .catch(() => live && setEngineFailed(true));

    // Drift correction, and a catch-up when a hidden tab becomes visible again.
    const timer = setInterval(() => syncRef.current(), 5000);
    const onVisible = () => document.visibilityState === 'visible' && syncRef.current();
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      live = false;
      clearInterval(timer);
      clearInterval(fadeRef.current);
      switchingRef.current = false;
      gainRef.current = 1;
      document.removeEventListener('visibilitychange', onVisible);
      try {
        playerRef.current?.destroy?.();
      } catch {}
      playerRef.current = null;
      loadedRef.current = { trackId: null };
      host.remove();
      host = null;
    };
  }, [enabled, applyVolume]);

  // Browsers only allow sound after a tap: the next tap anywhere unlocks it.
  const unlock = useCallback(() => {
    setBlocked(false);
    const p = playerRef.current;
    loadedRef.current = { trackId: null };
    if (p?.playVideo) syncRef.current();
  }, []);

  useEffect(() => {
    if (!blocked) return undefined;
    const on = () => unlock();
    document.addEventListener('pointerdown', on, { once: true });
    return () => document.removeEventListener('pointerdown', on);
  }, [blocked, unlock]);

  const setVolume = useCallback(
    (v) => {
      setVolumeState(v);
      volumeRef.current = { ...volumeRef.current, volume: v };
      try {
        localStorage.setItem(VOLUME_KEY, String(v));
      } catch {}
      applyVolume();
    },
    [applyVolume],
  );
  const setMuted = useCallback(
    (m) => {
      setMutedState(m);
      volumeRef.current = { ...volumeRef.current, muted: m };
      try {
        localStorage.setItem(MUTE_KEY, m ? '1' : '0');
      } catch {}
      applyVolume();
    },
    [applyVolume],
  );

  return { enabled, state, blocked, engineFailed, volume, muted, setVolume, setMuted, positionMs, unlock };
}
