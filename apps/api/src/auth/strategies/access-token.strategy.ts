import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { UserRole } from '@prisma/client';
import type { Request } from 'express';
import { verify } from 'jsonwebtoken';
import { PrismaService } from '../../prisma/prisma.service';

export type RequestUser = {
  id: string;
  username: string;
  role: UserRole;
};

export type AuthenticationSource = 'bearer' | 'cookie';

type AccessTokenPayload = {
  sub: string;
  username: string;
  role: UserRole;
  type: 'access';
};

export function readJwtSecret(): string {
  const secret = process.env.AUTH_JWT_SECRET;
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('AUTH_JWT_SECRET 必须配置为至少 32 字节的密钥');
  }
  return secret;
}

function unauthorized(): UnauthorizedException {
  return new UnauthorizedException({
    code: 'AUTH_INVALID_TOKEN',
    message: '登录凭证无效或已过期',
  });
}

@Injectable()
export class AccessTokenStrategy {
  constructor(private readonly prisma: PrismaService) {}

  async authenticate(request: Request): Promise<{
    user: RequestUser;
    source: AuthenticationSource;
  }> {
    const authorization = request.headers.authorization;
    const bearerMatch = authorization?.match(/^Bearer\s+(.+)$/i);
    const bearerToken = bearerMatch?.[1];
    const cookieToken = request.cookies?.pq_access as string | undefined;
    const token = bearerToken ?? cookieToken;
    const source: AuthenticationSource = bearerToken ? 'bearer' : 'cookie';

    if (!token) {
      throw unauthorized();
    }

    let payload: AccessTokenPayload;
    try {
      payload = verify(token, readJwtSecret(), {
        algorithms: ['HS256'],
      }) as AccessTokenPayload;
    } catch {
      throw unauthorized();
    }
    if (
      payload.type !== 'access' ||
      typeof payload.sub !== 'string' ||
      typeof payload.username !== 'string' ||
      !['ADMIN', 'STUDENT'].includes(payload.role)
    ) {
      throw unauthorized();
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        username: true,
        role: true,
        isActive: true,
      },
    });
    if (!user?.isActive) {
      throw unauthorized();
    }

    return {
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
      source,
    };
  }
}
