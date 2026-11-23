import { useState } from 'react';
import { imageUrl } from '../../lib/image.js';
import { useOpaqueBounds } from '../../lib/opaqueBounds.js';

// The face of a Battle token, filling its round frame (the frame and its ring are the caller's).
//  - A character's custom token (`tokenImageId`) fills the circle, centred.
//  - Otherwise the default token is cut from the character's picture (`imageId`, the one it shows on the scene or its first): the top
//    square of the visible character, as wide as the character and starting at its highest visible pixel (head and shoulders). Cut-out
//    pictures have transparent edges, which are left out (see lib/opaqueBounds.js).
export function TokenFace({ imageId, tokenImageId, alt = '' }) {
  if (tokenImageId) {
    return <img src={imageUrl(tokenImageId)} alt={alt} draggable={false} className="h-full w-full object-cover" data-testid="token-face" data-kind="custom" />;
  }
  return <DefaultFace url={imageId ? imageUrl(imageId) : null} alt={alt} />;
}

function DefaultFace({ url, alt }) {
  const bounds = useOpaqueBounds(url);
  const [nat, setNat] = useState(null);
  if (!url) return null;
  const onLoad = (e) => setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight });
  if (!bounds || !nat) {
    return <img src={url} alt={alt} draggable={false} onLoad={onLoad} className="h-full w-full object-cover opacity-0" data-testid="token-face" data-kind="default" />;
  }
  const vw = (bounds.x1 - bounds.x0) * nat.w; // the visible character, in the picture's pixels
  const vh = (bounds.y1 - bounds.y0) * nat.h;
  const side = Math.max(1, Math.min(vw, vh));
  const left = ((bounds.x0 + bounds.x1) / 2) * nat.w - side / 2;
  const top = bounds.y0 * nat.h;
  return (
    <img
      src={url}
      alt={alt}
      draggable={false}
      onLoad={onLoad}
      className="absolute max-w-none"
      // Sizes in % of the round frame (a square), so the cut scales with the token.
      style={{ width: `${(nat.w / side) * 100}%`, left: `${(-left / side) * 100}%`, top: `${(-top / side) * 100}%` }}
      data-testid="token-face"
      data-kind="default"
    />
  );
}
