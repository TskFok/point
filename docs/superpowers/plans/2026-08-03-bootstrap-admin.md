# Bootstrap 默认管理员 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** API 在无任何 ADMIN 时，根据环境变量创建默认管理员；Docker 生产通过 `.env` / compose 注入。

**Architecture:** 抽取用户名/密码校验共享模块；新增 `bootstrapAdminIfNeeded`；在 `main.ts` listen 前调用；compose 与 `.env.docker.example` 增加变量。

**Tech Stack:** NestJS、Prisma、bcryptjs、node:test、Docker Compose。

## Global Constraints

- 仅当两个 bootstrap 变量都设置且无 ADMIN 时创建。
- 默认模板：`admin` / `Admin123!x`。
- 本地 `.env.example` 不启用。
- 非法配置阻止启动；已有 ADMIN 绝不改密。
- 新增功能必须带单元测试且通过。

---

### Task 1: 共享校验 + bootstrap 逻辑与单元测试

**Files:**
- Create: `apps/api/src/auth/user-credentials.ts`
- Create: `apps/api/src/auth/bootstrap-admin.ts`
- Create: `apps/api/src/auth/bootstrap-admin.spec.ts`
- Modify: `apps/api/src/auth/auth.service.ts`（改用共享校验）
- Modify: `apps/api/src/main.ts`
- Test: `apps/api/src/auth/bootstrap-admin.spec.ts`

- [ ] **Step 1: 抽取 `user-credentials.ts`**

```ts
export const USERNAME_PATTERN = /^[a-z0-9_]{3,32}$/;
export const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d).{10,}$/;

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function assertValidCredentials(username: string, password: string): string {
  const normalized = normalizeUsername(username);
  if (!USERNAME_PATTERN.test(normalized) || !PASSWORD_PATTERN.test(password)) {
    throw new Error('BOOTSTRAP_ADMIN 用户名或密码不符合要求');
  }
  return normalized;
}
```

`auth.service.ts` 改为从此模块导入 pattern / normalizeUsername。

- [ ] **Step 2: 实现 `bootstrap-admin.ts`**

```ts
import { hash } from 'bcryptjs';
import type { PrismaClient } from '@prisma/client';
import { assertValidCredentials } from './user-credentials';

type BootstrapAdminEnv = {
  BOOTSTRAP_ADMIN_USERNAME?: string;
  BOOTSTRAP_ADMIN_PASSWORD?: string;
};

export async function bootstrapAdminIfNeeded(
  prisma: Pick<PrismaClient, 'user'>,
  env: BootstrapAdminEnv = process.env,
): Promise<'skipped' | 'created'> {
  const usernameRaw = env.BOOTSTRAP_ADMIN_USERNAME?.trim();
  const password = env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!usernameRaw || !password) {
    return 'skipped';
  }

  const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
  if (adminCount > 0) {
    return 'skipped';
  }

  const username = assertValidCredentials(usernameRaw, password);
  await prisma.user.create({
    data: {
      username,
      passwordHash: await hash(password, 12),
      role: 'ADMIN',
    },
  });
  return 'created';
}
```

- [ ] **Step 3: 单元测试（mock prisma.user）覆盖 skipped/created/invalid**

- [ ] **Step 4: `main.ts` 在 listen 前调用**

```ts
const app = await NestFactory.create(AppModule);
// ... existing configure ...
const prisma = app.get(PrismaService);
await bootstrapAdminIfNeeded(prisma);
await app.listen(process.env.PORT ?? 3000);
```

- [ ] **Step 5: 运行 API 单测**

Run: `pnpm --filter @point-quest/api test -- bootstrap-admin`

Expected: PASS

- [ ] **Step 6: Commit**（若用户要求提交）

---

### Task 2: Docker 配置与契约测试 / 文档

**Files:**
- Modify: `.env.docker.example`
- Modify: `docker-compose.yml`
- Modify: `scripts/docker-production.test.mjs`
- Modify: `docs/deployment/docker.md`

- [ ] **Step 1: env 与 compose 增加变量**

`.env.docker.example`:

```bash
BOOTSTRAP_ADMIN_USERNAME=admin
BOOTSTRAP_ADMIN_PASSWORD=Admin123!x
```

`docker-compose.yml` api.environment 增加：

```yaml
BOOTSTRAP_ADMIN_USERNAME: ${BOOTSTRAP_ADMIN_USERNAME:?BOOTSTRAP_ADMIN_USERNAME is required}
BOOTSTRAP_ADMIN_PASSWORD: ${BOOTSTRAP_ADMIN_PASSWORD:?BOOTSTRAP_ADMIN_PASSWORD is required}
```

- [ ] **Step 2: 契约测试断言 env 含默认值且 compose 展开含这两个键**

- [ ] **Step 3: 文档补充首次登录与改密提醒**

- [ ] **Step 4: 验证**

```bash
node --test scripts/docker-production.test.mjs
pnpm --filter @point-quest/api test -- bootstrap-admin
```

Expected: 全部 PASS

---

## Spec Coverage

| 要求 | Task |
|------|------|
| 无 ADMIN 时创建 | Task 1 |
| 未配置跳过 | Task 1 |
| 已有 ADMIN 跳过 | Task 1 |
| Docker env/compose | Task 2 |
| 文档改密提醒 | Task 2 |
| 单元测试 | Task 1 |
