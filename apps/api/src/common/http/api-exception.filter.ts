import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';

type RequestWithId = Request & { requestId?: string };

type ErrorPayload = {
  code?: unknown;
  message?: unknown;
  details?: unknown;
};

type NormalizedError = {
  status: number;
  code: string;
  message: string;
  details: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeHttpException(exception: HttpException): NormalizedError {
  const response = exception.getResponse();
  const payload: ErrorPayload = isRecord(response) ? response : {};
  return {
    status: exception.getStatus(),
    code:
      typeof payload.code === 'string'
        ? payload.code
        : exception.getStatus() === 400
          ? 'VALIDATION_FAILED'
          : 'HTTP_ERROR',
    message:
      typeof payload.message === 'string'
        ? payload.message
        : typeof response === 'string'
          ? response
          : exception.message,
    details: isRecord(payload.details) ? payload.details : {},
  };
}

function normalizeException(exception: unknown): NormalizedError {
  if (exception instanceof HttpException) {
    return normalizeHttpException(exception);
  }
  if (isRecord(exception) && exception.code === 'P2002') {
    return {
      status: HttpStatus.CONFLICT,
      code: 'CONFLICT',
      message: '资源已存在',
      details: {},
    };
  }
  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    code: 'INTERNAL_SERVER_ERROR',
    message: '服务器内部错误',
    details: {},
  };
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<RequestWithId>();
    const response = http.getResponse<Response>();
    const requestId = request.requestId ?? randomUUID();
    const error = normalizeException(exception);

    response.setHeader('x-request-id', requestId);
    response.status(error.status).json({
      code: error.code,
      message: error.message,
      requestId,
      details: error.details,
    });
  }
}
