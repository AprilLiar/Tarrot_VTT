import { imageUrl } from '../lib/image.js';
import { Initial } from './Picker.jsx';

// A character's Portrait as a small round picture (cropped to the top of the picture, where a face is); the coloured initial when it has none.
export function Avatar({ name, imageId, size = 'h-12 w-12 text-xl', testId }) {
  if (!imageId) return <Initial name={name} size={size} />;
  return <img src={imageUrl(imageId)} alt="" draggable={false} data-testid={testId} className={`shrink-0 rounded-full bg-black/40 object-cover object-top ${size}`} />;
}
