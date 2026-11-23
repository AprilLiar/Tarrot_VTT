import { randomBytes } from 'node:crypto';
import { AppError } from './errors.js';

// Images are stored in the database (Turso) and served as cacheable URLs.
// The client re-encodes every upload (resized, WebP or PNG/JPEG) before it is
// sent, so the server only has to check that the bytes really are an image and
// are not too large. Ids are random, so an image URL cannot be guessed; a
// picture of a hidden token is therefore not reachable until it is revealed.

// Not a limit people should meet: maps keep their own resolution (see the README, "Images"); this only keeps one message within what the
// socket carries.
export const IMAGE_MAX_BYTES = 60 * 1024 * 1024;

export const IMAGE_SCHEMA = [
  // Pictures posted in the chat. The chat lives in memory, so they are deleted when their message leaves it, and all of them at start.
  `CREATE TABLE IF NOT EXISTS chat_images (id TEXT PRIMARY KEY)`,
  `CREATE TABLE IF NOT EXISTS images (
     id TEXT PRIMARY KEY,
     mime TEXT NOT NULL,
     data BLOB NOT NULL,
     bytes INTEGER NOT NULL,
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   )`,
];

// Recognises PNG, JPEG and WebP (and GIF, accepted only in the chat) by their first bytes.
export function sniffImage(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf.toString('ascii', 0, 4) === 'GIF8') return 'image/gif';
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

// A GIF in the chat is sent as it is (resizing would stop it moving), so it has its own limit.
export const GIF_MAX_BYTES = 8 * 1024 * 1024;

export async function storeImage(db, data, { gif = false } = {}) {
  const buf = toBuffer(data);
  if (!buf) throw new AppError('bad_image', 'No image was sent.');
  if (buf.length > IMAGE_MAX_BYTES) {
    throw new AppError('image_too_large', 'Images can be at most {mb} MB after resizing.', { mb: IMAGE_MAX_BYTES / 1024 / 1024 });
  }
  const mime = sniffImage(buf);
  if (mime === 'image/gif' && gif && buf.length > GIF_MAX_BYTES) {
    throw new AppError('image_too_large', 'A GIF can be at most {mb} MB.', { mb: GIF_MAX_BYTES / 1024 / 1024 });
  }
  if (!mime || (mime === 'image/gif' && !gif)) throw new AppError('bad_image', 'Only PNG, JPEG and WebP images are accepted.');
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
      { sql: 'SELECT COUNT(*) AS n FROM characters WHERE portrait_image_id = ? OR token_image_id = ?', args: [id, id] },
    ],
    'read',
  );
  if (used.every((r) => Number(r.rows[0].n) === 0)) {
    await db.execute({ sql: 'DELETE FROM images WHERE id = ?', args: [id] });
  }
}

export async function storeChatImage(db, data) {
  const id = await storeImage(db, data, { gif: true });
  await db.execute({ sql: 'INSERT INTO chat_images (id) VALUES (?)', args: [id] });
  return id;
}

export async function deleteChatImages(db, ids) {
  for (const id of ids) {
    await db.batch(
      [
        { sql: 'DELETE FROM images WHERE id = ?', args: [id] },
        { sql: 'DELETE FROM chat_images WHERE id = ?', args: [id] },
      ],
      'write',
    );
  }
}

// At start the chat is empty: every picture left from before goes.
export async function sweepChatImages(db) {
  await db.batch(['DELETE FROM images WHERE id IN (SELECT id FROM chat_images)', 'DELETE FROM chat_images'], 'write');
}
