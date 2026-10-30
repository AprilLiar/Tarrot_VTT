import { useRef, useState } from 'react';
import { call, useApp } from '../../AppContext.jsx';
import Dialog, { btn, btnPrimary } from '../Dialog.jsx';
import { imageUrl, prepareImage } from '../../lib/image.js';
import { PicturesManager, usePictures } from '../scene/Pictures.jsx';
import { useT } from '../../i18n.jsx';

const heading = 'mb-2 text-sm uppercase tracking-wide opacity-60';

// The character's picture collection (Scene art, later Battle tokens).
export function PicturesSection({ s }) {
  const t = useT();
  return (
    <section aria-label={t('Pictures')}>
      <h2 className={heading}>{t('Pictures')}</h2>
      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
        <PicturesManager owner={{ characterId: s.characterId }} portrait={s.character.portraitImageId ?? null} />
      </div>
    </section>
  );
}

// The character's Portrait (PC or NPC): one image, shown on the sheet, in the roster, on the picker and in the combat order.
export function PortraitSection({ s }) {
  const t = useT();
  const { toast } = useApp();
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const imageId = s.character.portraitImageId;

  async function onFile(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    let r;
    try {
      r = await call('portrait:set', { characterId: s.characterId, data: await prepareImage(file, 'character') });
    } catch (err) {
      r = { ok: false, error: t(err.message) };
    }
    setBusy(false);
    if (!r.ok) toast(r.error ?? t('Upload failed.'));
  }

  return (
    <section aria-label={t('Portrait')}>
      <h2 className={heading}>{t('Portrait')}</h2>
      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
        {imageId ? (
          <div className="mb-2 flex h-40 items-center justify-center overflow-hidden rounded bg-[repeating-conic-gradient(#222_0%_25%,#2c2c2c_0%_50%)] bg-[length:16px_16px]">
            <img src={imageUrl(imageId)} alt={t('Portrait')} className="max-h-full max-w-full object-contain" data-testid="portrait-image" />
          </div>
        ) : (
          <p className="mb-2 text-sm opacity-60">{t('No Portrait yet.')}</p>
        )}
        <input ref={fileRef} type="file" accept="image/*" hidden data-testid="portrait-file" onChange={onFile} />
        <div className="flex gap-2">
          <button className={`${btn} flex-1`} disabled={busy} data-testid="portrait-set" onClick={() => fileRef.current?.click()}>
            {busy ? t('Uploading...') : imageId ? t('Change Portrait') : t('Set Portrait')}
          </button>
          {imageId && (
            <button
              className={btn}
              disabled={busy}
              data-testid="portrait-remove"
              onClick={async () => {
                const r = await call('portrait:clear', { characterId: s.characterId });
                if (!r.ok) toast(r.error);
              }}
            >
              {t('Remove Portrait')}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

// A player puts their own PC on the scene, or takes it off again.
export function StageSection({ s }) {
  const t = useT();
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
    <section aria-label={t('Stage')}>
      <h2 className={heading}>{t('Scene')}</h2>
      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
        {!stage.scene ? (
          <p className="text-sm opacity-70">{t('No scene is active right now.')}</p>
        ) : (
          <>
            <p className="mb-2 text-sm opacity-70">
              {t('Scene: {name}', { name: stage.scene.name })}
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
                {t('Leave the stage')}
              </button>
            ) : (
              <button
                className={btnPrimary}
                data-testid="join-stage"
                disabled={!pictures}
                onClick={() => {
                  if (!pictures?.length) toast(t('Add a picture below first.'));
                  else if (pictures.length === 1) summon(pictures[0].id);
                  else setChoosing(true);
                }}
              >
                {t('Join the stage')}
              </button>
            )}
          </>
        )}
      </div>
      {choosing && (
        <Dialog title={t('Choose a picture')} onClose={() => setChoosing(false)}>
          <div className="grid grid-cols-3 gap-2">
            {pictures.map((p) => (
              <button
                key={p.id}
                className="flex h-28 items-center justify-center overflow-hidden rounded bg-white/5 active:bg-white/15"
                aria-label={p.name || t('Picture')}
                onClick={() => {
                  setChoosing(false);
                  summon(p.id);
                }}
              >
                <img src={imageUrl(p.imageId)} alt="" className="max-h-full max-w-full object-contain" />
              </button>
            ))}
          </div>
          <button className={`${btn} mt-3 w-full`} onClick={() => setChoosing(false)}>
            {t('Close')}
          </button>
        </Dialog>
      )}
    </section>
  );
}
