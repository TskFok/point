import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../app.module';

describe('HealthController', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('返回稳定的 API 健康状态', async () => {
    const httpServer = app.getHttpServer() as Server;

    await request(httpServer)
      .get('/api/v1/health')
      .expect(200)
      .expect({ status: 'ok', service: 'point-quest-api' });
  });
});
