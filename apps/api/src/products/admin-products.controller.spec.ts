import { crc32 } from 'node:zlib';
import sharp from 'sharp';
import { AdminProductUploadsController } from './admin-products.controller';

type CapturedNormalizedImage = {
  buffer: Buffer;
  keyExtension: 'jpg' | 'png' | 'webp';
  mime: 'image/jpeg' | 'image/png' | 'image/webp';
};

const validPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

function addPngTextChunk(buffer: Buffer, payload: Buffer): Buffer {
  const idatOffset = buffer.indexOf(Buffer.from('IDAT')) - 4;
  const type = Buffer.from('tEXt');
  const header = Buffer.alloc(8);
  header.writeUInt32BE(payload.length);
  type.copy(header, 4);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([type, payload])) >>> 0);
  return Buffer.concat([
    buffer.subarray(0, idatOffset),
    header,
    payload,
    checksum,
    buffer.subarray(idatOffset),
  ]);
}

describe('AdminProductUploadsController', () => {
  it('只把净化后的 buffer 和可信输出扩展名交给 StorageProvider', async () => {
    const injection = Buffer.from('round3-controller-injection');
    const uploaded = addPngTextChunk(validPng, injection);
    let captured: CapturedNormalizedImage | undefined;
    const storage = {
      putProductImage: (image: CapturedNormalizedImage) => {
        captured = image;
        return Promise.resolve({
          key: `products/123e4567-e89b-42d3-a456-426614174000.${image.keyExtension}`,
          url: `/uploads/products/123e4567-e89b-42d3-a456-426614174000.${image.keyExtension}`,
        });
      },
    };
    const controller = new AdminProductUploadsController(storage);

    await controller.upload({
      buffer: uploaded,
      originalname: '../../payload.svg',
      mimetype: 'text/plain',
    });

    expect(captured).toBeDefined();
    expect(captured).toMatchObject({
      keyExtension: 'png',
      mime: 'image/png',
    });
    expect(captured!.buffer).not.toEqual(uploaded);
    expect(captured!.buffer.includes(injection)).toBe(false);
    await expect(sharp(captured!.buffer).metadata()).resolves.toMatchObject({
      format: 'png',
      width: 1,
      height: 1,
    });
  });
});
