import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ScreenReference } from '../../../shared/types/core';
import { FileToolError } from '../tools/file-text';

// The desktop app decodes and shrinks pictures with Electron's nativeImage. A headless run has no Electron, so it
// reads the size from the file header and sends the original bytes; a picture the model API would refuse is rejected
// here with a message that tells the model how to shrink it.
const MAX_BYTES = 5 * 1024 * 1024,
  MAX_SIDE = 8000;
const FORMATS = [
  { ext: 'png', mime: 'image/png' },
  { ext: 'jpg', mime: 'image/jpeg' },
  { ext: 'webp', mime: 'image/webp' },
  { ext: 'gif', mime: 'image/gif' },
];

export function imageSize(bytes: Buffer): { ext: string; width: number; height: number } | undefined {
  if (bytes.length > 24 && bytes.toString('hex', 0, 8) === '89504e470d0a1a0a')
    return { ext: 'png', width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  if (bytes.length > 10 && /^GIF8[79]a$/.test(bytes.toString('latin1', 0, 6)))
    return { ext: 'gif', width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
  if (bytes.length > 30 && bytes.toString('latin1', 0, 4) === 'RIFF' && bytes.toString('latin1', 8, 12) === 'WEBP') {
    const kind = bytes.toString('latin1', 12, 16);
    if (kind === 'VP8 ')
      return { ext: 'webp', width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
    if (kind === 'VP8L') {
      const bits = bytes.readUInt32LE(21);
      return { ext: 'webp', width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (kind === 'VP8X')
      return { ext: 'webp', width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3) };
    return undefined;
  }
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    for (let at = 2; at + 9 < bytes.length;) {
      if (bytes[at] !== 0xff) {
        at++;
        continue;
      }
      const marker = bytes[at + 1];
      if (marker === 0xff) {
        at++;
        continue;
      }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        at += 2;
        continue;
      }
      // SOF0–SOF15 carry the frame size, except DHT (c4), JPG (c8) and DAC (cc).
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
        return { ext: 'jpg', height: bytes.readUInt16BE(at + 5), width: bytes.readUInt16BE(at + 7) };
      at += 2 + bytes.readUInt16BE(at + 2);
    }
  }
  return undefined;
}

/** Stores pictures a tool wants the model to see, and turns a stored id back into a data URL for the request. */
export function headlessImages(dir: string) {
  mkdirSync(dir, { recursive: true });
  return {
    preview(bytes: Buffer, id: string): ScreenReference | undefined {
      const size = imageSize(bytes);
      if (!size || size.width < 1 || size.height < 1) return undefined;
      if (bytes.length > MAX_BYTES || size.width > MAX_SIDE || size.height > MAX_SIDE)
        throw new FileToolError(
          'IMAGE_TOO_LARGE',
          `图片 ${size.width}×${size.height}、${Math.round(bytes.length / 1024)} KB，超过本次运行可直接查看的范围（5 MB、单边 ${MAX_SIDE} 像素）。请先用命令缩小或裁剪，再查看。`,
        );
      writeFileSync(join(dir, `${id}.${size.ext}`), bytes);
      return { id, width: size.width, height: size.height };
    },
    resolve(id: string) {
      if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('无效截图 ID');
      for (const { ext, mime } of FORMATS) {
        const file = join(dir, `${id}.${ext}`);
        if (existsSync(file)) return `data:${mime};base64,${readFileSync(file).toString('base64')}`;
      }
      throw new Error('找不到图片：' + id);
    },
  };
}
