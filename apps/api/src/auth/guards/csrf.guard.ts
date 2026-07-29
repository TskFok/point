import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { AuthenticatedRequest } from './access-token.guard';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function equalTokens(headerToken: string, cookieToken: string): boolean {
  const header = Buffer.from(headerToken, 'utf8');
  const cookie = Buffer.from(cookieToken, 'utf8');
  return header.length === cookie.length && timingSafeEqual(header, cookie);
}

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (SAFE_METHODS.has(request.method.toUpperCase())) {
      return true;
    }

    const body = request.body as unknown;
    const hasBodyRefreshToken =
      typeof body === 'object' &&
      body !== null &&
      'refreshToken' in body &&
      typeof body.refreshToken === 'string';
    const isRefreshTokenEndpoint = /\/auth\/(?:refresh|logout)$/.test(
      request.path,
    );
    const usesRefreshCookie =
      isRefreshTokenEndpoint &&
      Boolean(request.cookies?.pq_refresh) &&
      !hasBodyRefreshToken;
    const usesAuthCookie = usesRefreshCookie || request.authSource === 'cookie';
    if (!usesAuthCookie) {
      return true;
    }

    const cookieToken = request.cookies?.pq_csrf as string | undefined;
    const headerValue = request.headers['x-csrf-token'];
    const headerToken =
      typeof headerValue === 'string' ? headerValue : headerValue?.[0];
    if (
      !headerToken ||
      !cookieToken ||
      !equalTokens(headerToken, cookieToken)
    ) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'CSRF Token 缺失或不匹配',
      });
    }
    return true;
  }
}
