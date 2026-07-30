import { BadRequestException } from '@nestjs/common';
import { crc32 } from 'node:zlib';
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

type PngValidationState = {
  bitDepth: number;
  colorType: number;
  paletteEntries: number;
  sawIdat: boolean;
  sawPaletteDependentChunk: boolean;
  sawPlte: boolean;
  seenSingletonChunks: Set<string>;
};

const pngSingletonAncillaryChunks = new Set([
  'bKGD',
  'cHRM',
  'cICP',
  'cLLI',
  'eXIf',
  'gAMA',
  'hIST',
  'iCCP',
  'mDCV',
  'pHYs',
  'sBIT',
  'sRGB',
  'tIME',
  'tRNS',
]);
const pngBeforePaletteAndDataChunks = new Set([
  'cHRM',
  'cICP',
  'cLLI',
  'gAMA',
  'iCCP',
  'mDCV',
  'sBIT',
  'sRGB',
]);
const pngBeforeDataChunks = new Set([
  'bKGD',
  'eXIf',
  'hIST',
  'pHYs',
  'sPLT',
  'tRNS',
]);
const unsupportedAnimatedPngChunks = new Set(['acTL', 'fcTL', 'fdAT']);

function hasOnlyPngChunkTypeLetters(typeBytes: Buffer): boolean {
  return Array.from(typeBytes).every(
    (byte) => (byte >= 0x41 && byte <= 0x5a) || (byte >= 0x61 && byte <= 0x7a),
  );
}

function hasValidPngAncillaryChunk(
  type: string,
  data: Buffer,
  state: PngValidationState,
): boolean {
  if (unsupportedAnimatedPngChunks.has(type)) {
    return false;
  }
  if (pngSingletonAncillaryChunks.has(type)) {
    if (state.seenSingletonChunks.has(type)) {
      return false;
    }
    state.seenSingletonChunks.add(type);
  }
  if (
    pngBeforePaletteAndDataChunks.has(type) &&
    (state.sawPlte || state.sawIdat)
  ) {
    return false;
  }
  if (pngBeforeDataChunks.has(type) && state.sawIdat) {
    return false;
  }

  if (type === 'cHRM' && data.length !== 32) {
    return false;
  }
  if (type === 'gAMA' && (data.length !== 4 || data.readUInt32BE(0) === 0)) {
    return false;
  }
  if (type === 'cICP' && data.length !== 4) {
    return false;
  }
  if (type === 'cLLI' && data.length !== 8) {
    return false;
  }
  if (type === 'mDCV' && data.length !== 24) {
    return false;
  }
  if (type === 'sRGB' && (data.length !== 1 || data[0] > 3)) {
    return false;
  }
  if (type === 'pHYs' && (data.length !== 9 || data[8] > 1)) {
    return false;
  }
  if (type === 'sBIT') {
    const sampleCounts = new Map([
      [0, 1],
      [2, 3],
      [3, 3],
      [4, 2],
      [6, 4],
    ]);
    const maximum = state.colorType === 3 ? 8 : state.bitDepth;
    if (
      data.length !== sampleCounts.get(state.colorType) ||
      Array.from(data).some(
        (sampleBits) => sampleBits < 1 || sampleBits > maximum,
      )
    ) {
      return false;
    }
  }
  if (type === 'tRNS') {
    if ([4, 6].includes(state.colorType)) {
      return false;
    }
    if (state.colorType === 3) {
      if (
        !state.sawPlte ||
        data.length === 0 ||
        data.length > state.paletteEntries
      ) {
        return false;
      }
    } else if (
      (state.colorType === 0 && data.length !== 2) ||
      (state.colorType === 2 && data.length !== 6)
    ) {
      return false;
    }
    state.sawPaletteDependentChunk = true;
  }
  if (type === 'bKGD') {
    const expectedLengths = new Map([
      [0, 2],
      [2, 6],
      [3, 1],
      [4, 2],
      [6, 6],
    ]);
    if (
      data.length !== expectedLengths.get(state.colorType) ||
      (state.colorType === 3 &&
        (!state.sawPlte || data[0] >= state.paletteEntries))
    ) {
      return false;
    }
    state.sawPaletteDependentChunk = true;
  }
  if (
    type === 'hIST' &&
    (!state.sawPlte ||
      state.paletteEntries === 0 ||
      data.length !== state.paletteEntries * 2)
  ) {
    return false;
  }
  return true;
}

function hasValidPngStructure(buffer: Buffer): boolean {
  const pngSignature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  if (buffer.length < 45 || !buffer.subarray(0, 8).equals(pngSignature)) {
    return false;
  }

  let offset = 8;
  let chunkIndex = 0;
  let sawIhdr = false;
  let sawIdat = false;
  let idatSequenceEnded = false;
  const state: PngValidationState = {
    bitDepth: 0,
    colorType: -1,
    paletteEntries: 0,
    sawIdat: false,
    sawPaletteDependentChunk: false,
    sawPlte: false,
    seenSingletonChunks: new Set(),
  };
  while (offset + 12 <= buffer.length) {
    const chunkLength = buffer.readUInt32BE(offset);
    if (chunkLength > 0x7fffffff) {
      return false;
    }
    const chunkTypeBytes = buffer.subarray(offset + 4, offset + 8);
    const chunkType = buffer.toString('ascii', offset + 4, offset + 8);
    const chunkEnd = offset + 12 + chunkLength;
    if (!Number.isSafeInteger(chunkEnd) || chunkEnd > buffer.length) {
      return false;
    }
    const chunkData = buffer.subarray(offset + 8, offset + 8 + chunkLength);
    const expectedCrc = buffer.readUInt32BE(offset + 8 + chunkLength);
    const actualCrc =
      crc32(buffer.subarray(offset + 4, offset + 8 + chunkLength)) >>> 0;
    if (expectedCrc !== actualCrc) {
      return false;
    }
    if (
      !hasOnlyPngChunkTypeLetters(chunkTypeBytes) ||
      (chunkTypeBytes[2] & 0x20) !== 0
    ) {
      return false;
    }

    const knownCriticalChunks = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND']);
    const isCritical = (buffer[offset + 4] & 0x20) === 0;
    if (isCritical && !knownCriticalChunks.has(chunkType)) {
      return false;
    }

    if (chunkType === 'IHDR') {
      if (chunkIndex !== 0 || sawIhdr || chunkLength !== 13) {
        return false;
      }
      const width = chunkData.readUInt32BE(0);
      const height = chunkData.readUInt32BE(4);
      state.bitDepth = chunkData[8];
      state.colorType = chunkData[9];
      const validBitDepths = new Map<number, number[]>([
        [0, [1, 2, 4, 8, 16]],
        [2, [8, 16]],
        [3, [1, 2, 4, 8]],
        [4, [8, 16]],
        [6, [8, 16]],
      ]);
      if (
        width === 0 ||
        height === 0 ||
        !validBitDepths.get(state.colorType)?.includes(state.bitDepth) ||
        chunkData[10] !== 0 ||
        chunkData[11] !== 0 ||
        ![0, 1].includes(chunkData[12])
      ) {
        return false;
      }
      sawIhdr = true;
    } else if (!sawIhdr) {
      return false;
    } else if (chunkType === 'PLTE') {
      if (
        state.sawPlte ||
        sawIdat ||
        state.sawPaletteDependentChunk ||
        [0, 4].includes(state.colorType) ||
        chunkLength === 0 ||
        chunkLength > 768 ||
        chunkLength % 3 !== 0 ||
        (state.colorType === 3 && chunkLength / 3 > 2 ** state.bitDepth)
      ) {
        return false;
      }
      state.sawPlte = true;
      state.paletteEntries = chunkLength / 3;
    } else if (chunkType === 'IDAT') {
      if (idatSequenceEnded || (state.colorType === 3 && !state.sawPlte)) {
        return false;
      }
      sawIdat = true;
      state.sawIdat = true;
    } else if (chunkType === 'IEND') {
      return sawIdat && chunkLength === 0 && chunkEnd === buffer.length;
    } else {
      if (!hasValidPngAncillaryChunk(chunkType, chunkData, state)) {
        return false;
      }
      if (sawIdat) {
        idatSequenceEnded = true;
      }
    }
    offset = chunkEnd;
    chunkIndex += 1;
  }
  return false;
}

type ParsedWebpChunk = {
  data: Buffer;
  type: string;
};

type WebpImageInfo = {
  height: number;
  width: number;
};

function getVp8Info(chunk: ParsedWebpChunk): WebpImageInfo | undefined {
  if (
    chunk.data.length < 10 ||
    chunk.data[3] !== 0x9d ||
    chunk.data[4] !== 0x01 ||
    chunk.data[5] !== 0x2a
  ) {
    return undefined;
  }
  const width = chunk.data.readUInt16LE(6) & 0x3fff;
  const height = chunk.data.readUInt16LE(8) & 0x3fff;
  if (width === 0 || height === 0) {
    return undefined;
  }
  return { width, height };
}

function getVp8lInfo(chunk: ParsedWebpChunk): WebpImageInfo | undefined {
  if (chunk.data.length < 5 || chunk.data[0] !== 0x2f) {
    return undefined;
  }
  const headerBits = chunk.data.readUInt32LE(1);
  if (headerBits >>> 29 !== 0) {
    return undefined;
  }
  // bit 28 的 alpha_is_used 只是编码器提示，规范明确禁止它影响解码。
  return {
    width: (headerBits & 0x3fff) + 1,
    height: ((headerBits >>> 14) & 0x3fff) + 1,
  };
}

/**
 * 只接受 WebP 静态图片子集：simple VP8/VP8L，或按规范排序的
 * VP8X + ICCP? + ALPH? + VP8/VP8L，并允许 EXIF/XMP 出现在任意位置。
 * 未知块一律拒绝，避免解码器容忍语义与这里的发布边界发生分歧。
 */
function hasValidWebpStructure(buffer: Buffer): boolean {
  if (
    buffer.length < 20 ||
    buffer.toString('ascii', 0, 4) !== 'RIFF' ||
    buffer.toString('ascii', 8, 12) !== 'WEBP' ||
    buffer.readUInt32LE(4) + 8 !== buffer.length
  ) {
    return false;
  }

  const chunks: ParsedWebpChunk[] = [];
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
    if (chunkLength % 2 === 1 && buffer[offset + 8 + chunkLength] !== 0) {
      return false;
    }
    chunks.push({
      type: buffer.toString('ascii', offset, offset + 4),
      data: buffer.subarray(offset + 8, offset + 8 + chunkLength),
    });
    offset = chunkEnd;
  }
  if (offset !== buffer.length || chunks.length === 0) {
    return false;
  }

  const mainChunks = chunks.filter(({ type }) =>
    ['VP8 ', 'VP8L'].includes(type),
  );
  if (mainChunks.length !== 1) {
    return false;
  }
  const mainChunk = mainChunks[0];
  const imageInfo =
    mainChunk.type === 'VP8 ' ? getVp8Info(mainChunk) : getVp8lInfo(mainChunk);
  if (!imageInfo) {
    return false;
  }

  if (chunks.length === 1) {
    return true;
  }
  if (chunks[0].type !== 'VP8X' || chunks[0].data.length !== 10) {
    return false;
  }

  const vp8x = chunks[0].data;
  const flags = vp8x[0];
  const canvasWidth = vp8x.readUIntLE(4, 3) + 1;
  const canvasHeight = vp8x.readUIntLE(7, 3) + 1;
  if (
    (flags & 0xc1) !== 0 ||
    (flags & 0x02) !== 0 ||
    vp8x[1] !== 0 ||
    vp8x[2] !== 0 ||
    vp8x[3] !== 0 ||
    canvasWidth !== imageInfo.width ||
    canvasHeight !== imageInfo.height
  ) {
    return false;
  }

  const reconstructionOrder = new Map([
    ['ICCP', 1],
    ['ALPH', 2],
    ['VP8 ', 3],
    ['VP8L', 3],
  ]);
  const allowedChunkTypes = new Set([
    ...reconstructionOrder.keys(),
    'EXIF',
    'XMP ',
  ]);
  const counts = new Map<string, number>();
  let previousOrder = 0;
  for (const chunk of chunks.slice(1)) {
    if (!allowedChunkTypes.has(chunk.type)) {
      return false;
    }
    const count = (counts.get(chunk.type) ?? 0) + 1;
    if (count > 1) {
      return false;
    }
    counts.set(chunk.type, count);
    const order = reconstructionOrder.get(chunk.type);
    if (order !== undefined) {
      if (order < previousOrder) {
        return false;
      }
      previousOrder = order;
    }
  }

  const hasIccp = counts.has('ICCP');
  const hasAlph = counts.has('ALPH');
  const hasExif = counts.has('EXIF');
  const hasXmp = counts.has('XMP ');
  const flagMatches = (mask: number, present: boolean) =>
    ((flags & mask) !== 0) === present;
  if (
    !flagMatches(0x20, hasIccp) ||
    !flagMatches(0x08, hasExif) ||
    !flagMatches(0x04, hasXmp) ||
    (mainChunk.type === 'VP8 ' &&
      (!flagMatches(0x10, hasAlph) || (hasAlph && counts.get('VP8 ') !== 1))) ||
    (mainChunk.type === 'VP8L' && hasAlph)
  ) {
    return false;
  }
  return true;
}

function hasValidJpegStructure(buffer: Buffer): boolean {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return false;
  }
  let offset = 2;
  let inScan = false;
  let sawFrame = false;
  let sawScan = false;
  let restartInterval = 0;
  let expectedRestartMarker = 0xd0;
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
      if (marker === 0x00) {
        offset += 1;
        continue;
      }
      if (marker >= 0xd0 && marker <= 0xd7) {
        if (restartInterval === 0 || marker !== expectedRestartMarker) {
          return false;
        }
        expectedRestartMarker = 0xd0 + ((expectedRestartMarker - 0xd0 + 1) % 8);
        offset += 1;
        continue;
      }
      if (marker === 0xd9) {
        return sawFrame && sawScan && offset + 1 === buffer.length;
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
      return false;
    }
    if (
      marker === 0x00 ||
      marker === 0x01 ||
      marker === 0xd8 ||
      (marker >= 0xd0 && marker <= 0xd7) ||
      offset + 2 > buffer.length
    ) {
      return false;
    }
    const isApplicationMarker = marker >= 0xe0 && marker <= 0xef;
    const isAllowedTableOrMetadataMarker = [0xc4, 0xdb, 0xdd, 0xfe].includes(
      marker,
    );
    const isFrameMarker = marker === 0xc0 || marker === 0xc2;
    const isScanMarker = marker === 0xda;
    if (
      !isApplicationMarker &&
      !isAllowedTableOrMetadataMarker &&
      !isFrameMarker &&
      !isScanMarker
    ) {
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
    if (marker === 0xdd) {
      if (segmentLength !== 4) {
        return false;
      }
      restartInterval = buffer.readUInt16BE(offset + 2);
    }
    if (isFrameMarker) {
      if (sawFrame || segmentLength < 11) {
        return false;
      }
      const componentCount = buffer[offset + 7];
      if (
        componentCount === 0 ||
        segmentLength !== 8 + 3 * componentCount ||
        buffer.readUInt16BE(offset + 3) === 0 ||
        buffer.readUInt16BE(offset + 5) === 0
      ) {
        return false;
      }
      sawFrame = true;
    }
    if (isScanMarker) {
      if (!sawFrame || segmentLength < 8) {
        return false;
      }
      const componentCount = buffer[offset + 2];
      if (componentCount === 0 || segmentLength !== 6 + 2 * componentCount) {
        return false;
      }
      sawScan = true;
    }
    offset = segmentEnd;
    if (isScanMarker) {
      expectedRestartMarker = 0xd0;
      inScan = true;
    }
  }
  return false;
}

export function hasValidImageContainerStructure(
  buffer: Buffer,
  extension: ValidatedProductImage['extension'],
): boolean {
  if (extension === 'jpg') {
    return hasValidJpegStructure(buffer);
  }
  if (extension === 'png') {
    return hasValidPngStructure(buffer);
  }
  return hasValidWebpStructure(buffer);
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

  if (!hasValidImageContainerStructure(buffer, validated.extension)) {
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
