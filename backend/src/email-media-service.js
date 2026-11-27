import { randomUUID } from 'node:crypto';
import { access, mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { mediaCid, mediaIdPattern } from './email-design.js';

export const maxImageBytes = 5 * 1024 * 1024;
const maxMessageMediaBytes = 12 * 1024 * 1024;
const mimeTypes = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
};
const imageOptions = { limitInputPixels: 24_000_000, failOn: 'error' };
const cidPattern = /cid:bulkmail-media-([a-f0-9-]{36})@bulkmail\.local/g;
const error = (message) => ({ ok: false, error: message });

function imageFormat(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return 'jpeg';
  if (
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return 'png';
  if (/^GIF8[79]a$/.test(bytes.toString('ascii', 0, 6))) return 'gif';
  if (
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP'
  )
    return 'webp';
  return null;
}
export const mediaDirectory = (db) => path.join(path.dirname(db.name), 'media');
const mediaPath = (db, id) => path.join(mediaDirectory(db), id);

function mediaFromRow(row) {
  return {
    id: row.id,
    name: row.name,
    mimeType: row.mime_type,
    width: row.width,
    height: row.height,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
  };
}

function getMediaRow(db, id) {
  return typeof id === 'string' && mediaIdPattern.test(id)
    ? db.prepare('SELECT * FROM email_media WHERE id = ?').get(id)
    : undefined;
}

export function listMedia(db, input) {
  const search = typeof input === 'string' ? input.trim().slice(0, 100) : '';
  const rows = db
    .prepare(
      'SELECT * FROM email_media WHERE archived_at IS NULL AND instr(lower(name), lower(?)) > 0 ORDER BY created_at DESC LIMIT 250',
    )
    .all(search || '');
  return { ok: true, media: rows.map(mediaFromRow) };
}

async function persist(db, bytes, filename) {
  const kind = imageFormat(bytes);
  if (!kind || bytes.length > maxImageBytes)
    return error('Use a genuine JPG, PNG, GIF, or WebP image up to 5 MB.');
  let details;
  try {
    details = await sharp(bytes, {
      ...imageOptions,
      animated: true,
    }).metadata();
    if (
      details.format !== kind ||
      !details.width ||
      !details.height ||
      details.width > 6000 ||
      (details.pageHeight || details.height) > 6000 ||
      details.width * details.height > 24_000_000
    ) {
      return error(
        'Choose an image no larger than 6,000 pixels per side and 24 megapixels across all frames.',
      );
    }
    if (
      details.orientation &&
      details.orientation > 1 &&
      (!details.pages || details.pages === 1)
    ) {
      bytes = await sharp(bytes, imageOptions).autoOrient().toBuffer();
      details = await sharp(bytes, imageOptions).metadata();
    } else {
      // Read the final pixel so truncated input is detected before the asset is accepted.
      await sharp(bytes, imageOptions)
        .resize({ width: 1, height: 1 })
        .toBuffer();
    }
  } catch {
    return error('The image could not be opened. Try another file.');
  }
  if (bytes.length > maxImageBytes)
    return error('The processed image exceeds 5 MB.');
  const name =
    typeof filename === 'string'
      ? path.win32
          .basename(path.posix.basename(filename))
          .replace(/[^\p{L}\p{N} ._()-]/gu, '')
          .slice(0, 140)
          .trim()
      : '';
  const id = randomUUID();
  await mkdir(mediaDirectory(db), { recursive: true, mode: 0o700 });
  await writeFile(mediaPath(db, id), bytes, { flag: 'wx', mode: 0o600 });
  try {
    db.prepare(
      'INSERT INTO email_media VALUES (?, ?, ?, ?, ?, ?, ?, NULL)',
    ).run(
      id,
      name || 'Image.' + kind,
      mimeTypes[kind],
      details.width,
      details.pageHeight || details.height,
      bytes.length,
      new Date().toISOString(),
    );
  } catch (cause) {
    await unlink(mediaPath(db, id));
    throw cause;
  }
  return { ok: true, media: mediaFromRow(getMediaRow(db, id)) };
}

export function uploadMedia(db, input) {
  const base64 = input?.fileData;
  if (
    typeof base64 !== 'string' ||
    base64.length > Math.ceil(maxImageBytes / 3) * 4 ||
    base64.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)
  ) {
    return error('Select an image up to 5 MB.');
  }
  return persist(db, Buffer.from(base64, 'base64'), input.name);
}

export async function mediaImage(db, input) {
  const row = getMediaRow(db, typeof input === 'string' ? input : input?.id);
  if (!row) return error('This image is unavailable.');
  try {
    const bytes = await readFile(mediaPath(db, row.id));
    if (input?.preview === true) {
      const thumbnail = await sharp(bytes, imageOptions)
        .resize({
          width: 640,
          height: 640,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: 80 })
        .toBuffer();
      return {
        ok: true,
        media: mediaFromRow(row),
        dataUrl: 'data:image/webp;base64,' + thumbnail.toString('base64'),
      };
    }
    return {
      ok: true,
      media: mediaFromRow(row),
      dataUrl: 'data:' + row.mime_type + ';base64,' + bytes.toString('base64'),
    };
  } catch (cause) {
    if (cause.code !== 'ENOENT') throw cause;
    return error('The image file is missing from backend media storage.');
  }
}

export async function cropMedia(db, input) {
  const row = getMediaRow(db, input?.id);
  if (!row) return error('This image is unavailable.');
  const left = Number(input.left ?? 0);
  const top = Number(input.top ?? 0);
  const width = Number(input.width ?? row.width);
  const height = Number(input.height ?? row.height);
  const size = Number(input.outputWidth || width);
  if (
    ![left, top, width, height, size].every(Number.isInteger) ||
    left < 0 ||
    top < 0 ||
    width < 1 ||
    height < 1 ||
    left + width > row.width ||
    top + height > row.height ||
    size < 1 ||
    size > 2400
  )
    return error(
      'Use a crop inside the image and an output width between 1 and 2,400 pixels.',
    );
  try {
    const bytes = await sharp(mediaPath(db, row.id), {
      ...imageOptions,
      animated: true,
    })
      .extract({ left, top, width, height })
      .resize({ width: size, withoutEnlargement: true })
      .toBuffer();
    return await persist(
      db,
      bytes,
      row.name.replace(/(\.[^.]+)?$/, ' cropped$1'),
    );
  } catch {
    return error(
      'The crop could not be saved. Check the dimensions or choose another image.',
    );
  }
}

export function archiveMedia(db, id) {
  if (!getMediaRow(db, id)) return error('This image is unavailable.');
  db.prepare('UPDATE email_media SET archived_at = ? WHERE id = ?').run(
    new Date().toISOString(),
    id,
  );
  return { ok: true };
}

export function mediaIds(html) {
  return [...new Set([...html.matchAll(cidPattern)].map((match) => match[1]))];
}

export async function missingMedia(db, html) {
  const missing = [];
  for (const id of mediaIds(html)) {
    const row = getMediaRow(db, id);
    if (
      !row ||
      !(await access(mediaPath(db, id)).then(
        () => true,
        () => false,
      ))
    )
      missing.push(id);
  }
  return missing;
}

async function embeddedMedia(db, html, allowMissing = false) {
  const items = [];
  let bytes = 0;
  for (const id of mediaIds(html)) {
    const row = getMediaRow(db, id);
    if (!row) {
      if (allowMissing) continue;
      throw new Error('Email references a missing image.');
    }
    bytes += row.size_bytes;
    if (bytes > maxMessageMediaBytes)
      throw new Error(
        'Embedded images exceed 12 MB. Reduce image sizes before sending or exporting.',
      );
    const content = await readFile(mediaPath(db, id)).catch((cause) => {
      if (allowMissing && cause.code === 'ENOENT') return null;
      throw cause;
    });
    if (content)
      items.push({
        filename: row.name,
        cid: mediaCid(row.id),
        contentType: row.mime_type,
        content,
      });
  }
  return items;
}

export function mediaAttachments(db, html) {
  return embeddedMedia(db, html);
}

export async function portableHtml(db, html, allowMissing = false) {
  for (const file of await embeddedMedia(db, html, allowMissing)) {
    html = html.replaceAll(
      'cid:' + file.cid,
      'data:' + file.contentType + ';base64,' + file.content.toString('base64'),
    );
  }
  return html;
}
