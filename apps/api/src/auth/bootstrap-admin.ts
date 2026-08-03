import { Logger } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
import { assertValidBootstrapCredentials } from './user-credentials';

const logger = new Logger('BootstrapAdmin');

export type BootstrapAdminEnv = {
  BOOTSTRAP_ADMIN_USERNAME?: string;
  BOOTSTRAP_ADMIN_PASSWORD?: string;
};

export type BootstrapAdminResult = 'skipped' | 'created';

export async function bootstrapAdminIfNeeded(
  prisma: Pick<PrismaClient, 'user'>,
  env: BootstrapAdminEnv = process.env,
): Promise<BootstrapAdminResult> {
  const usernameRaw = env.BOOTSTRAP_ADMIN_USERNAME?.trim();
  const password = env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!usernameRaw || !password) {
    return 'skipped';
  }

  const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
  if (adminCount > 0) {
    return 'skipped';
  }

  const username = assertValidBootstrapCredentials(usernameRaw, password);
  await prisma.user.create({
    data: {
      username,
      passwordHash: await hash(password, 12),
      role: 'ADMIN',
    },
  });
  logger.log(`已创建默认管理员账号: ${username}`);
  return 'created';
}
