import { getRounds } from 'bcryptjs';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { hashRefreshToken } from './token-hash';

type StoredUser = {
  id: string;
  username: string;
  passwordHash: string;
  role: 'ADMIN' | 'STUDENT';
  pointsBalance: number;
  isActive: boolean;
};

class InMemoryAuthPrisma {
  readonly users = new Map<string, StoredUser>();
  readonly refreshTokens: Array<{
    id: string;
    userId: string;
    tokenHash: string;
    clientType: 'WEB' | 'ANDROID';
    expiresAt: Date;
    revokedAt: Date | null;
    replacedByTokenId: string | null;
  }> = [];

  user = {
    create: ({
      data,
    }: {
      data: {
        username: string;
        passwordHash: string;
        role: 'STUDENT';
      };
    }) => {
      if (this.users.has(data.username)) {
        throw Object.assign(new Error('Unique constraint failed'), {
          code: 'P2002',
        });
      }
      const user: StoredUser = {
        id: `user-${this.users.size + 1}`,
        username: data.username,
        passwordHash: data.passwordHash,
        role: data.role,
        pointsBalance: 0,
        isActive: true,
      };
      this.users.set(user.username, user);
      return user;
    },
    findUnique: ({ where }: { where: { username?: string; id?: string } }) => {
      if (where.username) {
        return this.users.get(where.username) ?? null;
      }
      return (
        [...this.users.values()].find((user) => user.id === where.id) ?? null
      );
    },
  };

  refreshToken = {
    create: ({
      data,
    }: {
      data: {
        userId: string;
        tokenHash: string;
        clientType: 'WEB' | 'ANDROID';
        expiresAt: Date;
      };
    }) => {
      const token = {
        id: `refresh-${this.refreshTokens.length + 1}`,
        ...data,
        revokedAt: null,
        replacedByTokenId: null,
      };
      this.refreshTokens.push(token);
      return token;
    },
  };
}

describe('AuthService', () => {
  let prisma: InMemoryAuthPrisma;
  let service: AuthService;

  beforeEach(() => {
    process.env.AUTH_JWT_SECRET =
      'point-quest-auth-unit-secret-at-least-32-bytes';
    prisma = new InMemoryAuthPrisma();
    service = new AuthService(prisma as unknown as PrismaService);
  });

  it('规范化用户名、固定学员角色并使用 bcrypt cost 12', async () => {
    const result = await service.register({
      username: '  Learner_Unit  ',
      password: 'StrongPass123!',
    });

    expect(result.user).toEqual({
      id: 'user-1',
      username: 'learner_unit',
      role: 'STUDENT',
      pointsBalance: 0,
    });
    const stored = prisma.users.get('learner_unit');
    expect(stored).toBeDefined();
    expect(stored!.passwordHash).not.toBe('StrongPass123!');
    expect(getRounds(stored!.passwordHash)).toBe(12);
  });

  it('Android 登录只返回原始令牌并仅持久化 Refresh Token 摘要', async () => {
    await service.register({
      username: 'token_unit',
      password: 'StrongPass123!',
    });

    const result = await service.login(
      { username: 'TOKEN_UNIT', password: 'StrongPass123!' },
      'ANDROID',
    );

    expect(result.accessToken.split('.')).toHaveLength(3);
    expect(result.refreshToken).toBeTruthy();
    expect(prisma.refreshTokens).toHaveLength(1);
    expect(prisma.refreshTokens[0].tokenHash).toBe(
      hashRefreshToken(result.refreshToken),
    );
    expect(prisma.refreshTokens[0].tokenHash).not.toBe(result.refreshToken);
  });

  it('拒绝停用账户登录', async () => {
    await service.register({
      username: 'inactive_unit',
      password: 'StrongPass123!',
    });
    prisma.users.get('inactive_unit')!.isActive = false;

    await expect(
      service.login(
        { username: 'inactive_unit', password: 'StrongPass123!' },
        'WEB',
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
