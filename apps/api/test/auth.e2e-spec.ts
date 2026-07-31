import {
  Controller,
  Get,
  HttpCode,
  INestApplication,
  Post,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from 'bcryptjs';
import { decode, sign } from 'jsonwebtoken';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthModule } from '../src/auth/auth.module';
import { configureApiApp } from '../src/common/http/configure-api-app';
import { Public } from '../src/auth/decorators/public.decorator';
import { Roles } from '../src/auth/decorators/roles.decorator';
import { PrismaService } from '../src/prisma/prisma.service';
import { hashRefreshToken } from '../src/auth/token-hash';
import { seedAdminCredentials } from '../../../prisma/seed/users';
import { createE2eRunId } from './e2e-run-id';

@Controller('auth/admin-probe')
class AdminProbeController {
  @Get()
  @Roles('ADMIN')
  probe() {
    return { ok: true };
  }

  @Post('write')
  @HttpCode(200)
  writeProbe() {
    return { ok: true };
  }

  @Get('internal-error')
  @Public()
  internalErrorProbe(): never {
    throw new Error('sensitive database connection detail');
  }
}

const testJwtSecret = 'point-quest-auth-e2e-secret-at-least-32-bytes';
const configuredWebOrigin = 'https://point-quest.example.test';
const testRunId = createE2eRunId();
const learnerUsername = `learner_${testRunId}`;
const bearerStudentUsername = `bearer_student_${testRunId}`;
const bearerAdminUsername = `bearer_admin_${testRunId}`;
const webStudentUsername = `web_student_${testRunId}`;
const webRefreshStudentUsername = `web_refresh_${testRunId}`;
const refreshStudentUsername = `refresh_student_${testRunId}`;
const registerRaceUsername = `register_race_${testRunId}`;
const refreshRaceUsername = `refresh_race_${testRunId}`;
const expiredStudentUsername = `expired_student_${testRunId}`;
const androidLogoutUsername = `android_logout_${testRunId}`;
const testUsernames = [
  learnerUsername,
  bearerStudentUsername,
  bearerAdminUsername,
  webStudentUsername,
  webRefreshStudentUsername,
  refreshStudentUsername,
  registerRaceUsername,
  refreshRaceUsername,
  expiredStudentUsername,
  androidLogoutUsername,
];

type ApiErrorBody = {
  code: string;
  message: string;
  requestId: string;
  details: Record<string, unknown>;
};

function expectErrorContract(
  response: request.Response,
  code: string,
  requestId?: string,
): void {
  const body = response.body as unknown as ApiErrorBody;
  expect(Object.keys(body).sort()).toEqual(
    ['code', 'details', 'message', 'requestId'].sort(),
  );
  expect(body.code).toBe(code);
  expect(body.message).toEqual(expect.any(String));
  expect(body.details).toEqual(expect.any(Object));
  expect(body.requestId).toEqual(expect.any(String));
  expect(response.headers['x-request-id']).toBe(body.requestId);
  if (requestId) {
    expect(body.requestId).toBe(requestId);
  }
}

async function createWebAgent(
  server: Parameters<typeof request>[0],
): Promise<ReturnType<typeof request.agent>> {
  await request(server)
    .post('/api/v1/auth/register')
    .send({ username: webStudentUsername, password: 'StrongPass123!' })
    .expect(201);

  const webAgent = request.agent(server);
  await webAgent
    .post('/api/v1/auth/login')
    .send({ username: webStudentUsername, password: 'StrongPass123!' })
    .expect(201);
  return webAgent;
}

describe('认证 API', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  let prisma: PrismaService;

  beforeAll(async () => {
    process.env.DATABASE_URL =
      process.env.TEST_DATABASE_URL ??
      'postgresql://point:point@localhost:5433/point_test';
    process.env.AUTH_JWT_SECRET = testJwtSecret;
    process.env.WEB_ORIGIN = configuredWebOrigin;
    process.env.NODE_ENV = 'test';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, AuthModule],
      controllers: [AdminProbeController],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApiApp(app, configuredWebOrigin);
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
        username: `  ${learnerUsername.toUpperCase()}  `,
        password: 'StrongPass123!',
        role: 'ADMIN',
      })
      .expect(400);

    await request(server)
      .post('/api/v1/auth/register')
      .send({
        username: `  ${learnerUsername.toUpperCase()}  `,
        password: 'StrongPass123!',
      })
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
          username: learnerUsername,
          role: 'STUDENT',
        });
        expect(responseBody.user.passwordHash).toBeUndefined();
      });

    await request(server)
      .post('/api/v1/auth/register')
      .send({ username: learnerUsername, password: 'StrongPass123!' })
      .expect(409)
      .expect((response) => {
        expectErrorContract(response, 'AUTH_USERNAME_TAKEN');
      });
  });

  it('学员 Bearer Token 访问管理员探针时返回 403', async () => {
    await request(server)
      .post('/api/v1/auth/register')
      .send({ username: bearerStudentUsername, password: 'StrongPass123!' })
      .expect(201);

    const tokenResponse = await request(server)
      .post('/api/v1/auth/token')
      .send({ username: bearerStudentUsername, password: 'StrongPass123!' })
      .expect(201);

    expect(tokenResponse.headers['set-cookie']).toBeUndefined();
    const tokenBody = tokenResponse.body as unknown as { accessToken: string };
    await request(server)
      .get('/api/v1/auth/admin-probe')
      .set('Authorization', `Bearer ${tokenBody.accessToken}`)
      .expect(403)
      .expect((response) => {
        expectErrorContract(response, 'FORBIDDEN');
      });
  });

  it('Bearer Token 优先于 Web Cookie 参与鉴权', async () => {
    await prisma.user.create({
      data: {
        username: bearerAdminUsername,
        passwordHash: await hash('StrongPass123!', 12),
        role: 'ADMIN',
      },
    });
    await request(server)
      .post('/api/v1/auth/register')
      .send({ username: bearerStudentUsername, password: 'StrongPass123!' })
      .expect(201);

    const adminToken = await request(server)
      .post('/api/v1/auth/token')
      .send({ username: bearerAdminUsername, password: 'StrongPass123!' })
      .expect(201);
    const studentAgent = request.agent(server);
    await studentAgent
      .post('/api/v1/auth/login')
      .send({ username: bearerStudentUsername, password: 'StrongPass123!' })
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
      .send({ username: webStudentUsername, password: 'StrongPass123!' })
      .expect(201);

    const webAgent = request.agent(server);
    const loginResponse = await webAgent
      .post('/api/v1/auth/login')
      .send({ username: webStudentUsername, password: 'StrongPass123!' })
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
    const logoutResponse = await webAgent
      .post('/api/v1/auth/logout')
      .set('X-CSRF-Token', csrfToken)
      .expect(200, { success: true });
    const clearedCookies = logoutResponse.headers[
      'set-cookie'
    ] as unknown as string[];
    expect(clearedCookies).toHaveLength(3);
    expect(
      clearedCookies.every((cookie) =>
        cookie.includes('Expires=Thu, 01 Jan 1970'),
      ),
    ).toBe(true);
  });

  it('Cookie 模式 refresh 标准路由缺少 CSRF 时返回 403', async () => {
    const webAgent = await createWebAgent(server);

    await webAgent.post('/api/v1/auth/refresh').send({}).expect(403);
  });

  it('Cookie 模式 refresh 尾斜杠路由缺少 CSRF 时返回 403', async () => {
    const webAgent = await createWebAgent(server);

    await webAgent.post('/api/v1/auth/refresh/').send({}).expect(403);
  });

  it('Cookie 模式 refresh 大写路由缺少 CSRF 时返回 403', async () => {
    const webAgent = await createWebAgent(server);

    await webAgent.post('/API/V1/AUTH/REFRESH').send({}).expect(403);
  });

  it('Cookie 模式 logout 标准路由缺少 CSRF 时返回 403', async () => {
    const webAgent = await createWebAgent(server);

    await webAgent.post('/api/v1/auth/logout').send({}).expect(403);
  });

  it('Cookie 模式 logout 尾斜杠路由缺少 CSRF 时返回 403', async () => {
    const webAgent = await createWebAgent(server);

    await webAgent.post('/api/v1/auth/logout/').send({}).expect(403);
  });

  it('Cookie 模式 logout 大写路由缺少 CSRF 时返回 403', async () => {
    const webAgent = await createWebAgent(server);

    await webAgent.post('/API/V1/AUTH/LOGOUT').send({}).expect(403);
  });

  it('携带旧认证 Cookie 仍可访问公开注册、登录和 Android Token 端点', async () => {
    const staleCookies = [
      'pq_access=expired-or-invalid',
      'pq_refresh=expired-or-invalid-refresh-token-value',
    ];

    await request(server)
      .post('/api/v1/auth/register')
      .set('Cookie', staleCookies)
      .send({ username: learnerUsername, password: 'StrongPass123!' })
      .expect(201);
    await request(server)
      .post('/api/v1/auth/login')
      .set('Cookie', staleCookies)
      .send({ username: learnerUsername, password: 'StrongPass123!' })
      .expect(201);
    await request(server)
      .post('/api/v1/auth/token')
      .set('Cookie', staleCookies)
      .send({ username: learnerUsername, password: 'StrongPass123!' })
      .expect(201);
  });

  it('受保护 Cookie 写请求要求 CSRF，而 Bearer 鉴权不要求 CSRF', async () => {
    await request(server)
      .post('/api/v1/auth/register')
      .send({ username: webStudentUsername, password: 'StrongPass123!' })
      .expect(201);
    const webAgent = request.agent(server);
    await webAgent
      .post('/api/v1/auth/login')
      .send({ username: webStudentUsername, password: 'StrongPass123!' })
      .expect(201);

    await webAgent.post('/api/v1/auth/admin-probe/write').expect(403);

    const androidToken = await request(server)
      .post('/api/v1/auth/token')
      .send({ username: webStudentUsername, password: 'StrongPass123!' })
      .expect(201);
    const tokenBody = androidToken.body as unknown as { accessToken: string };
    await webAgent
      .post('/api/v1/auth/admin-probe/write')
      .set('Authorization', `Bearer ${tokenBody.accessToken}`)
      .expect(200, { ok: true });
  });

  it('Web 会话可读取当前用户并以 Cookie 轮换令牌', async () => {
    await request(server)
      .post('/api/v1/auth/register')
      .send({
        username: webRefreshStudentUsername,
        password: 'StrongPass123!',
      })
      .expect(201);

    const webAgent = request.agent(server);
    const loginResponse = await webAgent
      .post('/api/v1/auth/login')
      .send({
        username: webRefreshStudentUsername,
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
          username: webRefreshStudentUsername,
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
    expect(refreshBody.user.username).toBe(webRefreshStudentUsername);
    expect(refreshBody.accessToken).toBeUndefined();
    expect(refreshBody.refreshToken).toBeUndefined();
    expect(refreshResponse.headers['set-cookie']).toBeDefined();

    const oldStoredToken = await prisma.refreshToken.findUniqueOrThrow({
      where: { tokenHash: hashRefreshToken(oldRefreshToken) },
    });
    expect(oldStoredToken.revokedAt).not.toBeNull();
  });

  it('Android Body Refresh Token 优先于旧 Cookie 且数据库只保存 SHA-256 摘要', async () => {
    await request(server)
      .post('/api/v1/auth/register')
      .send({ username: refreshStudentUsername, password: 'StrongPass123!' })
      .expect(201);

    const tokenResponse = await request(server)
      .post('/api/v1/auth/token')
      .send({ username: refreshStudentUsername, password: 'StrongPass123!' })
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
      .set('Cookie', ['pq_refresh=stale-refresh-cookie'])
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

  it('并发注册与并发令牌轮换都只允许一个请求成功', async () => {
    const registrationResponses = await Promise.all([
      request(server).post('/api/v1/auth/register').send({
        username: registerRaceUsername.toUpperCase(),
        password: 'StrongPass123!',
      }),
      request(server).post('/api/v1/auth/register').send({
        username: registerRaceUsername,
        password: 'StrongPass123!',
      }),
    ]);
    expect(
      registrationResponses.map((response) => response.status).sort(),
    ).toEqual([201, 409]);

    await request(server)
      .post('/api/v1/auth/register')
      .send({ username: refreshRaceUsername, password: 'StrongPass123!' })
      .expect(201);
    const tokenResponse = await request(server)
      .post('/api/v1/auth/token')
      .send({ username: refreshRaceUsername, password: 'StrongPass123!' })
      .expect(201);
    const tokenBody = tokenResponse.body as unknown as {
      refreshToken: string;
    };

    const refreshResponses = await Promise.all([
      request(server)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: tokenBody.refreshToken }),
      request(server)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: tokenBody.refreshToken }),
    ]);
    expect(refreshResponses.map((response) => response.status).sort()).toEqual([
      201, 401,
    ]);
    await expect(
      prisma.refreshToken.count({
        where: {
          user: { username: refreshRaceUsername },
          revokedAt: null,
        },
      }),
    ).resolves.toBe(1);
  });

  it('种子管理员可使用既有九位密码登录', async () => {
    const adminPasswordHash = await hash(seedAdminCredentials.password, 12);
    await prisma.user.upsert({
      where: { username: seedAdminCredentials.username },
      create: {
        id: 'seed-user-admin',
        username: seedAdminCredentials.username,
        passwordHash: adminPasswordHash,
        role: 'ADMIN',
      },
      update: {
        passwordHash: adminPasswordHash,
        role: 'ADMIN',
        isActive: true,
      },
    });

    const tokenResponse = await request(server)
      .post('/api/v1/auth/token')
      .send(seedAdminCredentials)
      .expect(201);
    const body = tokenResponse.body as unknown as { refreshToken: string };
    await prisma.refreshToken.delete({
      where: { tokenHash: hashRefreshToken(body.refreshToken) },
    });
  });

  it('注册保持用户名和密码复杂度规则，登录拒绝非法类型和超长输入', async () => {
    const validationRequestId = 'req_auth_validation';
    await request(server)
      .post('/api/v1/auth/register')
      .set('X-Request-Id', validationRequestId)
      .send({ username: 'ab', password: 'onlyletters' })
      .expect(400)
      .expect((response) => {
        expectErrorContract(response, 'VALIDATION_FAILED', validationRequestId);
      });

    await request(server)
      .post('/api/v1/auth/login')
      .send({ username: 42, password: ['not', 'a', 'string'] })
      .expect(400)
      .expect((response) => {
        expectErrorContract(response, 'VALIDATION_FAILED');
      });

    await request(server)
      .post('/api/v1/auth/login')
      .send({ username: 'admin', password: 'x'.repeat(129) })
      .expect(400)
      .expect((response) => {
        expectErrorContract(response, 'VALIDATION_FAILED');
      });
  });

  it('认证错误统一返回 requestId 与空 details', async () => {
    await request(server)
      .post('/api/v1/auth/token')
      .send({ username: 'missing_user', password: 'StrongPass123!' })
      .expect(401)
      .expect((response) => {
        expectErrorContract(response, 'AUTH_INVALID_CREDENTIALS');
        expect((response.body as unknown as ApiErrorBody).details).toEqual({});
      });
  });

  it('未预期内部错误不泄露异常消息或堆栈', async () => {
    const response = await request(server)
      .get('/api/v1/auth/admin-probe/internal-error')
      .expect(500);
    expectErrorContract(response, 'INTERNAL_SERVER_ERROR');
    expect((response.body as unknown as ApiErrorBody).message).toBe(
      '服务器内部错误',
    );
    expect(JSON.stringify(response.body)).not.toContain(
      'sensitive database connection detail',
    );
    expect(JSON.stringify(response.body)).not.toContain('stack');
  });

  it('过期 Access Token 返回稳定 AUTH_TOKEN_EXPIRED', async () => {
    const user = await prisma.user.create({
      data: {
        username: expiredStudentUsername,
        passwordHash: await hash('StrongPass123!', 12),
        role: 'STUDENT',
      },
    });
    const expiredToken = sign(
      {
        username: user.username,
        role: user.role,
        type: 'access',
      },
      testJwtSecret,
      {
        algorithm: 'HS256',
        subject: user.id,
        expiresIn: -1,
      },
    );

    await request(server)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${expiredToken}`)
      .expect(401)
      .expect((response) => {
        expectErrorContract(response, 'AUTH_TOKEN_EXPIRED');
      });
  });

  it('格式错误的 Access Token 返回稳定 AUTH_INVALID_TOKEN', async () => {
    await request(server)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer malformed-token')
      .expect(401)
      .expect((response) => {
        expectErrorContract(response, 'AUTH_INVALID_TOKEN');
      });
  });

  it('Access Token 为 15 分钟且 Refresh Token 为 30 天', async () => {
    await request(server)
      .post('/api/v1/auth/register')
      .send({ username: refreshStudentUsername, password: 'StrongPass123!' })
      .expect(201);
    const tokenResponse = await request(server)
      .post('/api/v1/auth/token')
      .send({ username: refreshStudentUsername, password: 'StrongPass123!' })
      .expect(201);
    const tokenBody = tokenResponse.body as unknown as {
      accessToken: string;
      refreshToken: string;
      accessTokenExpiresIn: number;
      refreshTokenExpiresAt: string;
    };
    const accessPayload = decode(tokenBody.accessToken) as {
      iat: number;
      exp: number;
    };
    expect(accessPayload.exp - accessPayload.iat).toBe(15 * 60);
    expect(tokenBody.accessTokenExpiresIn).toBe(15 * 60);

    const storedRefreshToken = await prisma.refreshToken.findUniqueOrThrow({
      where: { tokenHash: hashRefreshToken(tokenBody.refreshToken) },
    });
    expect(
      storedRefreshToken.expiresAt.getTime() -
        storedRefreshToken.createdAt.getTime(),
    ).toBeGreaterThanOrEqual(30 * 24 * 60 * 60 * 1000 - 1_000);
    expect(new Date(tokenBody.refreshTokenExpiresAt).getTime()).toBe(
      storedRefreshToken.expiresAt.getTime(),
    );
  });

  it('生产 Web Cookie 使用 Secure、HttpOnly 与 SameSite=Lax', async () => {
    await request(server)
      .post('/api/v1/auth/register')
      .send({ username: webStudentUsername, password: 'StrongPass123!' })
      .expect(201);
    process.env.NODE_ENV = 'production';
    try {
      const loginResponse = await request(server)
        .post('/api/v1/auth/login')
        .send({ username: webStudentUsername, password: 'StrongPass123!' })
        .expect(201);
      const cookies = loginResponse.headers[
        'set-cookie'
      ] as unknown as string[];
      const accessCookie = cookies.find((cookie) =>
        cookie.startsWith('pq_access='),
      );
      const refreshCookie = cookies.find((cookie) =>
        cookie.startsWith('pq_refresh='),
      );
      const csrfCookie = cookies.find((cookie) =>
        cookie.startsWith('pq_csrf='),
      );
      expect(accessCookie).toEqual(expect.stringContaining('HttpOnly'));
      expect(refreshCookie).toEqual(expect.stringContaining('HttpOnly'));
      expect(csrfCookie).not.toContain('HttpOnly');
      for (const cookie of cookies) {
        expect(cookie).toContain('Secure');
        expect(cookie).toContain('SameSite=Lax');
      }
    } finally {
      process.env.NODE_ENV = 'test';
    }
  });

  it('CORS 仅允许配置的 Web Origin 且允许凭据', async () => {
    const allowed = await request(server)
      .options('/api/v1/auth/login')
      .set('Origin', configuredWebOrigin)
      .set('Access-Control-Request-Method', 'POST');
    expect(allowed.headers['access-control-allow-origin']).toBe(
      configuredWebOrigin,
    );
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');

    const denied = await request(server)
      .options('/api/v1/auth/login')
      .set('Origin', 'https://attacker.example.test')
      .set('Access-Control-Request-Method', 'POST');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('Android JSON logout 优先使用 Body Token 且不发送 Cookie 清理头', async () => {
    await request(server)
      .post('/api/v1/auth/register')
      .send({ username: androidLogoutUsername, password: 'StrongPass123!' })
      .expect(201);
    const tokenResponse = await request(server)
      .post('/api/v1/auth/token')
      .send({ username: androidLogoutUsername, password: 'StrongPass123!' })
      .expect(201);
    const tokenBody = tokenResponse.body as unknown as {
      refreshToken: string;
    };

    const logoutResponse = await request(server)
      .post('/api/v1/auth/logout')
      .set('Cookie', ['pq_refresh=stale-refresh-cookie'])
      .send({ refreshToken: tokenBody.refreshToken })
      .expect(200, { success: true });
    expect(logoutResponse.headers['set-cookie']).toBeUndefined();
    await expect(
      prisma.refreshToken.findUniqueOrThrow({
        where: { tokenHash: hashRefreshToken(tokenBody.refreshToken) },
      }),
    ).resolves.toMatchObject({ revokedAt: expect.any(Date) as Date });
  });
});
