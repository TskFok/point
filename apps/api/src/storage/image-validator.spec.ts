import { crc32 } from 'node:zlib';
import sharp from 'sharp';
import * as imageValidatorModule from './image-validator';
import { validateProductImage } from './image-validator';

const nodeModule = process.getBuiltinModule('node:module');
const requireFromHere = nodeModule.createRequire(__filename);
const { fileTypeFromBuffer } = requireFromHere(
  'file-type',
) as typeof import('file-type');
const maxSize = 5 * 1024 * 1024;
const validImages = {
  jpg: Buffer.from(
    '/9j/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABwn/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdAAYqm//Z',
    'base64',
  ),
  png: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  ),
  webp: Buffer.from(
    'UklGRhwAAABXRUJQVlA4TA8AAAAvAAAAAAcQ/Y/+ByKi/wEA',
    'base64',
  ),
};
const restartJpeg = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/wAALCAAIAFABAREA/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/90ABAAB/9oACAEBAAA/AGxeF/BH/QC8N/8AhSwf/G6//9DO1bwdpU10jaJbeBbO2CANHeakly5fJyQyvGAMY4weh55wP//R57UPDEOmWEl3cnwA8UeNy2yyXEhyQOI45mZuvYHAyTwDX//S4mKXSP8An38N/wDgj1D/ABr/0+Uil0j/AJ9/Df8A4I9Q/wAa/9Tn4pdI/wCffw3/AOCPUP8AGv/VyYpdI/59/Df/AII9Q/xr/9apFLpH/Pv4b/8ABHqH+Nf/1yKXSP8An38N/wDgj1D/ABr/0LcUukf8+/hv/wAEeof41//Z',
  'base64',
);
const progressiveRestartJpeg = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/wgALCAAIAEgBAREA/8QAFwABAQEBAAAAAAAAAAAAAAAABAIDBf/dAAQAAf/aAAgBAQAAAAHl/wD/0Af/0Tf/0s//0x//1A//1Tf/1o//14//xAAYEAADAQEAAAAAAAAAAAAAAAAAAQMCBP/aAAgBAQABBQJZ4j//0FniP//RWeI//9JZ4j//06zk9f/UUT//1VE//9ZRP//XplTx/8QAJRAAAAMHAwUAAAAAAAAAAAAAAAECBAUxM5GU0QMR4hIUI1FS/9oACAEBAAY/ApLNclgf/9CSzXJYH//Rks1yWB//0pLNclgf/9PwkwoT6XqdWB//1Iu2vIf/1Yu2vIf/1ou2vIf/1zUrsNi+d1HQjH//xAAaEAEBAAIDAAAAAAAAAAAAAAABABEhMXGh/9oACAEBAAE/IZy//9Ccv//RnL//0py//9M245sKz2M//9SK/9WK/9aK/9denyHoFb//2gAIAQEAAAAQ/wD/0P8A/9F//9L/AP/T/wD/1H//1f8A/9Z//9d//8QAGRABAQEBAQEAAAAAAAAAAAAAAREAITFB/9oACAEBAAE/EN7f/9De3//R3t//0t7f/9MZRIj7agQScj497D//1Nl//9XZf//W2X//14N+hRUOegfBhV4O/9k=',
  'base64',
);
let highPixelPng: Buffer;

type WebpChunk = {
  data: Buffer;
  type: string;
};

type PngChunk = {
  data: Buffer;
  type: string;
};

type ContainerExtension = 'jpg' | 'png' | 'webp';

type NormalizedProductImage = {
  buffer: Buffer;
  keyExtension: ContainerExtension;
  mime: 'image/jpeg' | 'image/png' | 'image/webp';
};

async function normalizeProductImage(
  buffer: Buffer,
  normalizedMaxBytes?: number,
): Promise<NormalizedProductImage> {
  const normalizer = (
    imageValidatorModule as typeof imageValidatorModule & {
      validateAndNormalizeProductImage?: (
        candidate: Buffer,
        maxBytes: number,
        normalizedMaxBytes?: number,
      ) => Promise<NormalizedProductImage>;
    }
  ).validateAndNormalizeProductImage;
  expect(normalizer).toEqual(expect.any(Function));
  return normalizer(buffer, maxSize, normalizedMaxBytes);
}

function hasValidContainer(
  buffer: Buffer,
  extension: ContainerExtension,
): boolean {
  const validator = (
    imageValidatorModule as typeof imageValidatorModule & {
      hasValidImageContainerStructure?: (
        candidate: Buffer,
        candidateExtension: ContainerExtension,
      ) => boolean;
    }
  ).hasValidImageContainerStructure;
  expect(validator).toEqual(expect.any(Function));
  return validator?.(buffer, extension) ?? true;
}

function parseWebpChunks(buffer: Buffer): WebpChunk[] {
  const chunks: WebpChunk[] = [];
  let offset = 12;
  while (offset < buffer.length) {
    const type = buffer.toString('ascii', offset, offset + 4);
    const length = buffer.readUInt32LE(offset + 4);
    chunks.push({
      type,
      data: Buffer.from(buffer.subarray(offset + 8, offset + 8 + length)),
    });
    offset += 8 + length + (length % 2);
  }
  return chunks;
}

function buildWebp(chunks: WebpChunk[], paddingByte = 0): Buffer {
  const encodedChunks = chunks.map(({ type, data }) => {
    const header = Buffer.alloc(8);
    header.write(type, 0, 4, 'ascii');
    header.writeUInt32LE(data.length, 4);
    return Buffer.concat([
      header,
      data,
      ...(data.length % 2 === 1 ? [Buffer.from([paddingByte])] : []),
    ]);
  });
  const body = Buffer.concat([Buffer.from('WEBP'), ...encodedChunks]);
  const header = Buffer.alloc(8);
  header.write('RIFF', 0, 4, 'ascii');
  header.writeUInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
}

function parsePngChunks(buffer: Buffer): PngChunk[] {
  const chunks: PngChunk[] = [];
  let offset = 8;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    chunks.push({
      type: buffer.toString('ascii', offset + 4, offset + 8),
      data: Buffer.from(buffer.subarray(offset + 8, offset + 8 + length)),
    });
    offset += 12 + length;
  }
  return chunks;
}

function buildPng(chunks: PngChunk[]): Buffer {
  const signature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  const encoded = chunks.map(({ type, data }) => {
    const typeBytes = Buffer.from(type, 'ascii');
    const header = Buffer.alloc(8);
    header.writeUInt32BE(data.length);
    typeBytes.copy(header, 4, 0, 4);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])) >>> 0);
    return Buffer.concat([header, data, checksum]);
  });
  return Buffer.concat([signature, ...encoded]);
}

function insertPngChunkBefore(
  buffer: Buffer,
  beforeType: string,
  chunk: PngChunk,
): Buffer {
  const chunks = parsePngChunks(buffer);
  const index = chunks.findIndex(({ type }) => type === beforeType);
  if (index < 0) {
    throw new Error(`找不到 PNG 数据块 ${beforeType}`);
  }
  chunks.splice(index, 0, chunk);
  return buildPng(chunks);
}

function jpegMarkerOffsets(buffer: Buffer, markerStart: number): number[] {
  const offsets: number[] = [];
  for (let index = 0; index + 1 < buffer.length; index += 1) {
    if (buffer[index] === 0xff && buffer[index + 1] === markerStart) {
      offsets.push(index);
    }
  }
  return offsets;
}

function corruptPngCrc(buffer: Buffer, chunkType: string): Buffer {
  const corrupted = Buffer.from(buffer);
  let offset = 8;
  while (offset < corrupted.length) {
    const length = corrupted.readUInt32BE(offset);
    if (corrupted.toString('ascii', offset + 4, offset + 8) === chunkType) {
      corrupted[offset + 8 + length] ^= 0xff;
      return corrupted;
    }
    offset += 12 + length;
  }
  throw new Error(`找不到 PNG 数据块 ${chunkType}`);
}

describe('validateProductImage', () => {
  beforeAll(async () => {
    highPixelPng = await sharp({
      create: {
        width: 5001,
        height: 5001,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .png()
      .toBuffer();
  });

  it.each([
    ['text/plain', Buffer.from('not-an-image')],
    ['image/svg+xml', Buffer.from('<svg></svg>')],
  ])('拒绝不允许的真实文件类型 %s', async (_mime, buffer) => {
    await expect(validateProductImage(buffer, maxSize)).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });

  it.each([
    ['空文件', Buffer.alloc(0)],
    ['截断 JPEG', Buffer.from([0xff, 0xd8, 0xff])],
    [
      'PNG 签名后拼接文本',
      Buffer.concat([
        validImages.png.subarray(0, 8),
        Buffer.from('<svg>not-a-png</svg>'),
      ]),
    ],
  ])('拒绝%s', async (_name, buffer) => {
    await expect(validateProductImage(buffer, maxSize)).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });

  it.each([
    ['JPEG', validImages.jpg.subarray(0, -1)],
    ['PNG', validImages.png.subarray(0, -1)],
    ['WebP', validImages.webp.subarray(0, -1)],
  ])('拒绝尾部截断的%s', async (_name, buffer) => {
    await expect(validateProductImage(buffer, maxSize)).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });

  it.each([
    ['JPEG', validImages.jpg],
    ['PNG', validImages.png],
    ['WebP', validImages.webp],
  ])('拒绝完整%s后追加的尾随载荷', async (_name, buffer) => {
    await expect(
      validateProductImage(
        Buffer.concat([buffer, Buffer.from('<svg>payload</svg>')]),
        maxSize,
      ),
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });

  it.each(Array.from({ length: 8 }, (_, index) => index))(
    '拒绝扫描熵数据之外出现的 JPEG RST%d 标记',
    async (restartIndex) => {
      const invalid = Buffer.concat([
        validImages.jpg.subarray(0, 2),
        Buffer.from([0xff, 0xd0 + restartIndex]),
        validImages.jpg.subarray(2),
      ]);

      await expect(
        validateProductImage(invalid, maxSize),
      ).rejects.toMatchObject({
        code: 'VALIDATION_FAILED',
      });
    },
  );

  it('接受基线、多扫描渐进式及带 APP/COM 段的合法 JPEG', async () => {
    const rgb = Buffer.from([255, 0, 0]);
    const progressive = await sharp(rgb, {
      raw: { width: 1, height: 1, channels: 3 },
    })
      .jpeg({ progressive: true })
      .toBuffer();
    const appAndComment = Buffer.concat([
      validImages.jpg.subarray(0, 2),
      Buffer.from([
        0xff, 0xe1, 0x00, 0x04, 0x50, 0x51, 0xff, 0xfe, 0x00, 0x04, 0x4f, 0x4b,
      ]),
      validImages.jpg.subarray(2),
    ]);

    await expect(
      validateProductImage(progressive, maxSize),
    ).resolves.toMatchObject({ extension: 'jpg' });
    await expect(
      validateProductImage(appAndComment, maxSize),
    ).resolves.toMatchObject({ extension: 'jpg' });
  });

  it('接受非零 DRI、RST0 到 RST7 后模 8 回到 RST0 的合法 JPEG', async () => {
    const restartMarkers = Array.from({ length: 8 }, (_, index) =>
      jpegMarkerOffsets(restartJpeg, 0xd0 + index),
    ).flat();

    expect(jpegMarkerOffsets(restartJpeg, 0xdd)).toHaveLength(1);
    expect(restartMarkers).toHaveLength(9);
    expect(hasValidContainer(restartJpeg, 'jpg')).toBe(true);
    await expect(
      validateProductImage(restartJpeg, maxSize),
    ).resolves.toMatchObject({ extension: 'jpg' });
  });

  it('接受每个 scan 都从 RST0 重启序列的渐进多扫描 JPEG', async () => {
    expect(
      jpegMarkerOffsets(progressiveRestartJpeg, 0xda).length,
    ).toBeGreaterThan(1);
    expect(hasValidContainer(progressiveRestartJpeg, 'jpg')).toBe(true);
    await expect(
      validateProductImage(progressiveRestartJpeg, maxSize),
    ).resolves.toMatchObject({ extension: 'jpg' });
  });

  it.each([
    ['没有 DRI', 'remove-dri'],
    ['DRI 为零', 'zero-dri'],
    ['首个标记不是 RST0', 'wrong-start'],
    ['RST 序列重复', 'repeat'],
    ['RST 序列跳号', 'skip'],
  ])('容器状态机拒绝%s但仍含 RST 的 JPEG', (_name, mutation) => {
    const driOffset = jpegMarkerOffsets(restartJpeg, 0xdd)[0];
    const restartOffsets = Array.from({ length: 8 }, (_, index) =>
      jpegMarkerOffsets(restartJpeg, 0xd0 + index),
    )
      .flat()
      .sort((left, right) => left - right);
    let invalid = Buffer.from(restartJpeg);
    if (mutation === 'remove-dri') {
      invalid = Buffer.concat([
        restartJpeg.subarray(0, driOffset),
        restartJpeg.subarray(driOffset + 6),
      ]);
    } else if (mutation === 'zero-dri') {
      invalid.writeUInt16BE(0, driOffset + 4);
    } else if (mutation === 'wrong-start') {
      invalid[restartOffsets[0] + 1] = 0xd1;
    } else if (mutation === 'repeat') {
      invalid[restartOffsets[1] + 1] = 0xd0;
    } else {
      invalid[restartOffsets[1] + 1] = 0xd2;
    }

    expect(hasValidContainer(invalid, 'jpg')).toBe(false);
  });

  it.each([
    ['重复 VP8', { type: 'VP8 ', duplicate: 'VP8 ' }],
    ['重复 VP8L', { type: 'VP8L', duplicate: 'VP8L' }],
    ['同时包含 VP8 与 VP8L', { type: 'VP8L', duplicate: 'VP8 ' }],
  ])('拒绝 WebP %s 主图数据块', async (_name, mutation) => {
    const source =
      mutation.type === 'VP8L'
        ? validImages.webp
        : await sharp(Buffer.from([255, 0, 0]), {
            raw: { width: 1, height: 1, channels: 3 },
          })
            .webp()
            .toBuffer();
    const chunks = parseWebpChunks(source);
    const main = chunks.find(({ type }) => type === mutation.type);
    expect(main).toBeDefined();
    const invalid = buildWebp([
      ...chunks,
      { type: mutation.duplicate, data: Buffer.from(main!.data) },
    ]);

    await expect(validateProductImage(invalid, maxSize)).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });

  it('拒绝 WebP 奇数字节数据块的非零填充', async () => {
    const invalid = buildWebp(parseWebpChunks(validImages.webp), 0x7f);

    await expect(validateProductImage(invalid, maxSize)).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });

  it.each(['ANIM', 'ANMF'])('拒绝动画 WebP 数据块 %s', async (type) => {
    const [main] = parseWebpChunks(validImages.webp);
    const vp8x = Buffer.alloc(10);
    vp8x[0] = 0x02;
    const invalid = buildWebp([
      { type: 'VP8X', data: vp8x },
      { type, data: Buffer.alloc(type === 'ANIM' ? 6 : 16) },
      main,
    ]);

    await expect(validateProductImage(invalid, maxSize)).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });

  it('拒绝多个 VP8X 以及 VP8X 标志与数据块不一致', async () => {
    const [main] = parseWebpChunks(validImages.webp);
    const vp8x = Buffer.alloc(10);
    const duplicateVp8x = buildWebp([
      { type: 'VP8X', data: vp8x },
      { type: 'VP8X', data: vp8x },
      main,
    ]);
    const missingExif = Buffer.from(vp8x);
    missingExif[0] = 0x08;
    const inconsistentFlags = buildWebp([
      { type: 'VP8X', data: missingExif },
      main,
    ]);

    await expect(
      validateProductImage(duplicateVp8x, maxSize),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(
      validateProductImage(inconsistentFlags, maxSize),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('接受合法 WebP 有损、无损、扩展透明与元数据变体', async () => {
    const rgb = Buffer.from([255, 0, 0]);
    const rgba = Buffer.from([255, 0, 0, 64]);
    const variants = [
      await sharp(rgb, { raw: { width: 1, height: 1, channels: 3 } })
        .webp({ lossless: false })
        .toBuffer(),
      await sharp(rgb, { raw: { width: 1, height: 1, channels: 3 } })
        .webp({ lossless: true })
        .toBuffer(),
      await sharp(rgba, { raw: { width: 1, height: 1, channels: 4 } })
        .webp({ lossless: false })
        .toBuffer(),
      await sharp(rgb, { raw: { width: 1, height: 1, channels: 3 } })
        .withMetadata({ exif: { IFD0: { Copyright: 'point' } } })
        .webp({ lossless: false })
        .toBuffer(),
    ];

    await Promise.all(
      variants.map((variant) =>
        expect(validateProductImage(variant, maxSize)).resolves.toMatchObject({
          extension: 'webp',
        }),
      ),
    );
  });

  it('接受实际透明但 VP8L alpha hint 为零且 VP8X alpha flag 为真的 WebP', async () => {
    const transparentLossless = await sharp(Buffer.from([1, 2, 3, 0]), {
      raw: { width: 1, height: 1, channels: 4 },
    })
      .webp({ lossless: true })
      .toBuffer();
    const main = parseWebpChunks(transparentLossless)[0];
    const hintCleared = Buffer.from(main.data);
    hintCleared[4] &= 0xef;
    const vp8x = Buffer.alloc(10);
    vp8x[0] = 0x10;
    const extended = buildWebp([
      { type: 'VP8X', data: vp8x },
      { type: 'VP8L', data: hintCleared },
    ]);

    await expect(
      validateProductImage(extended, maxSize),
    ).resolves.toMatchObject({ extension: 'webp' });
  });

  it('接受实际不透明、VP8L alpha hint 为一但 VP8X alpha flag 为假的 WebP', async () => {
    const opaqueLossless = await sharp(Buffer.from([1, 2, 3, 255]), {
      raw: { width: 1, height: 1, channels: 4 },
    })
      .webp({ lossless: true })
      .toBuffer();
    const main = parseWebpChunks(opaqueLossless)[0];
    const hintSet = Buffer.from(main.data);
    hintSet[4] |= 0x10;
    const extended = buildWebp([
      { type: 'VP8X', data: Buffer.alloc(10) },
      { type: 'VP8L', data: hintSet },
    ]);

    await expect(
      validateProductImage(extended, maxSize),
    ).resolves.toMatchObject({ extension: 'webp' });
  });

  it('接受 EXIF 与 XMP 元数据按任意相对顺序出现的 WebP', async () => {
    const withMetadata = await sharp(Buffer.from([1, 2, 3]), {
      raw: { width: 1, height: 1, channels: 3 },
    })
      .withMetadata({ exif: { IFD0: { Copyright: 'point' } } })
      .withXmp('<x:xmpmeta xmlns:x="adobe:ns:meta/"/>')
      .webp()
      .toBuffer();
    const chunks = parseWebpChunks(withMetadata);
    const exif = chunks.find(({ type }) => type === 'EXIF');
    const xmp = chunks.find(({ type }) => type === 'XMP ');
    expect(exif).toBeDefined();
    expect(xmp).toBeDefined();
    const reordered = buildWebp([
      ...chunks.filter(({ type }) => !['EXIF', 'XMP '].includes(type)),
      xmp!,
      exif!,
    ]);

    await expect(
      validateProductImage(reordered, maxSize),
    ).resolves.toMatchObject({ extension: 'webp' });
  });

  it.each([
    ['包含非 ASCII 字母', 'v1Ag'],
    ['第三字母 reserved bit 为小写', 'vpag'],
  ])('拒绝 PNG chunk type %s', (_name, type) => {
    const invalid = insertPngChunkBefore(validImages.png, 'IDAT', {
      type,
      data: Buffer.alloc(0),
    });

    expect(hasValidContainer(invalid, 'png')).toBe(false);
  });

  it('不手写拒绝可安全净化的 PNG ancillary 顺序、基数或内容畸形', async () => {
    const palette = await sharp(Buffer.from([0, 0, 0, 255, 255, 255]), {
      raw: { width: 2, height: 1, channels: 3 },
    })
      .png({ palette: true, colours: 2 })
      .toBuffer();
    const chunks = parsePngChunks(palette);
    const plteIndex = chunks.findIndex((chunk) => chunk.type === 'PLTE');
    chunks.splice(plteIndex + 1, 0, {
      type: 'sBIT',
      data: Buffer.alloc(0),
    });
    chunks.splice(
      plteIndex + 2,
      0,
      { type: 'gAMA', data: Buffer.from([0, 0, 0xb1, 0x8f]) },
      { type: 'gAMA', data: Buffer.from([0, 0, 0xb1, 0x8f]) },
      { type: 'iCCP', data: Buffer.from('malformed') },
    );
    chunks.splice(-1, 0, { type: 'pHYs', data: Buffer.alloc(0) });
    const uploaded = buildPng(chunks);

    expect(hasValidContainer(uploaded, 'png')).toBe(true);
    const normalized = await normalizeProductImage(uploaded);
    expect(
      parsePngChunks(normalized.buffer).some(({ type }) =>
        ['sBIT', 'gAMA', 'iCCP'].includes(type),
      ),
    ).toBe(false);
  });

  it('仍拒绝会改变像素 alpha 语义的 tRNS 色型与顺序违规', async () => {
    const trnsOnAlphaImage = insertPngChunkBefore(validImages.png, 'IDAT', {
      type: 'tRNS',
      data: Buffer.from([0, 0]),
    });
    const palette = await sharp(Buffer.from([0, 0, 0, 255, 255, 255]), {
      raw: { width: 2, height: 1, channels: 3 },
    })
      .png({ palette: true, colours: 2 })
      .toBuffer();
    const paletteChunks = parsePngChunks(palette);
    const plteIndex = paletteChunks.findIndex(({ type }) => type === 'PLTE');
    const trnsBeforePlte = [...paletteChunks];
    trnsBeforePlte.splice(plteIndex, 0, {
      type: 'tRNS',
      data: Buffer.from([0]),
    });

    expect(hasValidContainer(trnsOnAlphaImage, 'png')).toBe(false);
    expect(hasValidContainer(buildPng(trnsBeforePlte), 'png')).toBe(false);
  });

  it('拒绝不连续 IDAT 和未知 critical chunk', () => {
    const chunks = parsePngChunks(validImages.png);
    const idatIndex = chunks.findIndex(({ type }) => type === 'IDAT');
    const idat = chunks[idatIndex];
    chunks.splice(
      idatIndex,
      1,
      { type: 'IDAT', data: idat.data.subarray(0, 1) },
      { type: 'vpAg', data: Buffer.alloc(0) },
      { type: 'IDAT', data: idat.data.subarray(1) },
    );
    const unknownCritical = insertPngChunkBefore(validImages.png, 'IDAT', {
      type: 'ABCD',
      data: Buffer.alloc(0),
    });

    expect(hasValidContainer(buildPng(chunks), 'png')).toBe(false);
    expect(hasValidContainer(unknownCritical, 'png')).toBe(false);
  });

  it('允许命名合法的未知 ancillary chunk 和合法 Adam7 PNG', async () => {
    const withUnknownAncillary = insertPngChunkBefore(validImages.png, 'IDAT', {
      type: 'vpAg',
      data: Buffer.from('private metadata'),
    });

    expect(hasValidContainer(withUnknownAncillary, 'png')).toBe(true);
    await expect(
      validateProductImage(withUnknownAncillary, maxSize),
    ).resolves.toMatchObject({ extension: 'png' });
  });

  it('拒绝 PNG CRC 损坏、未知关键块以及重复关键块', async () => {
    const crcCorrupted = corruptPngCrc(validImages.png, 'IDAT');
    const duplicateIhdr = Buffer.concat([
      validImages.png.subarray(0, 33),
      validImages.png.subarray(8, 33),
      validImages.png.subarray(33),
    ]);
    const unknownCritical = Buffer.from(validImages.png);
    unknownCritical.write('ABCD', 37, 4, 'ascii');

    await expect(
      validateProductImage(crcCorrupted, maxSize),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(
      validateProductImage(duplicateIhdr, maxSize),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(
      validateProductImage(unknownCritical, maxSize),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('接受合法 Adam7 交错及低位深调色板 PNG', async () => {
    const interlaced = await sharp(Buffer.from([255, 0, 0]), {
      raw: { width: 1, height: 1, channels: 3 },
    })
      .png({ progressive: true })
      .toBuffer();
    const palette = await sharp(Buffer.from([0, 255, 0, 255, 0, 0]), {
      raw: { width: 2, height: 1, channels: 3 },
    })
      .png({
        palette: true,
        colours: 2,
        // libvips 支持 1 位调色板输出，但当前 sharp 类型声明未暴露该字段。
        bitdepth: 1,
      } as Parameters<sharp.Sharp['png']>[0])
      .toBuffer();

    await expect(
      validateProductImage(interlaced, maxSize),
    ).resolves.toMatchObject({ extension: 'png' });
    await expect(validateProductImage(palette, maxSize)).resolves.toMatchObject(
      { extension: 'png' },
    );
  });

  it('拒绝小于 5 MiB 但像素数过高的压缩图片', async () => {
    expect(highPixelPng.length).toBeLessThan(maxSize);
    await expect(
      validateProductImage(highPixelPng, maxSize),
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });

  it('在读取类型前拒绝超过 5 MiB 的文件', async () => {
    await expect(
      validateProductImage(Buffer.alloc(maxSize + 1, 0x89), maxSize),
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });

  it.each([
    ['jpg', 'image/jpeg'],
    ['png', 'image/png'],
    ['webp', 'image/webp'],
  ] as const)(
    '按真实签名接受 %s，而不依赖客户端 MIME',
    async (extension, mime) => {
      await expect(
        validateProductImage(validImages[extension], maxSize),
      ).resolves.toEqual({
        extension,
        mime,
      });
    },
  );

  it('接受可安全解码但 ancillary 内容畸形的 PNG，并从规范化输出删除全部注入块与 payload', async () => {
    const injection = Buffer.from('round3-visible-injection-payload');
    const chunks = parsePngChunks(validImages.png);
    const idatIndex = chunks.findIndex(({ type }) => type === 'IDAT');
    chunks.splice(
      idatIndex,
      0,
      { type: 'sPLT', data: Buffer.alloc(0) },
      { type: 'sPLT', data: Buffer.alloc(0) },
      { type: 'tIME', data: Buffer.alloc(0) },
      {
        type: 'iCCP',
        data: Buffer.concat([Buffer.from('profile\0\0'), injection]),
      },
      { type: 'tEXt', data: injection },
      { type: 'zTXt', data: Buffer.alloc(0) },
      { type: 'iTXt', data: Buffer.alloc(0) },
    );
    const uploaded = buildPng(chunks);

    const normalized = await normalizeProductImage(uploaded);
    const outputChunks = parsePngChunks(normalized.buffer);
    const detected = await fileTypeFromBuffer(normalized.buffer);
    const metadata = await sharp(normalized.buffer).metadata();

    expect(normalized).toMatchObject({
      keyExtension: 'png',
      mime: 'image/png',
    });
    expect(detected).toMatchObject({ ext: 'png', mime: 'image/png' });
    expect(outputChunks.map(({ type }) => type)).toEqual(
      expect.arrayContaining(['IHDR', 'IDAT', 'IEND']),
    );
    expect(
      outputChunks.some(({ type }) =>
        ['sPLT', 'tIME', 'iCCP', 'tEXt', 'zTXt', 'iTXt'].includes(type),
      ),
    ).toBe(false);
    expect(normalized.buffer.includes(injection)).toBe(false);
    expect(metadata).toMatchObject({
      format: 'png',
      width: 1,
      height: 1,
    });
    expect(metadata.pages ?? 1).toBe(1);
    expect(metadata.exif).toBeUndefined();
    expect(metadata.icc).toBeUndefined();
    expect(metadata.xmp).toBeUndefined();
  });

  it('同格式净化时保留 PNG 尺寸与 alpha 视觉语义', async () => {
    const original = await sharp(Buffer.from([255, 0, 0, 255, 0, 255, 0, 0]), {
      raw: { width: 2, height: 1, channels: 4 },
    })
      .png()
      .toBuffer();
    const withPayload = insertPngChunkBefore(original, 'IDAT', {
      type: 'tEXt',
      data: Buffer.from('comment\0round3-alpha-payload'),
    });

    const normalized = await normalizeProductImage(withPayload);
    const decoded = await sharp(normalized.buffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    expect(decoded.info).toMatchObject({
      width: 2,
      height: 1,
      channels: 4,
    });
    expect([...decoded.data]).toEqual([255, 0, 0, 255, 0, 255, 0, 0]);
  });

  it('JPEG 自动应用 EXIF 方向并剥离 EXIF、ICC、XMP 等用户元数据', async () => {
    const uploaded = await sharp(Buffer.from([255, 0, 0, 0, 255, 0]), {
      raw: { width: 2, height: 1, channels: 3 },
    })
      .withMetadata({
        orientation: 6,
        exif: { IFD0: { Copyright: 'round3-secret-metadata' } },
      })
      .withXmp(
        '<x:xmpmeta xmlns:x="adobe:ns:meta/">round3-xmp-payload</x:xmpmeta>',
      )
      .jpeg()
      .toBuffer();

    const normalized = await normalizeProductImage(uploaded);
    const detected = await fileTypeFromBuffer(normalized.buffer);
    const metadata = await sharp(normalized.buffer).metadata();

    expect(normalized).toMatchObject({
      keyExtension: 'jpg',
      mime: 'image/jpeg',
    });
    expect(detected).toMatchObject({ ext: 'jpg', mime: 'image/jpeg' });
    expect(metadata).toMatchObject({
      format: 'jpeg',
      width: 1,
      height: 2,
    });
    expect(metadata.pages ?? 1).toBe(1);
    expect(metadata.orientation).toBeUndefined();
    expect(metadata.exif).toBeUndefined();
    expect(metadata.icc).toBeUndefined();
    expect(metadata.xmp).toBeUndefined();
    expect(normalized.buffer.includes(Buffer.from('round3'))).toBe(false);
  });

  it('规范化输出超过独立磁盘上限时返回稳定 VALIDATION_FAILED', async () => {
    await expect(
      normalizeProductImage(validImages.png, 1),
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });

  it.each([
    ['jpg', 'image/jpeg', 'jpeg'],
    ['png', 'image/png', 'png'],
    ['webp', 'image/webp', 'webp'],
  ] as const)(
    '将 %s 完整解码后重新编码为相同可信格式',
    async (keyExtension, mime, decoderFormat) => {
      const normalized = await normalizeProductImage(validImages[keyExtension]);
      const detected = await fileTypeFromBuffer(normalized.buffer);
      const metadata = await sharp(normalized.buffer).metadata();

      expect(normalized).toMatchObject({ keyExtension, mime });
      expect(detected).toMatchObject({ ext: keyExtension, mime });
      expect(metadata.format).toBe(decoderFormat);
      expect(metadata.pages ?? 1).toBe(1);
      expect(normalized.buffer).not.toEqual(validImages[keyExtension]);
    },
  );
});
