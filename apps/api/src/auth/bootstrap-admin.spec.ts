import type { PrismaClient } from '@prisma/client';
import { compare } from 'bcryptjs';
import { bootstrapAdminIfNeeded } from './bootstrap-admin';

type CreateUserArgs = {
  data: { passwordHash: string; role: string; username: string };
};

describe('bootstrapAdminIfNeeded', () => {
  const createUser = jest.fn((args: CreateUserArgs) =>
    Promise.resolve({ id: 'admin-1', ...args.data }),
  );
  const count = jest.fn(() => Promise.resolve(0));
  const prisma = {
    user: {
      count,
      create: createUser,
    },
  } as unknown as Pick<PrismaClient, 'user'>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('未配置环境变量时跳过', async () => {
    await expect(bootstrapAdminIfNeeded(prisma, {})).resolves.toBe('skipped');
    expect(count).not.toHaveBeenCalled();
    expect(createUser).not.toHaveBeenCalled();
  });

  it('已存在管理员时跳过且不改密码', async () => {
    count.mockResolvedValue(1);

    await expect(
      bootstrapAdminIfNeeded(prisma, {
        BOOTSTRAP_ADMIN_USERNAME: 'admin',
        BOOTSTRAP_ADMIN_PASSWORD: 'Admin123!x',
      }),
    ).resolves.toBe('skipped');

    expect(createUser).not.toHaveBeenCalled();
  });

  it('无管理员且配置合法时创建 ADMIN', async () => {
    count.mockResolvedValue(0);

    await expect(
      bootstrapAdminIfNeeded(prisma, {
        BOOTSTRAP_ADMIN_USERNAME: 'Admin',
        BOOTSTRAP_ADMIN_PASSWORD: 'Admin123!x',
      }),
    ).resolves.toBe('created');

    expect(createUser).toHaveBeenCalledTimes(1);
    const created = createUser.mock.calls[0][0].data;
    expect(created.username).toBe('admin');
    expect(created.role).toBe('ADMIN');
    await expect(compare('Admin123!x', created.passwordHash)).resolves.toBe(
      true,
    );
  });

  it('密码不符合规则时抛错', async () => {
    count.mockResolvedValue(0);

    await expect(
      bootstrapAdminIfNeeded(prisma, {
        BOOTSTRAP_ADMIN_USERNAME: 'admin',
        BOOTSTRAP_ADMIN_PASSWORD: 'short',
      }),
    ).rejects.toThrow('BOOTSTRAP_ADMIN 用户名或密码不符合要求');

    expect(createUser).not.toHaveBeenCalled();
  });
});
