import * as audio from './audio.js';
import * as scenes from './scenes.js';

// Scene music (see the README): a scene can have a track for Scene mode and one for Battle mode, chosen from the music player's playlists.
//  - Activating a scene, or switching the mode, plays the track the scene has for that mode, looped. Battle mode without a battle track
//    keeps the scene's track; a scene (or mode) with no track leaves whatever is playing alone, and so does deactivating the scene.
//  - Music the GM starts by hand in the player wins: scene changes leave it alone until it is stopped or runs out, and then the active
//    scene's track starts again from the beginning.
// One controller for the server; `broadcast` sends the player's state to every listener.
export function createSceneMusic({ db, player, broadcast }) {
  async function wanted() {
    const id = await scenes.getActiveSceneId(db);
    if (id == null) return null;
    const scene = await scenes.getScene(db, id).catch(() => null);
    if (!scene) return null;
    const battle = (await scenes.getMode(db)) === 'battle';
    const trackId = (battle && scene.battleMusicTrackId) || scene.musicTrackId;
    if (trackId == null) return null;
    return audio.getTrack(db, trackId).catch(() => null);
  }

  return {
    wanted,
    // Called after anything that may change which scene track should play.
    async apply() {
      if (player.current != null && player.state.source === 'manual') return;
      const track = await wanted();
      if (!track) return;
      if (player.current === track.id && player.state.source === 'scene') return; // the same track goes on
      player.play(track, { source: 'scene' });
      broadcast();
    },
  };
}
