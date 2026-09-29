import { randomBytes } from 'node:crypto';
import { AppError } from './errors.js';

// Images are stored in the database (Turso) and served as cacheable URLs.
// The client re-encodes every upload (resized, WebP or PNG/JPEG) before it is
// sent, so the server only has to check that the bytes really are an image and
// are not too large. Ids are random, so an image URL cannot be guessed; a
// picture of a hidden token is therefore not reachable until it is revealed.

export const IMAGE_MAX_BYTES = 3 * 1024 * 1024;

export const IMAGE_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS images (
     id TEXT PRIMARY KEY,
     mime TEXT NOT NULL,
     data BLOB NOT NULL,
     bytes INTEGER NOT NULL,
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   )`,
];

// Recognises PNG, JPEG and WebP by their first bytes.
export function sniffImage(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

export function toBuffer(data) {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  return null;
}

export async function storeImage(db, data) {
  const buf = toBuffer(data);
  if (!buf) throw new AppError('bad_image', 'No image was sent.');
  if (buf.length > IMAGE_MAX_BYTES) {
    throw new AppError('image_too_large', `Images can be at most ${IMAGE_MAX_BYTES / 1024 / 1024} MB after resizing.`);
  }
  const mime = sniffImage(buf);
  if (!mime) throw new AppError('bad_image', 'Only PNG, JPEG and WebP images are accepted.');
  const id = randomBytes(16).toString('hex');
  await db.execute({
    sql: 'INSERT INTO images (id, mime, data, bytes) VALUES (?, ?, ?, ?)',
    args: [id, mime, buf, buf.length],
  });
  return id;
}

export async function getImage(db, id) {
  if (typeof id !== 'string' || !/^[0-9a-f]{32}$/.test(id)) return null;
  const r = await db.execute({ sql: 'SELECT mime, data FROM images WHERE id = ?', args: [id] });
  if (!r.rows.length) return null;
  return { mime: r.rows[0].mime, data: toBuffer(r.rows[0].data) };
}

// Deletes an image nothing points at any more.
export async function deleteImageIfUnused(db, id) {
  if (!id) return;
  const used = await db.batch(
    [
      { sql: 'SELECT COUNT(*) AS n FROM scenes WHERE scene_image_id = ? OR battle_image_id = ?', args: [id, id] },
      { sql: 'SELECT COUNT(*) AS n FROM pictures WHERE image_id = ?', args: [id] },
    ],
    'read',
  );
  if (Number(used[0].rows[0].n) + Number(used[1].rows[0].n) === 0) {
    await db.execute({ sql: 'DELETE FROM images WHERE id = ?', args: [id] });
  }
}
