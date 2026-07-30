import sharp from 'sharp';
import { validateProductImage } from './image-validator';

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
let highPixelPng: Buffer;

type WebpChunk = {
  data: Buffer;
  type: string;
};

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
});
