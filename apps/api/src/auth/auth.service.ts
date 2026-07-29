import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { ClientType, User, UserRole } from '@prisma/client';
import { compare, hash } from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { sign } from 'jsonwebtoken';
import { readJwtSecret } from '../config/runtime-config';
import { PrismaService } from '../prisma/prisma.service';
import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';
import { hashRefreshToken } from './token-hash';

const ACCESS_TOKEN_SECONDS = 15 * 60;
const REFRESH_TOKEN_MILLISECONDS = 30 * 24 * 60 * 60 * 1000;
const USERNAME_PATTERN = /^[a-z0-9_]{3,32}$/;
const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d).{10,}$/;

export type PublicUser = {
  id: string;
  username: string;
  role: UserRole;
  pointsBalance: number;
};

export type TokenPair = {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;
  refreshTokenExpiresAt: string;
};

export type RotatedTokenPair = TokenPair & {
  clientType: ClientType;
};

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

function publicUser(
  user: Pick<User, 'id' | 'username' | 'role' | 'pointsBalance'>,
): PublicUser {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    pointsBalance: user.pointsBalance,
  };
}

function invalidCredentials(): UnauthorizedException {
  return new UnauthorizedException({
    code: 'AUTH_INVALID_CREDENTIALS',
    message: '用户名或密码错误',
  });
}

function invalidRefreshToken(): UnauthorizedException {
  return new UnauthorizedException({
    code: 'AUTH_INVALID_REFRESH_TOKEN',
    message: 'Refresh Token 无效或已过期',
  });
}

function isPrismaError(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === code
  );
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async register(input: RegisterDto): Promise<{ user: PublicUser }> {
    const username = normalizeUsername(input.username);
    if (
      !USERNAME_PATTERN.test(username) ||
      !PASSWORD_PATTERN.test(input.password)
    ) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: '用户名或密码不符合要求',
      });
    }

    try {
      const user = await this.prisma.user.create({
        data: {
          username,
          passwordHash: await hash(input.password, 12),
          role: 'STUDENT',
        },
      });
      return { user: publicUser(user) };
    } catch (error) {
      if (isPrismaError(error, 'P2002')) {
        throw new ConflictException({
          code: 'AUTH_USERNAME_TAKEN',
          message: '用户名已被使用',
        });
      }
      throw error;
    }
  }

  async login(input: LoginDto, clientType: ClientType): Promise<TokenPair> {
    const username = normalizeUsername(input.username);
    const user = await this.prisma.user.findUnique({ where: { username } });
    if (
      !user?.isActive ||
      !(await compare(input.password, user.passwordHash))
    ) {
      throw invalidCredentials();
    }
    return this.createTokenPair(user, clientType, this.prisma);
  }

  async refresh(rawToken: string): Promise<RotatedTokenPair> {
    const now = new Date();
    const tokenHash = hashRefreshToken(rawToken);

    return this.prisma.$transaction(async (transaction) => {
      const current = await transaction.refreshToken.findUnique({
        where: { tokenHash },
        include: { user: true },
      });
      if (
        !current ||
        current.revokedAt ||
        current.expiresAt <= now ||
        !current.user.isActive
      ) {
        throw invalidRefreshToken();
      }

      const next = await this.createTokenPair(
        current.user,
        current.clientType,
        transaction,
      );
      const nextRecord = await transaction.refreshToken.findUniqueOrThrow({
        where: { tokenHash: hashRefreshToken(next.refreshToken) },
        select: { id: true },
      });
      const revoked = await transaction.refreshToken.updateMany({
        where: {
          id: current.id,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: {
          revokedAt: now,
          replacedByTokenId: nextRecord.id,
        },
      });
      if (revoked.count !== 1) {
        throw invalidRefreshToken();
      }

      return { ...next, clientType: current.clientType };
    });
  }

  async logout(rawToken?: string): Promise<void> {
    if (!rawToken) {
      return;
    }
    await this.prisma.refreshToken.updateMany({
      where: {
        tokenHash: hashRefreshToken(rawToken),
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
  }

  private async createTokenPair(
    user: Pick<User, 'id' | 'username' | 'role' | 'pointsBalance' | 'isActive'>,
    clientType: ClientType,
    database: Pick<PrismaService, 'refreshToken'>,
  ): Promise<TokenPair> {
    const refreshToken = randomBytes(32).toString('base64url');
    const refreshTokenExpiresAt = new Date(
      Date.now() + REFRESH_TOKEN_MILLISECONDS,
    );
    await database.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashRefreshToken(refreshToken),
        clientType,
        expiresAt: refreshTokenExpiresAt,
      },
    });

    const accessToken = sign(
      {
        username: user.username,
        role: user.role,
        type: 'access',
      },
      readJwtSecret(),
      {
        algorithm: 'HS256',
        subject: user.id,
        expiresIn: ACCESS_TOKEN_SECONDS,
      },
    );
    return {
      user: publicUser(user),
      accessToken,
      refreshToken,
      accessTokenExpiresIn: ACCESS_TOKEN_SECONDS,
      refreshTokenExpiresAt: refreshTokenExpiresAt.toISOString(),
    };
  }
}
