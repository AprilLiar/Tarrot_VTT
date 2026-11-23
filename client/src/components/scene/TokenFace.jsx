import { imageUrl } from '../../lib/image.js';
import { CroppedImage } from '../Crop.jsx';

// The face of a Battle token, filling its round frame (the frame and its ring are the caller's).
//  - A character's custom token (`tokenImageId`) fills the circle, centred.
//  - Otherwise the default token is cut from the character's picture (`imageId`, the one it shows on the scene or its first): the top
//    square of the visible character, as wide as the character and starting at its highest visible pixel (head and shoulders). Cut-out
//    pictures have transparent edges, which are left out (see lib/opaqueBounds.js). `crop` (the Crop editor on the sheet) moves and zooms
//    that cut.
export function TokenFace({ imageId, tokenImageId, crop = null, alt = '' }) {
  if (tokenImageId) {
    return <img src={imageUrl(tokenImageId)} alt={alt} draggable={false} className="h-full w-full object-cover" data-testid="token-face" data-kind="custom" />;
  }
  return <CroppedImage imageId={imageId} kind="token" crop={crop} alt={alt} testId="token-face" kindAttr="default" />;
}
