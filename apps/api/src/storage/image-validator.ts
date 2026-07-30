import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';

const nodeModule = process.getBuiltinModule('node:module');
const requireFromHere = nodeModule.createRequire(__filename);
const { fileTypeFromBuffer } = requireFromHere(
  'file-type',
) as typeof import('file-type');

export const MAX_PRODUCT_IMAGE_SIZE = 5 * 1024 * 1024;
export const MAX_PRODUCT_IMAGE_PIXELS = 25_000_000;

export type ValidatedProductImage = {
  extension: 'jpg' | 'png' | 'webp';
  mime: 'image/jpeg' | 'image/png' | 'image/webp';
};

class ProductImageValidationException extends BadRequestException {
  readonly code = 'VALIDATION_FAILED';

  constructor(message: string) {
    super({
      code: 'VALIDATION_FAILED',
      message,
    });
  }
}

function invalidImage(message: string): ProductImageValidationException {
  return new ProductImageValidationException(message);
}

function hasExactPngBoundary(buffer: Buffer): boolean {
  let offset = 8;
  while (offset + 12 <= buffer.length) {
    const chunkLength = buffer.readUInt32BE(offset);
    const chunkType = buffer.toString('ascii', offset + 4, offset + 8);
    const chunkEnd = offset + 12 + chunkLength;
    if (!Number.isSafeInteger(chunkEnd) || chunkEnd > buffer.length) {
      return false;
    }
    if (chunkType === 'IEND') {
      return chunkLength === 0 && chunkEnd === buffer.length;
    }
    offset = chunkEnd;
  }
  return false;
}

function hasExactWebpBoundary(buffer: Buffer): boolean {
  if (buffer.length < 20 || buffer.readUInt32LE(4) + 8 !== buffer.length) {
    return false;
  }
  let offset = 12;
  while (offset < buffer.length) {
    if (offset + 8 > buffer.length) {
      return false;
    }
    const chunkLength = buffer.readUInt32LE(offset + 4);
    const chunkEnd = offset + 8 + chunkLength + (chunkLength % 2);
    if (!Number.isSafeInteger(chunkEnd) || chunkEnd > buffer.length) {
      return false;
    }
    offset = chunkEnd;
  }
  return offset === buffer.length;
}

function hasExactJpegBoundary(buffer: Buffer): boolean {
  if (buffer.length < 4) {
    return false;
  }
  let offset = 2;
  let inScan = false;
  while (offset < buffer.length) {
    if (inScan) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const markerStart = offset;
      while (offset < buffer.length && buffer[offset] === 0xff) {
        offset += 1;
      }
      if (offset >= buffer.length) {
        return false;
      }
      const marker = buffer[offset];
      if (marker === 0x00 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += 1;
        continue;
      }
      if (marker === 0xd9) {
        return offset + 1 === buffer.length;
      }
      offset = markerStart;
      inScan = false;
      continue;
    }

    if (buffer[offset] !== 0xff) {
      return false;
    }
    while (offset < buffer.length && buffer[offset] === 0xff) {
      offset += 1;
    }
    if (offset >= buffer.length) {
      return false;
    }
    const marker = buffer[offset];
    offset += 1;
    if (marker === 0xd9) {
      return offset === buffer.length;
    }
    if (
      marker === 0x01 ||
      marker === 0xd8 ||
      (marker >= 0xd0 && marker <= 0xd7)
    ) {
      continue;
    }
    if (marker === 0x00 || offset + 2 > buffer.length) {
      return false;
    }
    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2) {
      return false;
    }
    const segmentEnd = offset + segmentLength;
    if (segmentEnd > buffer.length) {
      return false;
    }
    offset = segmentEnd;
    if (marker === 0xda) {
      inScan = true;
    }
  }
  return false;
}

function hasExactContainerBoundary(
  buffer: Buffer,
  extension: ValidatedProductImage['extension'],
): boolean {
  if (extension === 'jpg') {
    return hasExactJpegBoundary(buffer);
  }
  if (extension === 'png') {
    return hasExactPngBoundary(buffer);
  }
  return hasExactWebpBoundary(buffer);
}

export async function validateProductImage(
  buffer: Buffer,
  maxSize: number = MAX_PRODUCT_IMAGE_SIZE,
): Promise<ValidatedProductImage> {
  if (
    !Buffer.isBuffer(buffer) ||
    !Number.isSafeInteger(maxSize) ||
    maxSize < 1
  ) {
    throw invalidImage('图片验证参数无效');
  }
  if (buffer.length === 0) {
    throw invalidImage('必须上传图片文件');
  }
  if (buffer.length > maxSize) {
    throw invalidImage('商品图片不能超过 5 MiB');
  }

  let detected: { ext: string; mime: string } | undefined;
  try {
    detected = await fileTypeFromBuffer(buffer);
  } catch {
    throw invalidImage('无法识别商品图片');
  }

  let validated: ValidatedProductImage;
  let decoderFormat: 'jpeg' | 'png' | 'webp';
  if (detected?.ext === 'jpg' && detected.mime === 'image/jpeg') {
    validated = { extension: 'jpg', mime: 'image/jpeg' };
    decoderFormat = 'jpeg';
  } else if (detected?.ext === 'png' && detected.mime === 'image/png') {
    validated = { extension: 'png', mime: 'image/png' };
    decoderFormat = 'png';
  } else if (detected?.ext === 'webp' && detected.mime === 'image/webp') {
    validated = { extension: 'webp', mime: 'image/webp' };
    decoderFormat = 'webp';
  } else {
    throw invalidImage('商品图片只支持 JPEG、PNG 或 WebP');
  }

  if (!hasExactContainerBoundary(buffer, validated.extension)) {
    throw invalidImage('商品图片包含截断或尾随内容');
  }

  try {
    const decoder = sharp(buffer, {
      failOn: 'warning',
      limitInputPixels: MAX_PRODUCT_IMAGE_PIXELS,
    });
    const metadata = await decoder.metadata();
    if (
      metadata.format !== decoderFormat ||
      !metadata.width ||
      !metadata.height ||
      metadata.width * metadata.height > MAX_PRODUCT_IMAGE_PIXELS ||
      (metadata.pages ?? 1) !== 1
    ) {
      throw new Error('图片解码格式与签名不一致');
    }
    await decoder.stats();
  } catch {
    throw invalidImage('商品图片内容损坏或不完整');
  }
  return validated;
}
