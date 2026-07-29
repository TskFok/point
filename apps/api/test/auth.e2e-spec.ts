import {
  Controller,
  Get,
  INestApplication,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from 'bcryptjs';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthModule } from '../src/auth/auth.module';
import { Roles } from '../src/auth/decorators/roles.decorator';
import { AccessTokenGuard } from '../src/auth/guards/access-token.guard';
import { RolesGuard } from '../src/auth/guards/roles.guard';
import { PrismaService } from '../src/prisma/prisma.service';
import { hashRefreshToken } from '../src/auth/token-hash';

@Controller('auth/admin-probe')
@UseGuards(AccessTokenGuard, RolesGuard)
class AdminProbeController {
  @Get()
  @Roles('ADMIN')
  probe() {
    return { ok: true };
  }
}

const testUsernames = [
  'learner_01',
  'bearer_student',
  'bearer_admin',
  'web_student',
  'web_refresh_student',
  'refresh_student',
];

describe('认证 API', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  let prisma: PrismaService;

  beforeAll(async () => {
    process.env.DATABASE_URL =
      process.env.TEST_DATABASE_URL ??
      'postgresql://point:point@localhost:5433/point_test';
    process.env.AUTH_JWT_SECRET =
      'point-quest-auth-e2e-secret-at-least-32-bytes';
    process.env.NODE_ENV = 'test';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, AuthModule],
      controllers: [AdminProbeController],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    server = app.getHttpServer() as Parameters<typeof request>[0];
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.refreshToken.deleteMany({
      where: { user: { username: { in: testUsernames } } },
    });
    await prisma.user.deleteMany({
      where: { username: { in: testUsernames } },
    });
  });

  afterAll(async () => {
    await prisma.refreshToken.deleteMany({
      where: { user: { username: { in: testUsernames } } },
    });
    await prisma.user.deleteMany({
      where: { username: { in: testUsernames } },
    });
    await app.close();
  });

  it('公开注册只能创建学员且用户名大小写唯一', async () => {
    await request(server)
      .post('/api/v1/auth/register')
      .send({
        username: '  Learner_01  ',
        password: 'StrongPass123!',
        role: 'ADMIN',
      })
      .expect(400);

    await request(server)
      .post('/api/v1/auth/register')
      .send({ username: '  Learner_01  ', password: 'StrongPass123!' })
      .expect(201)
      .expect(({ body }) => {
        const responseBody = body as unknown as {
          user: {
            username: string;
            role: string;
            passwordHash?: string;
          };
        };
        expect(responseBody.user).toMatchObject({
          username: 'learner_01',
          role: 'STUDENT',
        });
        expect(responseBody.user.passwordHash).toBeUndefined();
      });

    await request(server)
      .post('/api/v1/auth/register')
      .send({ username: 'learner_01', password: 'StrongPass123!' })
      .expect(409)
      .expect(({ body }) => {
        const responseBody = body as unknown as { code: string };
        expect(responseBody.code).toBe('AUTH_USERNAME_TAKEN');
      });
  });

  it('学员 Bearer Token 访问管理员探针时返回 403', async () => {
    await request(server)
      .post('/api/v1/auth/register')
      .send({ username: 'bearer_student', password: 'StrongPass123!' })
      .expect(201);

    const tokenResponse = await request(server)
      .post('/api/v1/auth/token')
      .send({ username: 'bearer_student', password: 'StrongPass123!' })
      .expect(201);

    expect(tokenResponse.headers['set-cookie']).toBeUndefined();
    const tokenBody = tokenResponse.body as unknown as { accessToken: string };
    await request(server)
      .get('/api/v1/auth/admin-probe')
      .set('Authorization', `Bearer ${tokenBody.accessToken}`)
      .expect(403);
  });

  it('Bearer Token 优先于 Web Cookie 参与鉴权', async () => {
    await prisma.user.create({
      data: {
        username: 'bearer_admin',
        passwordHash: await hash('StrongPass123!', 12),
        role: 'ADMIN',
      },
    });
    await request(server)
      .post('/api/v1/auth/register')
      .send({ username: 'bearer_student', password: 'StrongPass123!' })
      .expect(201);

    const adminToken = await request(server)
      .post('/api/v1/auth/token')
      .send({ username: 'bearer_admin', password: 'StrongPass123!' })
      .expect(201);
    const studentAgent = request.agent(server);
    await studentAgent
      .post('/api/v1/auth/login')
      .send({ username: 'bearer_student', password: 'StrongPass123!' })
      .expect(201);

    const adminTokenBody = adminToken.body as unknown as {
      accessToken: string;
    };
    await studentAgent
      .get('/api/v1/auth/admin-probe')
      .set('Authorization', `Bearer ${adminTokenBody.accessToken}`)
      .expect(200, { ok: true });
  });

  it('Web Cookie 写请求缺少匹配 CSRF Header 时返回 403', async () => {
    await request(server)
      .post('/api/v1/auth/register')
      .send({ username: 'web_student', password: 'StrongPass123!' })
      .expect(201);

    const webAgent = request.agent(server);
    const loginResponse = await webAgent
      .post('/api/v1/auth/login')
      .send({ username: 'web_student', password: 'StrongPass123!' })
      .expect(201);
    const cookies = loginResponse.headers['set-cookie'] as unknown as string[];
    expect(cookies.some((cookie) => cookie.startsWith('pq_access='))).toBe(
      true,
    );
    expect(cookies.some((cookie) => cookie.startsWith('pq_refresh='))).toBe(
      true,
    );
    const csrfCookie = cookies.find((cookie) => cookie.startsWith('pq_csrf='));
    expect(csrfCookie).toBeDefined();
    expect(csrfCookie).not.toContain('HttpOnly');
    const csrfToken = csrfCookie!.split(';')[0].split('=')[1];

    await webAgent.post('/api/v1/auth/logout').expect(403);
    await webAgent
      .post('/api/v1/auth/logout')
      .set('Authorization', 'Bearer invalid-attacker-token')
      .expect(403);
    await webAgent
      .post('/api/v1/auth/logout')
      .set('X-CSRF-Token', csrfToken)
      .expect(200, { success: true });
  });

  it('Web 会话可读取当前用户并以 Cookie 轮换令牌', async () => {
    await request(server)
      .post('/api/v1/auth/register')
      .send({
        username: 'web_refresh_student',
        password: 'StrongPass123!',
      })
      .expect(201);

    const webAgent = request.agent(server);
    const loginResponse = await webAgent
      .post('/api/v1/auth/login')
      .send({
        username: 'web_refresh_student',
        password: 'StrongPass123!',
      })
      .expect(201);
    const loginCookies = loginResponse.headers[
      'set-cookie'
    ] as unknown as string[];
    const oldRefreshToken = loginCookies
      .find((cookie) => cookie.startsWith('pq_refresh='))!
      .split(';')[0]
      .split('=')[1];
    const csrfToken = loginCookies
      .find((cookie) => cookie.startsWith('pq_csrf='))!
      .split(';')[0]
      .split('=')[1];

    await webAgent
      .get('/api/v1/auth/me')
      .expect(200)
      .expect(({ body }) => {
        const responseBody = body as unknown as {
          user: { id: string; username: string; role: string };
        };
        expect(responseBody.user).toMatchObject({
          username: 'web_refresh_student',
          role: 'STUDENT',
        });
        expect(responseBody.user.id).toEqual(expect.any(String));
      });

    const refreshResponse = await webAgent
      .post('/api/v1/auth/refresh')
      .set('X-CSRF-Token', csrfToken)
      .send({})
      .expect(201);
    const refreshBody = refreshResponse.body as unknown as {
      user: { username: string };
      accessToken?: string;
      refreshToken?: string;
    };
    expect(refreshBody.user.username).toBe('web_refresh_student');
    expect(refreshBody.accessToken).toBeUndefined();
    expect(refreshBody.refreshToken).toBeUndefined();
    expect(refreshResponse.headers['set-cookie']).toBeDefined();

    const oldStoredToken = await prisma.refreshToken.findUniqueOrThrow({
      where: { tokenHash: hashRefreshToken(oldRefreshToken) },
    });
    expect(oldStoredToken.revokedAt).not.toBeNull();
  });

  it('轮换 Refresh Token 并且数据库只保存 SHA-256 摘要', async () => {
    await request(server)
      .post('/api/v1/auth/register')
      .send({ username: 'refresh_student', password: 'StrongPass123!' })
      .expect(201);

    const tokenResponse = await request(server)
      .post('/api/v1/auth/token')
      .send({ username: 'refresh_student', password: 'StrongPass123!' })
      .expect(201);
    const tokenBody = tokenResponse.body as unknown as {
      refreshToken: string;
    };
    const oldRefreshToken = tokenBody.refreshToken;
    const storedOldToken = await prisma.refreshToken.findUniqueOrThrow({
      where: { tokenHash: hashRefreshToken(oldRefreshToken) },
    });
    expect(storedOldToken.tokenHash).toHaveLength(64);
    expect(storedOldToken.tokenHash).not.toBe(oldRefreshToken);
    expect(storedOldToken.clientType).toBe('ANDROID');

    const refreshResponse = await request(server)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: oldRefreshToken })
      .expect(201);
    const refreshBody = refreshResponse.body as unknown as {
      refreshToken: string;
    };
    const newRefreshToken = refreshBody.refreshToken;
    expect(newRefreshToken).not.toBe(oldRefreshToken);

    const rotatedOldToken = await prisma.refreshToken.findUniqueOrThrow({
      where: { id: storedOldToken.id },
    });
    const storedNewToken = await prisma.refreshToken.findUniqueOrThrow({
      where: { tokenHash: hashRefreshToken(newRefreshToken) },
    });
    expect(rotatedOldToken.revokedAt).not.toBeNull();
    expect(rotatedOldToken.replacedByTokenId).toBe(storedNewToken.id);

    await request(server)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: oldRefreshToken })
      .expect(401);
  });
});
