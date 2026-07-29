import {
  BadRequestException,
  type INestApplication,
  ValidationPipe,
  type ValidationError,
} from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { ApiExceptionFilter } from './api-exception.filter';

type RequestWithId = Request & { requestId?: string };

export function configureApiApp(
  app: INestApplication,
  webOrigin: string,
): void {
  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: (
      requestOrigin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => {
      callback(
        null,
        requestOrigin === undefined || requestOrigin === webOrigin,
      );
    },
    credentials: true,
  });
  app.use(cookieParser());
  app.use((request: RequestWithId, response: Response, next: NextFunction) => {
    request.requestId =
      typeof request.headers['x-request-id'] === 'string'
        ? request.headers['x-request-id']
        : randomUUID();
    response.setHeader('x-request-id', request.requestId);
    next();
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      exceptionFactory: (errors: ValidationError[]) =>
        new BadRequestException({
          code: 'VALIDATION_FAILED',
          message: '请求参数验证失败',
          details: {
            errors: errors.map((error) => ({
              field: error.property,
              constraints: Object.values(error.constraints ?? {}),
            })),
          },
        }),
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());
}
