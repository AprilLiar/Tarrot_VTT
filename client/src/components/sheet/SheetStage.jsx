import { useState } from 'react';
import { call, useApp } from '../../AppContext.jsx';
import Dialog, { btn, btnPrimary } from '../Dialog.jsx';
import { imageUrl } from '../../lib/image.js';
import { PicturesManager, usePictures } from '../scene/Pictures.jsx';

const heading = 'mb-2 text-sm uppercase tracking-wide opacity-60';

// The character's picture collection (Scene art, later Battle tokens).
export function PicturesSection({ s }) {
  return (
    <section aria-label="Pictures">
      <h2 className={heading}>Pictures</h2>
      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
        <PicturesManager owner={{ characterId: s.characterId }} />
      </div>
    </section>
  );
}

// A player puts their own PC on the scene, or takes it off again.
export function StageSection({ s }) {
  const { stage, toast } = useApp();
  const pictures = usePictures({ characterId: s.characterId });
  const [choosing, setChoosing] = useState(false);
  if (s.character.type !== 'pc') return null;

  const onStage = stage.summons.find((x) => x.ownerKind === 'character' && x.ownerId === s.characterId);

  async function summon(pictureId) {
    const r = await call('stage:summon', { characterId: s.characterId, pictureId });
    if (!r.ok) toast(r.error);
  }

  return (
    <section aria-label="Stage">
      <h2 className={heading}>Scene</h2>
      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
        {!stage.scene ? (
          <p className="text-sm opacity-70">No scene is active right now.</p>
        ) : (
          <>
            <p className="mb-2 text-sm opacity-70">
              Scene: <strong>{stage.scene.name}</strong>
            </p>
            {onStage ? (
              <button
                className={btn}
                data-testid="leave-stage"
                onClick={async () => {
                  const r = await call('stage:dismiss', { id: onStage.id });
                  if (!r.ok) toast(r.error);
                }}
              >
                Leave the stage
              </button>
            ) : (
              <button
                className={btnPrimary}
                data-testid="join-stage"
                disabled={!pictures}
                onClick={() => {
                  if (!pictures?.length) toast('Add a picture below first.');
                  else if (pictures.length === 1) summon(pictures[0].id);
                  else setChoosing(true);
                }}
              >
                Join the stage
              </button>
            )}
          </>
        )}
      </div>
      {choosing && (
        <Dialog title="Choose a picture" onClose={() => setChoosing(false)}>
          <div className="grid grid-cols-3 gap-2">
            {pictures.map((p) => (
              <button
                key={p.id}
                className="flex h-28 items-center justify-center overflow-hidden rounded bg-white/5 active:bg-white/15"
                aria-label={p.name || 'Picture'}
                onClick={() => {
                  setChoosing(false);
                  summon(p.id);
                }}
              >
                <img src={imageUrl(p.imageId)} alt="" className="max-h-full max-w-full object-contain" />
              </button>
            ))}
          </div>
        </Dialog>
      )}
    </section>
  );
}
