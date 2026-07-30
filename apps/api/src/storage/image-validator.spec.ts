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
