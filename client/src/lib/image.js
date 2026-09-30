// Every uploaded image is resized and re-encoded in the browser before it is
// sent, so the database stays small and the server never has to decode images.
// Backgrounds become JPEG (opaque); character art keeps its transparency as
// WebP, or PNG on browsers that cannot encode WebP (Safari).

export const IMAGE_LIMITS = {
  background: { maxWidth: 1920, maxHeight: 1200 },
  character: { maxWidth: 1200, maxHeight: 1400 },
};
export const MAX_BYTES = 3 * 1024 * 1024;

function load(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That file is not an image this browser can read.'));
    };
    img.src = url;
  });
}

const toBlob = (canvas, type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));

// Fits (w, h) inside the limits without enlarging.
export function fitSize(w, h, { maxWidth, maxHeight }, extraShrink = 1) {
  const k = Math.min(1, maxWidth / w, maxHeight / h) * extraShrink;
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) };
}

// kind: 'background' | 'character'. Resolves to an ArrayBuffer ready to send.
export async function prepareImage(file, kind) {
  return (await prepareImageInfo(file, kind)).data;
}

// Same, and also says how big the resized picture is (a battle map needs its shape).
export async function prepareImageInfo(file, kind) {
  if (!file || !file.type.startsWith('image/')) throw new Error('Choose an image file.');
  const img = await load(file);
  const limits = IMAGE_LIMITS[kind];
  let shrink = 1;
  for (let attempt = 0; attempt < 6; attempt++) {
    const { width, height } = fitSize(img.naturalWidth, img.naturalHeight, limits, shrink);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (kind === 'background') {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, width, height);
    }
    ctx.drawImage(img, 0, 0, width, height);
    let blob;
    if (kind === 'background') {
      blob = await toBlob(canvas, 'image/jpeg', 0.85);
    } else {
      blob = await toBlob(canvas, 'image/webp', 0.9);
      if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/png');
    }
    if (blob && blob.size <= MAX_BYTES) return { data: await blob.arrayBuffer(), width, height };
    shrink *= 0.8;
  }
  throw new Error('That image is too large even after resizing. Try a smaller one.');
}

export const imageUrl = (id) => (id ? `/api/images/${id}` : null);
