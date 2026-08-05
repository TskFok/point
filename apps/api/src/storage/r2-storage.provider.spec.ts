import { PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { InternalServerErrorException } from '@nestjs/common';
import { R2StorageProvider } from './r2-storage.provider';
import { type NormalizedProductImage } from './image-validator';

const normalizedPng: NormalizedProductImage = {
  buffer: Buffer.from('normalized-png-bytes'),
  keyExtension: 'png',
  mime: 'image/png',
};

describe('R2StorageProvider', () => {
  it('把净化后的图片 PutObject 到 R2 并返回 CDN url', async () => {
    const send = jest.fn().mockResolvedValue({});
    const client = { send } as unknown as S3Client;
    const provider = new R2StorageProvider(
      {
        accountId: 'acct',
        accessKeyId: 'key',
        secretAccessKey: 'secret',
        bucket: 'product-images',
        publicBaseUrl: 'https://cdn.example.com/',
      },
      client,
    );

    const stored = await provider.putProductImage(normalizedPng);

    expect(stored.key).toMatch(
      /^products\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.png$/,
    );
    expect(stored.url).toBe(`https://cdn.example.com/${stored.key}`);
    expect(send).toHaveBeenCalledTimes(1);
    const command = send.mock.calls[0][0] as PutObjectCommand;
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toMatchObject({
      Bucket: 'product-images',
      Key: stored.key,
      ContentType: 'image/png',
      Body: normalizedPng.buffer,
    });
  });

  it('PutObject 失败时抛出 STORAGE_ERROR 且不泄露细节', async () => {
    const send = jest.fn().mockRejectedValue(new Error('AccessDenied secret=xyz'));
    const client = { send } as unknown as S3Client;
    const provider = new R2StorageProvider(
      {
        accountId: 'acct',
        accessKeyId: 'key',
        secretAccessKey: 'secret',
        bucket: 'product-images',
        publicBaseUrl: 'https://cdn.example.com',
      },
      client,
    );

    await expect(provider.putProductImage(normalizedPng)).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
    await expect(provider.putProductImage(normalizedPng)).rejects.toMatchObject({
      code: 'STORAGE_ERROR',
    });
  });
});
