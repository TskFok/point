import { readRuntimeConfig } from './runtime-config';

describe('运行时配置', () => {
  const originalJwtSecret = process.env.AUTH_JWT_SECRET;
  const originalWebOrigin = process.env.WEB_ORIGIN;

  afterEach(() => {
    if (originalJwtSecret === undefined) {
      delete process.env.AUTH_JWT_SECRET;
    } else {
      process.env.AUTH_JWT_SECRET = originalJwtSecret;
    }
    if (originalWebOrigin === undefined) {
      delete process.env.WEB_ORIGIN;
    } else {
      process.env.WEB_ORIGIN = originalWebOrigin;
    }
  });

  it('拒绝缺失、通配符或非精确 Origin 的 Web 配置', () => {
    process.env.AUTH_JWT_SECRET = 'a-secure-test-secret-with-at-least-32-bytes';

    delete process.env.WEB_ORIGIN;
    expect(() => readRuntimeConfig()).toThrow('WEB_ORIGIN');

    process.env.WEB_ORIGIN = '*';
    expect(() => readRuntimeConfig()).toThrow('WEB_ORIGIN');

    process.env.WEB_ORIGIN = 'https://point.example.test/path';
    expect(() => readRuntimeConfig()).toThrow('WEB_ORIGIN');
  });

  it('返回精确 Web Origin 并继续校验 JWT 密钥', () => {
    process.env.WEB_ORIGIN = 'https://point.example.test';
    process.env.AUTH_JWT_SECRET = 'short';
    expect(() => readRuntimeConfig()).toThrow('AUTH_JWT_SECRET');

    process.env.AUTH_JWT_SECRET = 'a-secure-test-secret-with-at-least-32-bytes';
    expect(readRuntimeConfig()).toEqual({
      jwtSecret: 'a-secure-test-secret-with-at-least-32-bytes',
      webOrigin: 'https://point.example.test',
    });
  });
});
