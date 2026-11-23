import { Initial } from './Picker.jsx';
import { CroppedImage } from './Crop.jsx';

// A character's Portrait as a small round picture: the top of the picture (where a face is), or the crop set in the Crop editor; the
// coloured initial when it has none.
export function Avatar({ name, imageId, crop = null, size = 'h-12 w-12 text-xl', testId }) {
  if (!imageId) return <Initial name={name} size={size} />;
  return (
    <span className={`relative shrink-0 overflow-hidden rounded-full bg-black/40 ${size}`} data-testid={testId}>
      <CroppedImage imageId={imageId} kind="portrait" crop={crop} />
    </span>
  );
}
