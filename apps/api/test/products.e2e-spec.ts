import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from 'bcryptjs';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32 } from 'node:zlib';
import sharp from 'sharp';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApiApp } from '../src/common/http/configure-api-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { configureLocalStaticFiles } from '../src/storage/local-static-files';
import { disposeE2eResources } from './e2e-resource-lifecycle';

const webOrigin = 'https://point-quest.example.test';
const jwtSecret = 'point-quest-product-e2e-secret-at-least-32-bytes';
const defaultTestDatabaseUrl =
  'postgresql://point:point@localhost:5433/point_test';
const adminId = 'task7-admin';
const studentId = 'task7-student';
const activeProductId = 'task7-product-active';
const inactiveProductId = 'task7-product-inactive';
const secondActiveProductId = 'task7-product-active-second';
const trustedImageKey = 'products/123e4567-e89b-42d3-a456-426614174000.png';
const maxImageSize = 5 * 1024 * 1024;
const validPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const nodeModule = process.getBuiltinModule('node:module');
const requireFromHere = nodeModule.createRequire(__filename);
const { fileTypeFromBuffer } = requireFromHere(
  'file-type',
) as typeof import('file-type');

function addPngChunk(buffer: Buffer, type: string, payload: Buffer): Buffer {
  const idatOffset = buffer.indexOf(Buffer.from('IDAT')) - 4;
  const typeBytes = Buffer.from(type);
  const header = Buffer.alloc(8);
  header.writeUInt32BE(payload.length);
  typeBytes.copy(header, 4);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, payload])) >>> 0);
  return Buffer.concat([
    buffer.subarray(0, idatOffset),
    header,
    payload,
    checksum,
    buffer.subarray(idatOffset),
  ]);
}
const managedEnvironmentKeys = [
  'DATABASE_URL',
  'AUTH_JWT_SECRET',
  'WEB_ORIGIN',
  'PRODUCT_UPLOAD_ROOT',
  'NODE_ENV',
] as const;

type ManagedEnvironment = Record<
  (typeof managedEnvironmentKeys)[number],
  string | undefined
>;

type ApiErrorBody = {
  code: string;
  message: string;
  requestId: string;
  details: Record<string, unknown>;
};

type ProductBody = {
  id: string;
  name: string;
  description: string;
  imageKey: string;
  stock: number;
  pointsCost: number;
  isActive: boolean;
};

function expectErrorContract(response: request.Response, code: string): void {
  const body = response.body as unknown as ApiErrorBody;
  expect(Object.keys(body).sort()).toEqual(
    ['code', 'details', 'message', 'requestId'].sort(),
  );
  expect(body.code).toBe(code);
  expect(body.message).toEqual(expect.any(String));
  expect(body.details).toEqual(expect.any(Object));
  expect(body.requestId).toEqual(expect.any(String));
  expect(response.headers['x-request-id']).toBe(body.requestId);
}

function assertAuthorizedTestDatabase(databaseUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error('Task 7 E2E 数据库 URL 无效');
  }
  if (
    !['postgres:', 'postgresql:'].includes(parsed.protocol) ||
    !['localhost', '127.0.0.1'].includes(parsed.hostname) ||
    parsed.port !== '5433' ||
    parsed.pathname !== '/point_test' ||
    parsed.search !== '' ||
    parsed.hash !== ''
  ) {
    throw new Error(
      'Task 7 E2E 只允许使用 localhost:5433/point_test 测试数据库',
    );
  }
}

function validProduct(overrides: Record<string, unknown> = {}) {
  return {
    name: '  Vocabulary Badge  ',
    description: '  A learner reward.  ',
    imageKey: trustedImageKey,
    stock: 3,
    pointsCost: 20,
    isActive: true,
    ...overrides,
  };
}

describe('商品、库存与图片上传 API', () => {
  let app: INestApplication | undefined;
  let server: Parameters<typeof request>[0] | undefined;
  let prisma: PrismaService | undefined;
  let uploadRoot: string | undefined;
  let previousEnvironment: ManagedEnvironment | undefined;
  let adminBearer: string;
  let studentBearer: string;

  async function cleanupDatabase(): Promise<void> {
    if (!prisma) {
      return;
    }
    const database = prisma;
    const productIds = (
      await database.product.findMany({
        where: {
          OR: [
            { id: { startsWith: 'task7-' } },
            { name: { startsWith: 'Task 7 ' } },
            { name: 'Vocabulary Badge' },
          ],
        },
        select: { id: true },
      })
    ).map(({ id }) => id);
    await database.pointLedger.deleteMany({
      where: { order: { productId: { in: productIds } } },
    });
    await database.order.deleteMany({
      where: {
        OR: [
          { productId: { in: productIds } },
          { userId: { in: [adminId, studentId] } },
        ],
      },
    });
    await database.product.deleteMany({ where: { id: { in: productIds } } });
    await database.refreshToken.deleteMany({
      where: { userId: { in: [adminId, studentId] } },
    });
    await database.user.deleteMany({
      where: { id: { in: [adminId, studentId] } },
    });
  }

  function requireServer(): Parameters<typeof request>[0] {
    if (!server) {
      throw new Error('Task 7 E2E HTTP 服务尚未初始化');
    }
    return server;
  }

  function requirePrisma(): PrismaService {
    if (!prisma) {
      throw new Error('Task 7 E2E Prisma 尚未初始化');
    }
    return prisma;
  }

  function requireUploadRoot(): string {
    if (!uploadRoot) {
      throw new Error('Task 7 E2E 上传目录尚未初始化');
    }
    return uploadRoot;
  }

  function restoreEnvironment(): void {
    if (!previousEnvironment) {
      return;
    }
    for (const key of managedEnvironmentKeys) {
      const previousValue = previousEnvironment[key];
      if (previousValue === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previousValue;
      }
    }
    previousEnvironment = undefined;
  }

  async function disposeResources(): Promise<void> {
    await disposeE2eResources({
      cleanupDatabase,
      closeApplication: async () => {
        if (app) {
          await app.close();
          app = undefined;
          server = undefined;
          prisma = undefined;
        }
      },
      removeUploadRoot: async () => {
        if (uploadRoot) {
          const exactUploadRoot = uploadRoot;
          await rm(exactUploadRoot, { recursive: true, force: true });
          uploadRoot = undefined;
        }
      },
      restoreEnvironment,
    });
  }

  async function login(username: string): Promise<string> {
    const response = await request(requireServer())
      .post('/api/v1/auth/token')
      .send({ username, password: 'StrongPass123!' })
      .expect(201);
    return `Bearer ${
      (response.body as unknown as { accessToken: string }).accessToken
    }`;
  }

  beforeAll(async () => {
    previousEnvironment = Object.fromEntries(
      managedEnvironmentKeys.map((key) => [key, process.env[key]]),
    ) as ManagedEnvironment;
    try {
      const testDatabaseUrl =
        process.env.TEST_DATABASE_URL ?? defaultTestDatabaseUrl;
      assertAuthorizedTestDatabase(testDatabaseUrl);
      uploadRoot = await mkdtemp(join(tmpdir(), 'point-task7-e2e-'));
      process.env.DATABASE_URL = testDatabaseUrl;
      process.env.AUTH_JWT_SECRET = jwtSecret;
      process.env.WEB_ORIGIN = webOrigin;
      process.env.PRODUCT_UPLOAD_ROOT = uploadRoot;
      process.env.NODE_ENV = 'test';

      const moduleRef = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      app = moduleRef.createNestApplication();
      configureApiApp(app, webOrigin);
      await configureLocalStaticFiles(app, uploadRoot);
      await app.init();
      server = app.getHttpServer() as Parameters<typeof request>[0];
      prisma = app.get(PrismaService);
    } catch (initializationError) {
      try {
        await disposeResources();
      } catch (cleanupError) {
        throw new AggregateError(
          [initializationError, cleanupError],
          'Task 7 E2E 初始化与清理均失败',
        );
      }
      throw initializationError;
    }
  });

  beforeEach(async () => {
    await cleanupDatabase();
    const passwordHash = await hash('StrongPass123!', 4);
    await requirePrisma().user.createMany({
      data: [
        {
          id: adminId,
          username: 'task7_admin',
          passwordHash,
          role: 'ADMIN',
        },
        {
          id: studentId,
          username: 'task7_student',
          passwordHash,
          role: 'STUDENT',
        },
      ],
    });
    adminBearer = await login('task7_admin');
    studentBearer = await login('task7_student');
  });

  afterAll(async () => {
    await disposeResources();
  });

  it('学员只能看到已上架商品，且下架详情稳定返回不存在', async () => {
    await requirePrisma().product.createMany({
      data: [
        {
          id: activeProductId,
          name: 'Task 7 Active',
          description: 'Visible',
          imageKey: trustedImageKey,
          stock: 2,
          pointsCost: 10,
          isActive: true,
        },
        {
          id: inactiveProductId,
          name: 'Task 7 Inactive',
          description: 'Hidden',
          imageKey: trustedImageKey,
          stock: 2,
          pointsCost: 10,
          isActive: false,
        },
        {
          id: secondActiveProductId,
          name: 'Task 7 Active Second',
          description: 'Visible',
          imageKey: trustedImageKey,
          stock: 0,
          pointsCost: 15,
          isActive: true,
        },
      ],
    });

    const list = await request(requireServer())
      .get('/api/v1/products')
      .set('Authorization', studentBearer)
      .expect(200);
    expect(
      (list.body as unknown as { data: ProductBody[] }).data.map(
        ({ id }) => id,
      ),
    ).toEqual(expect.arrayContaining([activeProductId, secondActiveProductId]));
    expect(
      (list.body as unknown as { data: ProductBody[] }).data.map(
        ({ id }) => id,
      ),
    ).not.toContain(inactiveProductId);

    await request(requireServer())
      .get(`/api/v1/products/${activeProductId}`)
      .set('Authorization', studentBearer)
      .expect(200)
      .expect(({ body }) => {
        expect((body as unknown as ProductBody).id).toBe(activeProductId);
      });

    await request(requireServer())
      .get(`/api/v1/products/${inactiveProductId}`)
      .set('Authorization', studentBearer)
      .expect(404)
      .expect((response) => {
        expectErrorContract(response, 'PRODUCT_NOT_FOUND');
      });
  });

  it('学员不能访问管理商品和上传接口，管理员不能冒充学员浏览', async () => {
    await request(requireServer())
      .get('/api/v1/admin/products')
      .set('Authorization', studentBearer)
      .expect(403)
      .expect((response) => {
        expectErrorContract(response, 'FORBIDDEN');
      });
    await request(requireServer())
      .post('/api/v1/admin/uploads/product-images')
      .set('Authorization', studentBearer)
      .attach('file', validPng, {
        filename: 'image.png',
        contentType: 'image/png',
      })
      .expect(403)
      .expect((response) => {
        expectErrorContract(response, 'FORBIDDEN');
      });
    await request(requireServer())
      .get('/api/v1/products')
      .set('Authorization', adminBearer)
      .expect(403)
      .expect((response) => {
        expectErrorContract(response, 'FORBIDDEN');
      });
  });

  it('管理员创建、筛选分页并局部更新商品，且没有 DELETE 路由', async () => {
    const firstResponse = await request(requireServer())
      .post('/api/v1/admin/products')
      .set('Authorization', adminBearer)
      .send(validProduct())
      .expect(201);
    const first = firstResponse.body as unknown as ProductBody;
    expect(first).toMatchObject({
      name: 'Vocabulary Badge',
      description: 'A learner reward.',
      imageKey: trustedImageKey,
      stock: 3,
      pointsCost: 20,
      isActive: true,
    });

    await request(requireServer())
      .post('/api/v1/admin/products')
      .set('Authorization', adminBearer)
      .send(
        validProduct({
          name: 'Task 7 Hidden Badge',
          isActive: false,
          pointsCost: 0,
        }),
      )
      .expect(201);

    const list = await request(requireServer())
      .get('/api/v1/admin/products')
      .query({ search: 'badge', isActive: true, page: 1, pageSize: 1 })
      .set('Authorization', adminBearer)
      .expect(200);
    expect(list.body).toMatchObject({
      meta: {
        page: 1,
        pageSize: 1,
        total: 1,
        totalPages: 1,
      },
    });
    expect((list.body as unknown as { data: ProductBody[] }).data[0].id).toBe(
      first.id,
    );

    await request(requireServer())
      .patch(`/api/v1/admin/products/${first.id}`)
      .set('Authorization', adminBearer)
      .send({
        description: '  Updated reward.  ',
        stock: 8,
        pointsCost: 30,
        isActive: false,
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body as unknown as ProductBody).toMatchObject({
          id: first.id,
          name: 'Vocabulary Badge',
          description: 'Updated reward.',
          stock: 8,
          pointsCost: 30,
          isActive: false,
        });
      });

    await request(requireServer())
      .delete(`/api/v1/admin/products/${first.id}`)
      .set('Authorization', adminBearer)
      .expect(404);
  });

  it.each([
    ['空白名称', { name: '   ' }],
    ['任意图片 URL', { imageKey: 'https://example.test/image.png' }],
    ['路径穿越图片 key', { imageKey: 'products/../secret.png' }],
    ['负库存', { stock: -1 }],
    ['上架零积分', { pointsCost: 0 }],
  ])('管理员创建时拒绝%s', async (_name, override) => {
    await request(requireServer())
      .post('/api/v1/admin/products')
      .set('Authorization', adminBearer)
      .send(validProduct(override))
      .expect(400)
      .expect((response) => {
        expectErrorContract(response, 'VALIDATION_FAILED');
      });
  });

  it.each([
    ['name', { name: null }],
    ['description', { description: null }],
    ['imageKey', { imageKey: null }],
    ['stock', { stock: null }],
    ['pointsCost', { pointsCost: null }],
    ['isActive', { isActive: null }],
  ])('PATCH 显式 null 字段 %s 返回稳定验证错误', async (_field, patch) => {
    const product = await requirePrisma().product.create({
      data: {
        id: activeProductId,
        name: 'Task 7 Active',
        description: 'Visible',
        imageKey: trustedImageKey,
        stock: 1,
        pointsCost: 10,
        isActive: true,
      },
    });
    await request(requireServer())
      .patch(`/api/v1/admin/products/${product.id}`)
      .set('Authorization', adminBearer)
      .send(patch)
      .expect(400)
      .expect((response) => {
        expectErrorContract(response, 'VALIDATION_FAILED');
      });
  });

  it('拒绝超过上限的商品列表页码', async () => {
    await request(requireServer())
      .get('/api/v1/admin/products')
      .query({ page: 1_000_001, pageSize: 20 })
      .set('Authorization', adminBearer)
      .expect(400)
      .expect((response) => {
        expectErrorContract(response, 'VALIDATION_FAILED');
      });
  });

  it('并发上架与积分归零被商品行锁串行化，不形成非法状态', async () => {
    await requirePrisma().product.create({
      data: {
        id: activeProductId,
        name: 'Task 7 Concurrent',
        description: 'Concurrent validation',
        imageKey: trustedImageKey,
        stock: 1,
        pointsCost: 10,
        isActive: false,
      },
    });

    const [activate, zeroCost] = await Promise.all([
      request(requireServer())
        .patch(`/api/v1/admin/products/${activeProductId}`)
        .set('Authorization', adminBearer)
        .send({ isActive: true }),
      request(requireServer())
        .patch(`/api/v1/admin/products/${activeProductId}`)
        .set('Authorization', adminBearer)
        .send({ pointsCost: 0 }),
    ]);

    expect([activate.status, zeroCost.status].sort()).toEqual([200, 400]);
    const rejected = activate.status === 400 ? activate : zeroCost;
    expectErrorContract(rejected, 'VALIDATION_FAILED');
    const stored = await requirePrisma().product.findUniqueOrThrow({
      where: { id: activeProductId },
    });
    expect(stored.isActive && stored.pointsCost === 0).toBe(false);
  });

  it('按真实签名上传图片，以可信扩展名存储且不使用原文件名', async () => {
    const response = await request(requireServer())
      .post('/api/v1/admin/uploads/product-images')
      .set('Authorization', adminBearer)
      .attach('file', validPng, {
        filename: '../../pretend.svg',
        contentType: 'text/plain',
      })
      .expect(201);
    const stored = response.body as unknown as { key: string; url: string };
    expect(stored.key).toMatch(/^products\/[0-9a-f-]{36}\.png$/);
    expect(stored.url).toBe(`/uploads/${stored.key}`);
    const persisted = await readFile(join(requireUploadRoot(), stored.key));
    expect(persisted).not.toEqual(validPng);
    await expect(fileTypeFromBuffer(persisted)).resolves.toMatchObject({
      ext: 'png',
      mime: 'image/png',
    });
    await request(requireServer())
      .get(stored.url)
      .expect('Content-Type', /image\/png/)
      .expect('X-Content-Type-Options', 'nosniff')
      .expect(200)
      .expect(({ body }) => {
        expect(body as Buffer).toEqual(persisted);
      });

    await writeFile(join(requireUploadRoot(), 'products', '.secret'), 'secret');
    await writeFile(join(requireUploadRoot(), 'outside.txt'), 'outside');
    await request(requireServer()).get('/uploads/products').expect(404);
    await request(requireServer()).get('/uploads/products/.secret').expect(404);
    await request(requireServer()).get('/uploads/../outside.txt').expect(404);
    await request(requireServer())
      .get('/uploads/%2e%2e/outside.txt')
      .expect(404);
  });

  it('真实上传链路只落盘净化后的单帧图片且不保留 PNG 注入块和用户元数据', async () => {
    const injection = Buffer.from('round3-e2e-visible-payload');
    const uploaded = [
      ['sPLT', Buffer.alloc(0)],
      ['sPLT', Buffer.alloc(0)],
      ['tIME', Buffer.alloc(0)],
      ['iCCP', Buffer.concat([Buffer.from('profile\0\0'), injection])],
      ['tEXt', injection],
      ['zTXt', Buffer.alloc(0)],
      ['iTXt', Buffer.alloc(0)],
    ].reduce(
      (buffer, [type, data]) =>
        addPngChunk(buffer, type as string, data as Buffer),
      validPng,
    );

    const response = await request(requireServer())
      .post('/api/v1/admin/uploads/product-images')
      .set('Authorization', adminBearer)
      .attach('file', uploaded, {
        filename: 'metadata.png',
        contentType: 'image/png',
      })
      .expect(201);
    const stored = response.body as unknown as { key: string; url: string };
    const persisted = await readFile(join(requireUploadRoot(), stored.key));
    const metadata = await sharp(persisted).metadata();

    expect(stored.key).toMatch(/^products\/[0-9a-f-]{36}\.png$/);
    expect(persisted).not.toEqual(uploaded);
    expect(persisted.includes(injection)).toBe(false);
    await expect(fileTypeFromBuffer(persisted)).resolves.toMatchObject({
      ext: 'png',
      mime: 'image/png',
    });
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

  it.each([
    ['缺失文件', undefined],
    ['SVG', Buffer.from('<svg></svg>')],
    ['文本', Buffer.from('not-an-image')],
    ['超过 5 MiB', Buffer.alloc(maxImageSize + 1, 0x89)],
  ])('拒绝%s并保持上传目录无新增文件', async (_name, buffer) => {
    const before = await readdir(requireUploadRoot(), { recursive: true });
    const upload = request(requireServer())
      .post('/api/v1/admin/uploads/product-images')
      .set('Authorization', adminBearer);
    if (buffer) {
      upload.attach('file', buffer, {
        filename: 'image.png',
        contentType: 'image/png',
      });
    }
    await upload.expect(400).expect((response) => {
      expectErrorContract(response, 'VALIDATION_FAILED');
    });
    await expect(
      readdir(requireUploadRoot(), { recursive: true }),
    ).resolves.toEqual(before);
  });
});
