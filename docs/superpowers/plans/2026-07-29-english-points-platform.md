# 英语答题积分商城实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建 Point Quest 多用户英语答题积分商城的响应式 Web、独立 REST API、数据库和可供未来 Android App 使用的 OpenAPI 契约。

**Architecture:** 使用 pnpm Monorepo 管理 Next.js Web、NestJS API、OpenAPI 生成客户端和共享 UI。业务规则集中在 NestJS 服务层，PostgreSQL/Prisma 负责持久化与事务，Web 和未来 Android 只消费 `/api/v1`。积分、库存和订单采用数据库事务、唯一约束、条件更新与幂等键保证一致性；序列化冲突返回 `409 CONCURRENT_MODIFICATION`，不在循环中执行 SQL 重试。

**Tech Stack:** Node.js 24 容器基线、pnpm 10.28.2、Next.js 16.2.12、React 19.2.8、NestJS 11.1.28、Prisma 7.9.1、PostgreSQL 17、OpenAPI、Jest、Vitest、React Testing Library、Playwright 1.62.0、Docker Compose。

## Global Constraints

- 只在当前 `master` 分支修改，除非用户明确要求，不创建新分支。
- 所有 Git 提交信息使用简体中文。
- 禁止在循环遍历中查询 SQL；批量写入使用 `createMany`，批量读取使用集合查询。
- 所有业务行为执行测试驱动开发：先写失败测试并确认失败原因，再写最小实现。
- API 统一使用 `/api/v1`，并生成 OpenAPI JSON 与 TypeScript 客户端。
- Web 使用安全 Cookie + CSRF；Android 使用 Access Token + 可轮换 Refresh Token。
- 学员不能读取其他用户的答题、积分和订单数据。
- 积分、库存、订单修改必须在数据库事务内保持原子性，任何余额和库存都不得为负。
- 单文件商品图片只允许 JPG、PNG、WebP，最大 5 MB，并校验真实文件类型。
- 视觉遵循“游戏化成长”：紫色主色、暖黄色奖励强调、圆角卡片、Lucide SVG 图标、4/8 px 间距、150–300 ms 动效。
- 响应式验收宽度为 375、768、1024、1440 px；普通文字对比度至少 4.5:1；交互目标至少 44 × 44 px。

---

## 文件结构

```text
.
├── apps
│   ├── api
│   │   ├── scripts/generate-openapi.ts
│   │   ├── src
│   │   │   ├── auth
│   │   │   ├── common
│   │   │   ├── orders
│   │   │   ├── points
│   │   │   ├── practice
│   │   │   ├── prisma
│   │   │   ├── products
│   │   │   ├── questions
│   │   │   ├── storage
│   │   │   └── users
│   │   └── test
│   └── web
│       ├── app
│       │   ├── (admin)/admin
│       │   ├── (auth)
│       │   └── (student)/learn
│       ├── components
│       ├── lib
│       └── tests
├── packages
│   ├── api-client
│   ├── config
│   └── ui
├── playwright
├── prisma
│   ├── migrations
│   ├── seed
│   └── schema.prisma
├── compose.yaml
├── openapi/openapi.json
├── package.json
└── pnpm-workspace.yaml
```

`apps/api` 只负责 HTTP、鉴权、事务和领域服务；`apps/web` 只负责页面、交互和 API 消费；`packages/api-client` 只保存生成契约和薄请求封装；`packages/ui` 只保存设计令牌与无业务状态组件。

---

### Task 1: 初始化 Monorepo 与可验证的应用骨架

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `.npmrc`
- Create: `.nvmrc`
- Create: `tsconfig.base.json`
- Create: `eslint.config.mjs`
- Create: `compose.yaml`
- Create: `.env.example`
- Create: `apps/api/package.json`
- Create: `apps/api/src/main.ts`
- Create: `apps/api/src/app.module.ts`
- Create: `apps/api/src/health/health.controller.ts`
- Create: `apps/api/src/health/health.controller.spec.ts`
- Create: `apps/web/package.json`
- Create: `apps/web/app/layout.tsx`
- Create: `apps/web/app/page.tsx`
- Create: `apps/web/app/globals.css`
- Create: `apps/web/tests/home.test.tsx`
- Create: `packages/config/package.json`
- Create: `packages/ui/package.json`
- Create: `packages/api-client/package.json`

**Interfaces:**
- Produces: `GET /api/v1/health -> { status: "ok", service: "point-quest-api" }`
- Produces: 根命令 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`
- Produces: 工作区包名 `@point-quest/api`、`@point-quest/web`、`@point-quest/ui`、`@point-quest/api-client`

- [ ] **Step 1: 创建工作区配置和生成式框架文件**

使用非交互命令生成 Next.js 与 NestJS 基础文件，再将它们纳入 pnpm 工作区：

```bash
pnpm dlx @nestjs/cli@11.0.24 new apps/api --package-manager pnpm --skip-git --strict
pnpm dlx create-next-app@16.2.12 apps/web --ts --eslint --app --src-dir=false --use-pnpm --no-tailwind --import-alias="@/*"
```

根 `package.json` 固定：

```json
{
  "name": "point-quest",
  "private": true,
  "packageManager": "pnpm@10.28.2",
  "engines": { "node": ">=24 <26" },
  "scripts": {
    "dev": "pnpm --parallel --filter @point-quest/api --filter @point-quest/web dev",
    "build": "pnpm -r build",
    "lint": "pnpm -r lint",
    "typecheck": "pnpm -r typecheck",
    "test": "pnpm -r test",
    "test:e2e": "playwright test"
  }
}
```

- [ ] **Step 2: 写 API 健康检查失败测试**

```ts
it('返回稳定的 API 健康状态', async () => {
  await request(app.getHttpServer())
    .get('/api/v1/health')
    .expect(200)
    .expect({ status: 'ok', service: 'point-quest-api' });
});
```

- [ ] **Step 3: 运行健康检查测试并确认失败**

Run: `pnpm --filter @point-quest/api test -- health.controller.spec.ts`

Expected: FAIL，原因是 `/api/v1/health` 尚不存在或返回体不匹配。

- [ ] **Step 4: 实现最小健康检查与 Web 首页**

`HealthController` 只返回固定状态；`main.ts` 设置全局前缀 `api/v1`、验证管道和请求 ID。Web 首页显示产品名及 API 状态占位，不实现业务页面。

```ts
@Controller('health')
export class HealthController {
  @Get()
  getHealth() {
    return { status: 'ok' as const, service: 'point-quest-api' as const };
  }
}
```

- [ ] **Step 5: 验证应用骨架**

Run: `pnpm --filter @point-quest/api test -- health.controller.spec.ts`

Expected: PASS。

Run: `pnpm lint`

Run: `pnpm typecheck`

Run: `pnpm build`

Expected: 全部退出码为 0。

- [ ] **Step 6: 提交**

```bash
git add package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc .nvmrc tsconfig.base.json eslint.config.mjs compose.yaml .env.example apps packages
git commit -m "构建：初始化前后端工作区"
```

---

### Task 2: 建立 Prisma 数据模型、约束与种子

**Files:**
- Create: `prisma/schema.prisma`
- Create: `prisma/migrations/0001_initial/migration.sql`
- Create: `prisma/seed/index.ts`
- Create: `prisma/seed/questions.ts`
- Create: `prisma/seed/products.ts`
- Create: `apps/api/src/prisma/prisma.module.ts`
- Create: `apps/api/src/prisma/prisma.service.ts`
- Create: `apps/api/test/database-schema.e2e-spec.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `compose.yaml`
- Modify: `.env.example`
- Modify: `package.json`

**Interfaces:**
- Produces: Prisma 模型 `User`、`RefreshToken`、`Question`、`QuestionOption`、`QuestionProgress`、`AnswerAttempt`、`PointConfig`、`PointLedger`、`Product`、`Order`
- Produces: `PrismaService`，供后续模块通过依赖注入使用
- Produces: `pnpm db:migrate`、`pnpm db:seed`、`pnpm db:test:reset`

- [ ] **Step 1: 写数据库不变量失败测试**

```ts
it('拒绝负积分余额并保证用户题目进度唯一', async () => {
  const user = await prisma.user.create({
    data: { username: 'schema_user', passwordHash: 'hash', role: 'STUDENT' },
  });
  const question = await prisma.question.create({
    data: {
      stem: 'Schema invariant question',
      explanation: 'Used only by the schema test.',
      basePoints: 10,
      createdBy: user.id,
    },
  });
  await expect(
    prisma.user.update({
      where: { id: user.id },
      data: { pointsBalance: -1 },
    }),
  ).rejects.toBeDefined();
  await prisma.questionProgress.create({
    data: {
      userId: user.id,
      questionId: question.id,
      firstCorrect: false,
      errorCount: 1,
    },
  });
  await expect(
    prisma.questionProgress.create({
      data: {
        userId: user.id,
        questionId: question.id,
        firstCorrect: false,
        errorCount: 1,
      },
    }),
  ).rejects.toBeDefined();
});
```

- [ ] **Step 2: 运行测试并确认因模型或表缺失而失败**

Run: `docker compose up -d db-test`

Run: `pnpm --filter @point-quest/api test:e2e -- database-schema.e2e-spec.ts`

Expected: FAIL，原因是 Prisma 模型或迁移尚不存在。

- [ ] **Step 3: 实现 Schema 与数据库约束**

在 Prisma Schema 中实现规格的枚举、关系和唯一键；在迁移 SQL 中增加：

```sql
ALTER TABLE "User" ADD CONSTRAINT "User_pointsBalance_nonnegative" CHECK ("pointsBalance" >= 0);
ALTER TABLE "QuestionProgress" ADD CONSTRAINT "QuestionProgress_errorCount_nonnegative" CHECK ("errorCount" >= 0);
ALTER TABLE "Product" ADD CONSTRAINT "Product_stock_nonnegative" CHECK ("stock" >= 0);
ALTER TABLE "Product" ADD CONSTRAINT "Product_pointsCost_nonnegative" CHECK ("pointsCost" >= 0);
ALTER TABLE "Question" ADD CONSTRAINT "Question_basePoints_positive" CHECK ("basePoints" > 0);
```

关键唯一键：

```prisma
// QuestionProgress
@@unique([userId, questionId])
// AnswerAttempt
@@unique([userId, idempotencyKey])
// QuestionOption
@@unique([questionId, position])
// Order
@@unique([userId, idempotencyKey])
// PointLedger
@@unique([orderId, type])
```

`PointLedger.answerAttemptId` 使用唯一可空字段，保证一个答题奖励只有一条流水。

- [ ] **Step 4: 实现无循环 SQL 的种子**

种子使用确定性 ID，并分别用 `createMany` 一次写入 10 道题、全部选项和 3 件商品。禁止遍历题目后逐题调用 Prisma。管理员和演示学员密码先各哈希一次，再批量写用户。

```ts
await prisma.question.createMany({ data: questionSeeds, skipDuplicates: true });
await prisma.questionOption.createMany({ data: optionSeeds, skipDuplicates: true });
await prisma.product.createMany({ data: productSeeds, skipDuplicates: true });
```

- [ ] **Step 5: 执行迁移并验证测试**

Run: `pnpm db:test:reset`

Expected: 测试库迁移成功。

Run: `pnpm --filter @point-quest/api test:e2e -- database-schema.e2e-spec.ts`

Expected: PASS。

- [ ] **Step 6: 验证种子与提交**

Run: `pnpm db:seed`

Expected: 创建 1 个管理员、1 个学员、10 道题、至少 20 个选项和 3 件商品；重复运行不生成重复记录。

```bash
git add prisma compose.yaml .env.example package.json pnpm-lock.yaml apps/api/src/prisma apps/api/test/database-schema.e2e-spec.ts
git commit -m "功能：建立数据库模型与演示数据"
```

---

### Task 3: 实现用户名密码认证、双客户端会话与角色权限

**Files:**
- Create: `apps/api/src/auth/auth.module.ts`
- Create: `apps/api/src/auth/auth.controller.ts`
- Create: `apps/api/src/auth/auth.service.ts`
- Create: `apps/api/src/auth/dto/register.dto.ts`
- Create: `apps/api/src/auth/dto/login.dto.ts`
- Create: `apps/api/src/auth/dto/refresh.dto.ts`
- Create: `apps/api/src/auth/guards/access-token.guard.ts`
- Create: `apps/api/src/auth/guards/csrf.guard.ts`
- Create: `apps/api/src/auth/guards/roles.guard.ts`
- Create: `apps/api/src/auth/decorators/current-user.decorator.ts`
- Create: `apps/api/src/auth/decorators/roles.decorator.ts`
- Create: `apps/api/src/auth/strategies/access-token.strategy.ts`
- Create: `apps/api/src/auth/token-hash.ts`
- Create: `apps/api/src/auth/auth.service.spec.ts`
- Create: `apps/api/test/auth.e2e-spec.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Produces: `POST /api/v1/auth/register`
- Produces: `POST /api/v1/auth/login`，设置 Web Cookie 与 CSRF Cookie
- Produces: `POST /api/v1/auth/token`，返回 Android Access/Refresh Token
- Produces: `POST /api/v1/auth/refresh`、`POST /api/v1/auth/logout`、`GET /api/v1/auth/me`
- Produces: `RequestUser = { id: string; username: string; role: "ADMIN" | "STUDENT" }`
- Produces: `@Roles('ADMIN')` 和 `@CurrentUser()`

- [ ] **Step 1: 写认证失败测试**

```ts
it('公开注册只能创建学员且用户名大小写唯一', async () => {
  await request(server)
    .post('/api/v1/auth/register')
    .send({ username: 'Learner_01', password: 'StrongPass123!' })
    .expect(201)
    .expect(({ body }) => expect(body.user.role).toBe('STUDENT'));

  await request(server)
    .post('/api/v1/auth/register')
    .send({ username: 'learner_01', password: 'StrongPass123!' })
    .expect(409);
});
```

另写测试证明学员 Bearer Token 访问管理员探针时返回 403，Web 写请求缺少 CSRF Header 时返回 403。

- [ ] **Step 2: 运行认证测试并确认失败**

Run: `pnpm --filter @point-quest/api test:e2e -- auth.e2e-spec.ts`

Expected: FAIL，原因是认证路由尚不存在。

- [ ] **Step 3: 实现注册、登录和令牌轮换**

- 用户名执行 `trim().toLowerCase()`，只允许 3–32 位字母、数字和下划线。
- 密码最少 10 位，必须同时包含字母和数字。
- 使用 `bcryptjs`，成本参数 12。
- Access Token 15 分钟，Refresh Token 30 天。
- 数据库只保存 Refresh Token 的 SHA-256 摘要。
- Refresh Token 轮换时撤销旧记录并创建新记录。
- Web 登录设置 `pq_access`、`pq_refresh` HttpOnly Cookie 和可读 `pq_csrf` Cookie。
- Android `/token` 只在 JSON 中返回令牌，不设置 Cookie。

- [ ] **Step 4: 实现鉴权、角色和 CSRF Guard**

鉴权优先读取 Bearer Token，其次读取 `pq_access` Cookie。CSRF Guard 仅对 Cookie 鉴权的非 GET/HEAD/OPTIONS 请求校验 `X-CSRF-Token` 与 `pq_csrf` 等值。

- [ ] **Step 5: 运行单元与集成测试**

Run: `pnpm --filter @point-quest/api test -- auth.service.spec.ts`

Run: `pnpm --filter @point-quest/api test:e2e -- auth.e2e-spec.ts`

Expected: 全部 PASS，且数据库中只存令牌摘要。

- [ ] **Step 6: 提交**

```bash
git add apps/api/src/auth apps/api/test/auth.e2e-spec.ts apps/api/src/app.module.ts apps/api/package.json pnpm-lock.yaml
git commit -m "功能：实现用户认证与角色权限"
```

---

### Task 4: 实现管理员题库与积分倍率配置

**Files:**
- Create: `apps/api/src/questions/questions.module.ts`
- Create: `apps/api/src/questions/admin-questions.controller.ts`
- Create: `apps/api/src/questions/questions.service.ts`
- Create: `apps/api/src/questions/dto/create-question.dto.ts`
- Create: `apps/api/src/questions/dto/update-question.dto.ts`
- Create: `apps/api/src/questions/dto/list-questions.dto.ts`
- Create: `apps/api/src/questions/questions.service.spec.ts`
- Create: `apps/api/src/points/points.module.ts`
- Create: `apps/api/src/points/admin-points.controller.ts`
- Create: `apps/api/src/points/points.service.ts`
- Create: `apps/api/src/points/dto/update-point-config.dto.ts`
- Create: `apps/api/test/admin-questions.e2e-spec.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Produces: 管理员题库 CRUD 与启停接口
- Produces: `PointsService.getCurrentMultiplier(tx?): Promise<number>`
- Produces: `PUT /api/v1/admin/points/config`，倍率只接受整数 1–10
- Produces: `QuestionWriteDto`，含 2–6 个选项且恰好一个 `isCorrect=true`

- [ ] **Step 1: 写题目校验与权限失败测试**

```ts
it('拒绝没有唯一正确选项的题目', async () => {
  await request(server)
    .post('/api/v1/admin/questions')
    .set('Authorization', adminBearer)
    .send({
      stem: 'Choose the correct form.',
      explanation: 'Only one form agrees with the subject.',
      basePoints: 10,
      options: [
        { label: 'A', content: 'is', position: 0, isCorrect: true },
        { label: 'B', content: 'are', position: 1, isCorrect: true },
      ],
    })
    .expect(400);
});
```

同时测试学员访问返回 403、倍率 0 或 11 返回 400。

- [ ] **Step 2: 运行测试并确认失败**

Run: `pnpm --filter @point-quest/api test:e2e -- admin-questions.e2e-spec.ts`

Expected: FAIL，原因是模块和路由尚不存在。

- [ ] **Step 3: 实现题库服务**

- 创建题目使用嵌套写入或一次 `createMany` 写全部选项。
- 更新选项在一个事务内执行 `deleteMany` 和 `createMany`，不循环查询。
- 列表使用单次分页查询与单次 `count` 查询。
- 有答题记录的题目只允许 `isActive=false`，不提供删除接口。
- 学员响应 DTO 不复用管理端 DTO，避免泄露 `isCorrect`。

- [ ] **Step 4: 实现追加式倍率配置**

`PointConfig` 更新只创建新行；查询按 `createdAt desc, id desc` 取第一条。无配置时返回默认倍率 1。

- [ ] **Step 5: 验证测试**

Run: `pnpm --filter @point-quest/api test -- questions.service.spec.ts`

Run: `pnpm --filter @point-quest/api test:e2e -- admin-questions.e2e-spec.ts`

Expected: 全部 PASS。

- [ ] **Step 6: 提交**

```bash
git add apps/api/src/questions apps/api/src/points apps/api/test/admin-questions.e2e-spec.ts apps/api/src/app.module.ts
git commit -m "功能：实现题库与积分倍率管理"
```

---

### Task 5: 实现随机首次答题与积分奖励事务

**Files:**
- Create: `apps/api/src/practice/practice.module.ts`
- Create: `apps/api/src/practice/practice.controller.ts`
- Create: `apps/api/src/practice/practice.service.ts`
- Create: `apps/api/src/practice/dto/answer-question.dto.ts`
- Create: `apps/api/src/practice/dto/random-question-query.dto.ts`
- Create: `apps/api/src/practice/practice-response.mapper.ts`
- Create: `apps/api/src/practice/practice.service.spec.ts`
- Create: `apps/api/src/points/points.controller.ts`
- Create: `apps/api/test/practice-first-answer.e2e-spec.ts`
- Create: `apps/api/test/practice-concurrency.e2e-spec.ts`
- Modify: `apps/api/src/points/points.service.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Produces: `GET /api/v1/practice/random?excludeIds=id1,id2`
- Produces: `POST /api/v1/practice/questions/:questionId/answer`，请求头必须含 `Idempotency-Key`
- Produces: `GET /api/v1/practice/summary`
- Produces: `GET /api/v1/points/balance` 与 `GET /api/v1/points/ledger`
- Produces: `AnswerResultDto = { correct; selectedOptionId; correctOptionId; explanation; errorCount; pointsAwarded; balance }`

- [ ] **Step 1: 写首次答题奖励失败测试**

```ts
it('首次答对按当前倍率奖励且不重复奖励', async () => {
  await setMultiplier(2);
  const question = await createQuestion({ basePoints: 10 });
  const first = await answer(question.id, question.correctOptionId, 'answer-key-1');
  expect(first).toMatchObject({ correct: true, pointsAwarded: 20, balance: 20 });

  const duplicate = await answer(question.id, question.correctOptionId, 'answer-key-1');
  expect(duplicate).toEqual(first);
  expect(await countRewardLedgers(question.id)).toBe(1);
});
```

另写测试证明随机题目没有 `isCorrect`、首次答错奖励为 0、不同幂等键重复首次答题返回 409。

- [ ] **Step 2: 运行测试并确认失败**

Run: `pnpm --filter @point-quest/api test:e2e -- practice-first-answer.e2e-spec.ts`

Expected: FAIL，原因是练习接口尚不存在。

- [ ] **Step 3: 实现随机未答题查询**

使用一条集合 SQL 选出未作答且未在 `excludeIds` 中的启用题目 ID，再用一次关系查询加载选项：

```sql
SELECT q.id
FROM "Question" q
WHERE q."isActive" = true
  AND NOT EXISTS (
    SELECT 1 FROM "QuestionProgress" p
    WHERE p."questionId" = q.id AND p."userId" = $1
  )
  AND NOT (q.id = ANY($2::text[]))
ORDER BY random()
LIMIT 1;
```

没有题目时返回 `404 NO_UNANSWERED_QUESTIONS`。

- [ ] **Step 4: 实现首次答题事务**

使用 `Prisma.TransactionIsolationLevel.Serializable`：

1. 校验幂等键是否已有 `AnswerAttempt`。
2. 读取题目、选项与当前倍率。
3. 创建唯一 `QuestionProgress` 和 `AnswerAttempt`。
4. 正确时更新用户余额并创建 `PointLedger`。
5. 返回含正确答案和解析的结果。

捕获唯一冲突并映射为幂等结果或 `QUESTION_ALREADY_ANSWERED`；捕获 Prisma 序列化冲突并返回 `CONCURRENT_MODIFICATION`，不执行服务端 SQL 重试循环。

- [ ] **Step 5: 写并运行并发测试**

```ts
const results = await Promise.allSettled([
  answer(question.id, correctOptionId, 'concurrent-a'),
  answer(question.id, correctOptionId, 'concurrent-b'),
]);
expect(results.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
expect(await getBalance(user.id)).toBe(10);
expect(await countRewardLedgers(question.id)).toBe(1);
```

Run: `pnpm --filter @point-quest/api test:e2e -- practice-concurrency.e2e-spec.ts`

Expected: PASS。

- [ ] **Step 6: 运行全部练习测试并提交**

Run: `pnpm --filter @point-quest/api test -- practice.service.spec.ts`

Run: `pnpm --filter @point-quest/api test:e2e -- practice-first-answer.e2e-spec.ts`

Expected: 全部 PASS。

```bash
git add apps/api/src/practice apps/api/src/points apps/api/test/practice-first-answer.e2e-spec.ts apps/api/test/practice-concurrency.e2e-spec.ts apps/api/src/app.module.ts
git commit -m "功能：实现随机答题与积分奖励"
```

---

### Task 6: 实现错题库、错误次数与掌握状态

**Files:**
- Create: `apps/api/src/practice/dto/list-wrong-questions.dto.ts`
- Create: `apps/api/test/wrong-questions.e2e-spec.ts`
- Modify: `apps/api/src/practice/practice.controller.ts`
- Modify: `apps/api/src/practice/practice.service.ts`
- Modify: `apps/api/src/practice/practice.service.spec.ts`

**Interfaces:**
- Produces: `GET /api/v1/practice/wrong-questions?page=1&pageSize=20`
- Produces: `POST /api/v1/practice/wrong-questions/:questionId/answer`，请求头必须含 `Idempotency-Key`
- Produces: 错题项 `{ question; errorCount; firstAnsweredAt; masteredAt }`

- [ ] **Step 1: 写错题重练失败测试**

```ts
it('重练答错累计次数，答对后掌握且不奖励积分', async () => {
  await firstAnswerWrong(questionId, wrongOptionId);
  const secondWrong = await retryWrong(questionId, wrongOptionId, 'retry-1');
  expect(secondWrong).toMatchObject({ correct: false, errorCount: 2, pointsAwarded: 0 });

  const mastered = await retryWrong(questionId, correctOptionId, 'retry-2');
  expect(mastered).toMatchObject({ correct: true, errorCount: 2, pointsAwarded: 0 });
  expect(await listWrongQuestions()).toHaveLength(0);
  expect(await getBalance(userId)).toBe(0);
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `pnpm --filter @point-quest/api test:e2e -- wrong-questions.e2e-spec.ts`

Expected: FAIL，原因是错题接口尚不存在。

- [ ] **Step 3: 实现错题列表和重练事务**

- 列表单次查询 `firstCorrect=false AND masteredAt IS NULL`，包含题目选项但不包含 `isCorrect`。
- 重练校验进度存在且未掌握。
- 答错使用原子 `increment: 1`。
- 答对写入 `masteredAt`。
- 两种结果都写 `WRONG_RETRY` AnswerAttempt，`pointsAwarded=0`。
- 已掌握后再次提交返回 `409 QUESTION_ALREADY_MASTERED`。

- [ ] **Step 4: 验证测试并提交**

Run: `pnpm --filter @point-quest/api test -- practice.service.spec.ts`

Run: `pnpm --filter @point-quest/api test:e2e -- wrong-questions.e2e-spec.ts`

Expected: 全部 PASS。

```bash
git add apps/api/src/practice apps/api/test/wrong-questions.e2e-spec.ts
git commit -m "功能：实现错题重练与错误统计"
```

---

### Task 7: 实现商品、库存与图片存储抽象

**Files:**
- Create: `apps/api/src/storage/storage.module.ts`
- Create: `apps/api/src/storage/storage.provider.ts`
- Create: `apps/api/src/storage/local-storage.provider.ts`
- Create: `apps/api/src/storage/image-validator.ts`
- Create: `apps/api/src/storage/image-validator.spec.ts`
- Create: `apps/api/src/products/products.module.ts`
- Create: `apps/api/src/products/products.controller.ts`
- Create: `apps/api/src/products/admin-products.controller.ts`
- Create: `apps/api/src/products/products.service.ts`
- Create: `apps/api/src/products/dto/create-product.dto.ts`
- Create: `apps/api/src/products/dto/update-product.dto.ts`
- Create: `apps/api/src/products/dto/list-products.dto.ts`
- Create: `apps/api/test/products.e2e-spec.ts`
- Modify: `apps/api/src/main.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Produces: `StorageProvider.putProductImage(file): Promise<{ key: string; url: string }>`
- Produces: 学员商品列表和详情接口
- Produces: 管理员商品 CRUD、上下架与图片上传接口
- Produces: `POST /api/v1/admin/uploads/product-images`

- [ ] **Step 1: 写图片校验和商品权限失败测试**

```ts
it.each([
  ['text/plain', Buffer.from('not-an-image')],
  ['image/svg+xml', Buffer.from('<svg></svg>')],
])('拒绝不允许的真实文件类型 %s', async (_mime, buffer) => {
  await expect(validateProductImage(buffer, 5 * 1024 * 1024)).rejects.toMatchObject({
    code: 'VALIDATION_FAILED',
  });
});
```

另写 E2E 测试证明 5 MB 以上文件被拒绝、学员不能上传、下架商品不出现在学员列表。

- [ ] **Step 2: 运行测试并确认失败**

Run: `pnpm --filter @point-quest/api test -- image-validator.spec.ts`

Run: `pnpm --filter @point-quest/api test:e2e -- products.e2e-spec.ts`

Expected: FAIL，原因是验证器和商品路由不存在。

- [ ] **Step 3: 实现存储与图片校验**

- 使用文件签名库识别 JPEG、PNG、WebP。
- 文件名由随机 ID 和可信扩展名组成，不使用用户原文件名。
- 本地 Provider 将文件写入配置的上传目录。
- API 通过 `/uploads` 静态提供本地开发图片。
- `StorageProvider` 令后续 S3 Provider 无需修改商品服务。
- 商品换图不删除旧对象，避免破坏历史订单图片快照。

- [ ] **Step 4: 实现商品服务**

- 管理员可创建、编辑、上下架、调整库存和积分。
- 学员列表只返回已上架商品。
- 列表分页和筛选使用集合查询。
- 有订单引用的商品不提供物理删除。

- [ ] **Step 5: 验证测试并提交**

Run: `pnpm --filter @point-quest/api test -- image-validator.spec.ts`

Run: `pnpm --filter @point-quest/api test:e2e -- products.e2e-spec.ts`

Expected: 全部 PASS。

```bash
git add apps/api/src/storage apps/api/src/products apps/api/test/products.e2e-spec.ts apps/api/src/main.ts apps/api/src/app.module.ts apps/api/package.json pnpm-lock.yaml
git commit -m "功能：实现商品与图片上传管理"
```

---

### Task 8: 实现兑换订单、状态流转与资产一致性

**Files:**
- Create: `apps/api/src/orders/orders.module.ts`
- Create: `apps/api/src/orders/orders.controller.ts`
- Create: `apps/api/src/orders/admin-orders.controller.ts`
- Create: `apps/api/src/orders/orders.service.ts`
- Create: `apps/api/src/orders/order-number.ts`
- Create: `apps/api/src/orders/dto/create-order.dto.ts`
- Create: `apps/api/src/orders/dto/list-orders.dto.ts`
- Create: `apps/api/src/orders/orders.service.spec.ts`
- Create: `apps/api/test/orders.e2e-spec.ts`
- Create: `apps/api/test/orders-concurrency.e2e-spec.ts`
- Modify: `apps/api/src/points/points.service.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Produces: `POST /api/v1/orders`，请求头必须含 `Idempotency-Key`
- Produces: 学员订单列表与详情
- Produces: 管理员订单列表、详情、完成与取消接口
- Produces: 稳定错误码 `INSUFFICIENT_POINTS`、`OUT_OF_STOCK`、`PRODUCT_INACTIVE`、`ORDER_INVALID_STATUS`、`IDEMPOTENCY_CONFLICT`、`CONCURRENT_MODIFICATION`

- [ ] **Step 1: 写订单事务失败测试**

```ts
it('兑换原子扣减积分和库存并创建快照订单', async () => {
  await setBalance(userId, 100);
  const product = await createProduct({ stock: 1, pointsCost: 80, isActive: true });
  const order = await redeem(product.id, 'redeem-1');

  expect(order).toMatchObject({
    status: 'PENDING_PICKUP',
    productNameSnapshot: product.name,
    pointsCostSnapshot: 80,
  });
  expect(await getBalance(userId)).toBe(20);
  expect(await getStock(product.id)).toBe(0);
});
```

另写积分不足、库存不足、商品下架、重复幂等键不同载荷、完成后不可取消的测试。

- [ ] **Step 2: 运行订单测试并确认失败**

Run: `pnpm --filter @point-quest/api test:e2e -- orders.e2e-spec.ts`

Expected: FAIL，原因是订单模块尚不存在。

- [ ] **Step 3: 实现兑换事务**

在 Serializable 事务中：

```ts
const stockResult = await tx.product.updateMany({
  where: { id: productId, isActive: true, stock: { gt: 0 } },
  data: { stock: { decrement: 1 } },
});
const pointsResult = await tx.user.updateMany({
  where: { id: userId, pointsBalance: { gte: product.pointsCost } },
  data: { pointsBalance: { decrement: product.pointsCost } },
});
```

任一 `count !== 1` 时抛出领域错误并回滚。之后创建负数积分流水和订单快照。相同幂等键与相同载荷返回原订单；相同键不同载荷返回 `IDEMPOTENCY_CONFLICT`。

- [ ] **Step 4: 实现完成与取消事务**

- 完成：条件更新 `PENDING_PICKUP -> COMPLETED`。
- 取消：条件更新 `PENDING_PICKUP -> CANCELLED`，随后原子增加余额与库存并写 `ORDER_REFUND`。
- 学员订单查询总是注入当前用户 ID。
- 管理员查询支持状态、订单号、用户名、日期分页筛选。

- [ ] **Step 5: 写并发测试**

```ts
const results = await Promise.allSettled([
  redeem(product.id, 'stock-race-a'),
  redeem(product.id, 'stock-race-b'),
]);
expect(results.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
expect(await getStock(product.id)).toBe(0);
expect(await countOrders(product.id)).toBe(1);
```

再用两个并发取消请求验证只退款一次。测试代码可并发发请求；服务端实现不得循环查询 SQL。

- [ ] **Step 6: 验证测试并提交**

Run: `pnpm --filter @point-quest/api test -- orders.service.spec.ts`

Run: `pnpm --filter @point-quest/api test:e2e -- orders.e2e-spec.ts orders-concurrency.e2e-spec.ts`

Expected: 全部 PASS，积分与库存均非负。

```bash
git add apps/api/src/orders apps/api/src/points apps/api/test/orders.e2e-spec.ts apps/api/test/orders-concurrency.e2e-spec.ts apps/api/src/app.module.ts
git commit -m "功能：实现积分兑换与订单事务"
```

---

### Task 9: 生成 OpenAPI 契约与类型安全客户端

**Files:**
- Create: `apps/api/src/openapi/create-openapi-document.ts`
- Create: `apps/api/scripts/generate-openapi.ts`
- Create: `openapi/openapi.json`
- Create: `packages/api-client/src/schema.ts`
- Create: `packages/api-client/src/client.ts`
- Create: `packages/api-client/src/index.ts`
- Create: `packages/api-client/src/client.test.ts`
- Modify: `apps/api/src/main.ts`
- Modify: `packages/api-client/package.json`
- Modify: `package.json`

**Interfaces:**
- Produces: `pnpm api:spec`，生成 `openapi/openapi.json`
- Produces: `pnpm api:client`，生成 `packages/api-client/src/schema.ts`
- Produces: `createApiClient({ baseUrl, getAccessToken?, getCsrfToken? })`

- [ ] **Step 1: 写客户端失败测试**

```ts
it('Cookie 写请求自动携带 CSRF Header 和幂等键', async () => {
  const fetchSpy = vi.fn().mockResolvedValue(new Response('{}', { status: 201 }));
  const client = createApiClient({
    baseUrl: 'http://localhost:3001/api/v1',
    fetch: fetchSpy,
    getCsrfToken: () => 'csrf-value',
  });
  await client.createOrder({ productId: 'product-1', idempotencyKey: 'order-1' });
  expect(fetchSpy).toHaveBeenCalledWith(
    expect.stringContaining('/orders'),
    expect.objectContaining({
      credentials: 'include',
      headers: expect.objectContaining({
        'X-CSRF-Token': 'csrf-value',
        'Idempotency-Key': 'order-1',
      }),
    }),
  );
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `pnpm --filter @point-quest/api-client test`

Expected: FAIL，原因是客户端尚不存在。

- [ ] **Step 3: 生成 OpenAPI 与 Schema**

Nest Swagger 文档必须包含 Bearer 和 Cookie 安全方案、所有错误 DTO、分页 DTO 和幂等键 Header。生成命令在无监听端口的 Nest Application Context 中构建文档并写入 JSON。

```bash
pnpm api:spec
pnpm api:client
```

`schema.ts` 是生成文件，禁止手工编辑。

- [ ] **Step 4: 实现薄客户端**

基于生成路径类型实现认证、练习、商品和订单方法。Android 可直接使用 `openapi.json` 生成 Kotlin 客户端，Web 使用本 TypeScript 客户端。

- [ ] **Step 5: 验证契约与提交**

Run: `pnpm --filter @point-quest/api-client test`

Run: `pnpm api:spec`

Run: `pnpm api:client`

Run: `git diff --exit-code openapi/openapi.json packages/api-client/src/schema.ts`

Expected: PASS 且生成结果稳定。

```bash
git add apps/api/src/openapi apps/api/scripts openapi packages/api-client package.json pnpm-lock.yaml apps/api/src/main.ts
git commit -m "功能：生成开放接口契约与客户端"
```

---

### Task 10: 实现 Web 认证、路由保护与游戏化应用框架

**Files:**
- Create: `apps/web/proxy.ts`
- Create: `apps/web/lib/api/browser-client.ts`
- Create: `apps/web/lib/api/server-client.ts`
- Create: `apps/web/lib/auth/session.ts`
- Create: `apps/web/components/providers/query-provider.tsx`
- Create: `apps/web/components/layout/student-shell.tsx`
- Create: `apps/web/components/layout/admin-shell.tsx`
- Create: `apps/web/components/layout/mobile-nav.tsx`
- Create: `apps/web/components/feedback/toast-region.tsx`
- Create: `apps/web/app/(auth)/login/page.tsx`
- Create: `apps/web/app/(auth)/register/page.tsx`
- Create: `apps/web/app/(student)/learn/layout.tsx`
- Create: `apps/web/app/(admin)/admin/layout.tsx`
- Create: `apps/web/tests/auth-forms.test.tsx`
- Create: `apps/web/tests/navigation.test.tsx`
- Create: `packages/ui/src/tokens.css`
- Create: `packages/ui/src/button.tsx`
- Create: `packages/ui/src/card.tsx`
- Create: `packages/ui/src/form-field.tsx`
- Create: `packages/ui/src/index.ts`
- Modify: `apps/web/app/globals.css`
- Modify: `apps/web/app/layout.tsx`

**Interfaces:**
- Produces: `StudentShell` 与 `AdminShell`
- Produces: 登录、注册页面与基于角色的服务端重定向
- Produces: 浏览器 API 客户端自动发送 Cookie 与 CSRF
- Produces: 语义设计令牌 `--color-primary`、`--color-reward`、`--color-success`、`--color-danger`、`--surface-*`

- [ ] **Step 1: 写登录与导航失败测试**

```tsx
it('登录失败保留用户名并显示可恢复错误', async () => {
  render(<LoginPage />);
  await user.type(screen.getByLabelText('用户名'), 'learner_01');
  await user.type(screen.getByLabelText('密码'), 'wrong-password');
  await user.click(screen.getByRole('button', { name: '登录' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('用户名或密码错误');
  expect(screen.getByLabelText('用户名')).toHaveValue('learner_01');
});
```

导航测试验证桌面学员 5 个主入口、移动端底部导航最多 5 项、管理员菜单不出现在学员 Shell。

- [ ] **Step 2: 运行测试并确认失败**

Run: `pnpm --filter @point-quest/web test -- auth-forms.test.tsx navigation.test.tsx`

Expected: FAIL，原因是页面和 Shell 尚不存在。

- [ ] **Step 3: 实现 API 客户端与路由保护**

- `browser-client` 使用 `credentials: "include"`，从 `pq_csrf` Cookie 读取 Token。
- `server-client` 转发当前请求 Cookie。
- `proxy.ts` 只做有无会话 Cookie 的快速重定向；每个受保护 Layout 调用 `/auth/me` 确认角色，不能仅信任 Cookie 存在。
- 登录成功后管理员进入 `/admin`，学员进入 `/learn`。

- [ ] **Step 4: 实现视觉令牌与响应式 Shell**

- 紫色主色、暖黄色积分色、绿色成功、红色错误。
- 桌面侧边导航；学员移动端底部 5 项导航；管理员移动端抽屉。
- Lucide 图标，禁止 Emoji 作为结构图标。
- 全局 `:focus-visible`、`prefers-reduced-motion` 和最小触控区域。

- [ ] **Step 5: 验证测试和可访问性静态检查**

Run: `pnpm --filter @point-quest/web test -- auth-forms.test.tsx navigation.test.tsx`

Run: `pnpm --filter @point-quest/web lint`

Run: `pnpm --filter @point-quest/web typecheck`

Expected: 全部 PASS。

- [ ] **Step 6: 提交**

```bash
git add apps/web packages/ui packages/api-client package.json pnpm-lock.yaml
git commit -m "功能：实现网页认证与响应式框架"
```

---

### Task 11: 实现学员学习、答题、错题、商城和订单页面

**Files:**
- Create: `apps/web/app/(student)/learn/page.tsx`
- Create: `apps/web/app/(student)/learn/practice/page.tsx`
- Create: `apps/web/app/(student)/learn/wrong-questions/page.tsx`
- Create: `apps/web/app/(student)/learn/store/page.tsx`
- Create: `apps/web/app/(student)/learn/orders/page.tsx`
- Create: `apps/web/app/(student)/learn/profile/page.tsx`
- Create: `apps/web/components/practice/question-card.tsx`
- Create: `apps/web/components/practice/answer-feedback.tsx`
- Create: `apps/web/components/practice/practice-session.tsx`
- Create: `apps/web/components/store/product-card.tsx`
- Create: `apps/web/components/store/redeem-dialog.tsx`
- Create: `apps/web/components/orders/order-card.tsx`
- Create: `apps/web/components/empty-state.tsx`
- Create: `apps/web/tests/practice-session.test.tsx`
- Create: `apps/web/tests/wrong-questions.test.tsx`
- Create: `apps/web/tests/store.test.tsx`
- Create: `apps/web/tests/orders.test.tsx`

**Interfaces:**
- Consumes: Task 9 的类型安全 API 客户端
- Produces: 客户端 `PracticeQueueItem = { question; selectedOptionId?; result? }`
- Produces: 学员六个路由与所有加载、成功、错误、空状态

- [ ] **Step 1: 写练习队列失败测试**

```tsx
it('提交后锁定答案并支持上一题下一题', async () => {
  render(<PracticeSession />);
  await screen.findByText('If she ___ earlier');
  await user.click(screen.getByRole('radio', { name: /had left/ }));
  await user.click(screen.getByRole('button', { name: '提交答案' }));
  expect(await screen.findByText('回答正确')).toBeVisible();
  expect(screen.getByRole('radio', { name: /had left/ })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: '下一题' }));
  await user.click(screen.getByRole('button', { name: '上一题' }));
  expect(screen.getByText('回答正确')).toBeVisible();
});
```

另写测试覆盖答错时正确答案、错误次数、无未答题完成状态和请求失败保留选择。

- [ ] **Step 2: 写商城与订单失败测试**

```tsx
it('积分不足时说明差额且不发送兑换请求', async () => {
  render(<StorePage initialBalance={50} />);
  await user.click(screen.getByRole('button', { name: /兑换 80 积分/ }));
  expect(screen.getByText('还差 30 积分')).toBeVisible();
  expect(createOrder).not.toHaveBeenCalled();
});
```

订单测试覆盖待领取、已完成、已取消的文字与图标，不只靠颜色。

- [ ] **Step 3: 运行学员页面测试并确认失败**

Run: `pnpm --filter @point-quest/web test -- practice-session.test.tsx wrong-questions.test.tsx store.test.tsx orders.test.tsx`

Expected: FAIL，原因是页面和组件尚不存在。

- [ ] **Step 4: 实现学习首页与练习页**

- 学习首页显示积分、已首次作答数、未答题数、待练错题数。
- 练习页在内存中保存当前打开页面的随机队列。
- 下一题到队尾时请求新的随机题，传已有未提交 ID 到 `excludeIds`。
- 提交后保存只读结果；网络失败保留已选项和幂等键。
- 答错同时显示正确答案、解析和错误次数。

- [ ] **Step 5: 实现错题、商城、订单和个人中心**

- 错题卡显示错误次数与“继续练习”。
- 商城卡使用声明尺寸的响应式图片，库存为 0 时禁用兑换。
- 兑换确认显示商品、所需积分和兑换后余额。
- 每次点击生成一次 UUID 幂等键；失败重试复用原键。
- 订单显示商品快照、花费积分、状态和时间。
- 个人中心显示余额和分页积分流水。

- [ ] **Step 6: 验证测试与提交**

Run: `pnpm --filter @point-quest/web test`

Run: `pnpm --filter @point-quest/web lint`

Run: `pnpm --filter @point-quest/web typecheck`

Expected: 全部 PASS。

```bash
git add apps/web/app apps/web/components apps/web/tests
git commit -m "功能：实现学员答题与积分商城页面"
```

---

### Task 12: 实现管理员运营、题库、倍率、商品和订单页面

**Files:**
- Create: `apps/web/app/(admin)/admin/page.tsx`
- Create: `apps/web/app/(admin)/admin/questions/page.tsx`
- Create: `apps/web/app/(admin)/admin/questions/new/page.tsx`
- Create: `apps/web/app/(admin)/admin/questions/[questionId]/page.tsx`
- Create: `apps/web/app/(admin)/admin/points/page.tsx`
- Create: `apps/web/app/(admin)/admin/products/page.tsx`
- Create: `apps/web/app/(admin)/admin/orders/page.tsx`
- Create: `apps/web/components/admin/question-form.tsx`
- Create: `apps/web/components/admin/point-config-form.tsx`
- Create: `apps/web/components/admin/product-form.tsx`
- Create: `apps/web/components/admin/order-status-dialog.tsx`
- Create: `apps/web/components/data/pagination.tsx`
- Create: `apps/web/components/data/status-filter.tsx`
- Create: `apps/web/tests/admin-question-form.test.tsx`
- Create: `apps/web/tests/admin-product-form.test.tsx`
- Create: `apps/web/tests/admin-orders.test.tsx`

**Interfaces:**
- Consumes: Task 9 管理端 API 客户端
- Produces: 运营概览、题库、倍率、商品和订单页面
- Produces: `QuestionFormValue`、`ProductFormValue`，前端校验与 API DTO 一致

- [ ] **Step 1: 写题目与商品表单失败测试**

```tsx
it('题目必须有 2 至 6 个选项且只有一个正确答案', async () => {
  render(<QuestionForm mode="create" />);
  await fillQuestionWithTwoCorrectOptions();
  await user.click(screen.getByRole('button', { name: '保存题目' }));
  expect(screen.getByRole('alert')).toHaveTextContent('请选择且只能选择一个正确答案');
  expect(saveQuestion).not.toHaveBeenCalled();
});
```

商品测试覆盖必填名称、非负库存、正积分、图片类型和上传失败保留字段。

- [ ] **Step 2: 写订单状态失败测试**

```tsx
it('取消订单前确认并在成功后显示已取消', async () => {
  render(<AdminOrdersPage />);
  await user.click(screen.getByRole('button', { name: '取消订单' }));
  expect(screen.getByRole('dialog', { name: '确认取消订单' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: '确认取消并退款' }));
  expect(await screen.findByText('订单已取消，积分与库存已退回')).toBeVisible();
});
```

- [ ] **Step 3: 运行测试并确认失败**

Run: `pnpm --filter @point-quest/web test -- admin-question-form.test.tsx admin-product-form.test.tsx admin-orders.test.tsx`

Expected: FAIL，原因是管理页面尚不存在。

- [ ] **Step 4: 实现运营与配置页面**

- 概览显示启用题目、今日答题、待领取订单和上架商品数。
- 题库支持搜索、状态筛选、分页、创建、编辑和启停。
- 倍率页显示当前值、1–10 校验和历史记录。
- 列表操作保留当前筛选、分页与滚动位置。

- [ ] **Step 5: 实现商品和订单页面**

- 商品表单先上传图片获取 `imageKey`，再保存商品。
- 上传按钮显示进度和失败恢复；更换图片不删除旧文件。
- 商品列表显示图片、库存、积分和状态。
- 订单支持订单号、用户名、状态和日期筛选。
- 完成和取消均使用确认对话框，按钮提交期间禁用。

- [ ] **Step 6: 验证测试与提交**

Run: `pnpm --filter @point-quest/web test`

Run: `pnpm --filter @point-quest/web lint`

Run: `pnpm --filter @point-quest/web typecheck`

Expected: 全部 PASS。

```bash
git add apps/web/app/\(admin\) apps/web/components/admin apps/web/components/data apps/web/tests
git commit -m "功能：实现管理员运营页面"
```

---

### Task 13: 完成端到端、视觉、文档和交付验证

**Files:**
- Create: `playwright.config.ts`
- Create: `playwright/fixtures/auth.ts`
- Create: `playwright/fixtures/database.ts`
- Create: `playwright/auth-and-questions.spec.ts`
- Create: `playwright/practice-and-wrong-book.spec.ts`
- Create: `playwright/store-and-orders.spec.ts`
- Create: `playwright/responsive-and-a11y.spec.ts`
- Create: `README.md`
- Create: `docs/api/android-integration.md`
- Create: `scripts/verify.sh`
- Modify: `package.json`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `pnpm verify`，执行生成检查、Lint、类型检查、单元测试、集成测试、E2E 和构建
- Produces: Android 集成说明，引用 `openapi/openapi.json`、Bearer/Refresh 流程和错误码
- Produces: 从空库到演示数据的完整 README

- [ ] **Step 1: 写完整 E2E 失败测试**

`auth-and-questions.spec.ts`：

```ts
test('管理员添加题目，学员首次答对获得倍率积分', async ({ adminPage, studentPage }) => {
  await adminPage.goto('/admin/questions/new');
  await createEnglishQuestion(adminPage, { basePoints: 10 });
  await setPointMultiplier(adminPage, 2);
  await studentPage.goto('/learn/practice');
  await answerCurrentQuestionCorrectly(studentPage);
  await expect(studentPage.getByText('获得 20 积分')).toBeVisible();
});
```

`practice-and-wrong-book.spec.ts` 覆盖首次答错、错误次数、重练掌握且不加分。`store-and-orders.spec.ts` 覆盖上传图片、兑换、待领取、管理员完成与取消退款。

- [ ] **Step 2: 运行 E2E 并确认至少一个业务场景失败**

Run: `pnpm test:e2e`

Expected: 若页面、数据隔离或启动编排仍有缺口则 FAIL；记录实际失败并只修复被测试暴露的问题。

- [ ] **Step 3: 补齐测试启动编排与缺失行为**

- Playwright 启动独立 Web/API 测试进程。
- 每个测试文件使用唯一用户名与确定性种子，不共享可变余额。
- 数据库清理使用集合 `deleteMany`，不循环删除记录。
- 修复所有 E2E 暴露的行为缺口。

- [ ] **Step 4: 增加响应式与可访问性验证**

对 375、768、1024、1440 px 分别验证：

- 无横向滚动。
- 固定导航不遮挡内容。
- 键盘可操作答案、对话框和分页。
- Focus 可见。
- 状态有文字与图标。
- `prefers-reduced-motion: reduce` 时无非必要动画。
- 商品图片有替代文本和固定尺寸。

- [ ] **Step 5: 编写运行与 Android 集成文档**

README 必须包含：

```text
1. cp .env.example .env
2. docker compose up -d db
3. pnpm install
4. pnpm db:migrate
5. pnpm db:seed
6. pnpm dev
```

Android 文档说明 `/api/v1/auth/token`、`/auth/refresh`、Bearer Header、Refresh Token 轮换、幂等键、分页和稳定错误码，并给出使用 `openapi/openapi.json` 生成 Kotlin 客户端的入口。

- [ ] **Step 6: 运行最终验证**

Run: `pnpm verify`

Expected:

```text
OpenAPI 生成无差异
Lint 通过
TypeScript 类型检查通过
API 单元与集成测试通过
Web 单元测试通过
Playwright E2E 通过
API 生产构建通过
Web 生产构建通过
```

Run: `git status --short`

Expected: 只有计划追踪文件的预期状态，不存在构建产物、上传测试文件或密钥。

- [ ] **Step 7: 提交**

```bash
git add playwright playwright.config.ts README.md docs/api scripts/verify.sh package.json .gitignore
git commit -m "测试：完成端到端验证与项目文档"
```

---

## 实施完成后的复核清单

- [ ] 规格中的 13 个 Web 路由均可访问且受正确角色保护。
- [ ] 规格中的 32 个 API 路由均出现在 OpenAPI。
- [ ] 首次答题、错题重练、积分、兑换和取消订单都有真实数据库集成测试。
- [ ] 并发请求不能产生重复奖励、负积分、负库存或重复退款。
- [ ] 任何服务代码都没有在循环遍历中查询 SQL。
- [ ] 所有提交信息均为简体中文。
- [ ] Android 可使用 OpenAPI 契约和 Token 接口独立接入。
- [ ] 空状态、错误状态、加载状态和成功状态均有页面实现与测试。
- [ ] 375、768、1024、1440 px 与减少动画模式均通过验证。
