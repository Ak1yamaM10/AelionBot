import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { headlessImages, imageSize } from '../electron/core/image/headless-images';

const png = (width: number, height: number, extra = 0) => {
  const bytes = Buffer.alloc(33 + extra);
  Buffer.from('89504e470d0a1a0a', 'hex').copy(bytes);
  bytes.write('IHDR', 12, 'latin1');
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
};

test('image size is read from the header of each supported format', () => {
  assert.deepEqual(imageSize(png(640, 480)), { ext: 'png', width: 640, height: 480 });
  const gif = Buffer.alloc(16);
  gif.write('GIF89a', 'latin1');
  gif.writeUInt16LE(30, 6);
  gif.writeUInt16LE(20, 8);
  assert.deepEqual(imageSize(gif), { ext: 'gif', width: 30, height: 20 });
  // SOI, an APP0 segment, then SOF0 with height 100 and width 200.
  const jpeg = Buffer.concat([
    Buffer.from('ffd8ffe000041234', 'hex'),
    Buffer.from('ffc0000b08', 'hex'),
    Buffer.from([0, 100, 0, 200, 1, 0, 0]),
  ]);
  assert.deepEqual(imageSize(jpeg), { ext: 'jpg', width: 200, height: 100 });
  const webp = Buffer.alloc(40);
  webp.write('RIFF', 0, 'latin1');
  webp.write('WEBP', 8, 'latin1');
  webp.write('VP8X', 12, 'latin1');
  webp.writeUIntLE(799, 24, 3);
  webp.writeUIntLE(599, 27, 3);
  assert.deepEqual(imageSize(webp), { ext: 'webp', width: 800, height: 600 });
  assert.equal(imageSize(Buffer.from('not an image at all, just some text')), undefined);
});

test('a stored picture comes back as a data URL; unreadable and oversized pictures are refused', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'aelion-headless-images-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const images = headlessImages(join(dir, 'screenshots')),
    id = randomUUID(),
    bytes = png(64, 32, 100);
  assert.deepEqual(images.preview(bytes, id), { id, width: 64, height: 32 });
  assert.equal(images.resolve(id), `data:image/png;base64,${bytes.toString('base64')}`);
  assert.equal(images.preview(Buffer.from('hello'), randomUUID()), undefined);
  assert.throws(() => images.preview(png(9000, 100), randomUUID()), { code: 'IMAGE_TOO_LARGE' });
  assert.throws(() => images.preview(png(100, 100, 6 * 1024 * 1024), randomUUID()), { code: 'IMAGE_TOO_LARGE' });
  assert.throws(() => images.resolve('../etc/passwd'), /无效/);
  assert.throws(() => images.resolve(randomUUID()), /找不到图片/);
});
