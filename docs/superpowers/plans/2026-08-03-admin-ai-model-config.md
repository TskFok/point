# 管理端 AI 模型配置 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在运营台提供多套 AI 模型配置的增删改、启停与 OpenAI 兼容连通性测试；API Key 加密入库、脱敏回显。

**Architecture:** Prisma `AiModelConfig` 存密文与元数据；Nest `ai-models` 模块提供 Admin CRUD + 两种 test 接口；Web `/admin/ai-models` 列表与表单对齐商品管理交互。本期不接业务调用、不做默认模型。

**Tech Stack:** NestJS、Prisma、PostgreSQL、AES-256-GCM（`node:crypto`）、Next.js、Jest、OpenAPI / `@point-quest/api-client`。

## Global Constraints

- Spec：`docs/superpowers/specs/2026-08-03-admin-ai-model-config-design.md`
- API Key：AES-256-GCM；响应仅 `apiKeyMasked`；PATCH 时 `apiKey` 省略或空字符串 = 不改密钥
- `isEnabled` 各记录独立，可全开/全关
- 连通性：服务端 `GET {baseUrl}/models`，Bearer，超时 10s；失败仍 HTTP 200 + `{ ok: false }`
- 加密密钥：`AI_CONFIG_ENCRYPTION_KEY`（32 字节的 base64），不复用 `AUTH_JWT_SECRET`
- 全部 Admin 接口 `@Roles('ADMIN')`；日志禁止打印密钥
- 新增/修改功能必须带单元测试且通过；改 API 后执行 `pnpm api:spec` 与 `pnpm api:client`

## File Structure

| 路径 | 职责 |
|------|------|
| `apps/api/src/ai-models/secret-crypto.ts` | API Key 加解密与脱敏 |
| `apps/api/src/ai-models/probe-openai-compatible.ts` | URL 规范化与 `/models` 探测 |
| `apps/api/src/ai-models/ai-models.service.ts` | CRUD + test 业务 |
| `apps/api/src/ai-models/admin-ai-models.controller.ts` | Admin HTTP |
| `apps/api/src/ai-models/ai-models.module.ts` | 模块注册 |
| `apps/api/src/ai-models/dto/*.ts` | class-validator DTO |
| `apps/web/components/admin/ai-model-form.tsx` | 新建/编辑表单 |
| `apps/web/app/(admin)/admin/ai-models/page.tsx` | 列表页 |
| `prisma/schema.prisma` + migration | `AiModelConfig` |

---

### Task 1: API Key 加解密工具

**Files:**
- Create: `apps/api/src/ai-models/secret-crypto.ts`
- Create: `apps/api/src/ai-models/secret-crypto.spec.ts`
- Modify: `.env.example`
- Modify: `.env.docker.example`
- Modify: `docker-compose.yml`（`api.environment` 注入 `AI_CONFIG_ENCRYPTION_KEY`）
- Modify: `docs/deployment/docker.md`（一句说明）
- Test: `apps/api/src/ai-models/secret-crypto.spec.ts`

**Interfaces:**
- Produces:
  - `resolveEncryptionKey(env?: NodeJS.ProcessEnv): Buffer`
  - `encryptSecret(plaintext: string, key: Buffer): { ciphertext: string; last4: string }`
  - `decryptSecret(ciphertext: string, key: Buffer): string`
  - `maskApiKey(last4: string): string` → `` `••••${last4}` ``

- [ ] **Step 1: 写失败测试**

```ts
import {
  decryptSecret,
  encryptSecret,
  maskApiKey,
  resolveEncryptionKey,
} from './secret-crypto';

describe('secret-crypto', () => {
  const key = resolveEncryptionKey({
    AI_CONFIG_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  });

  it('往返加密', () => {
    const { ciphertext, last4 } = encryptSecret('sk-test-key-1234', key);
    expect(last4).toBe('1234');
    expect(ciphertext).not.toContain('sk-test');
    expect(decryptSecret(ciphertext, key)).toBe('sk-test-key-1234');
  });

  it('脱敏', () => {
    expect(maskApiKey('abcd')).toBe('••••abcd');
  });

  it('缺少密钥时报错', () => {
    expect(() => resolveEncryptionKey({})).toThrow(/AI_CONFIG_ENCRYPTION_KEY/);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter @point-quest/api test -- secret-crypto.spec.ts`  
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `secret-crypto.ts`**

```ts
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'node:crypto';

const KEY_ENV = 'AI_CONFIG_ENCRYPTION_KEY';

export function resolveEncryptionKey(
  env: NodeJS.ProcessEnv = process.env,
): Buffer {
  const raw = env[KEY_ENV]?.trim();
  if (!raw) {
    throw new Error(`${KEY_ENV} is required`);
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error(`${KEY_ENV} must decode to 32 bytes`);
  }
  return key;
}

/** 格式：base64(iv).base64(tag).base64(ciphertext) */
export function encryptSecret(
  plaintext: string,
  key: Buffer,
): { ciphertext: string; last4: string } {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  const last4 =
    plaintext.length <= 4 ? plaintext : plaintext.slice(-4);
  return {
    ciphertext: `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`,
    last4,
  };
}

export function decryptSecret(ciphertext: string, key: Buffer): string {
  const [ivB64, tagB64, dataB64] = ciphertext.split('.');
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Invalid ciphertext format');
  }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(ivB64, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

export function maskApiKey(last4: string): string {
  return `••••${last4}`;
}
```

- [ ] **Step 4: 跑测试通过**

Run: `pnpm --filter @point-quest/api test -- secret-crypto.spec.ts`  
Expected: PASS

- [ ] **Step 5: 环境变量占位**

`.env.example` 增加（本地开发可用固定 32 字节全零 base64，注释标明仅本地）：

```bash
# 32 字节密钥的 base64；生产必须替换为随机值
AI_CONFIG_ENCRYPTION_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=
```

`.env.docker.example` 增加占位 `replace-with-base64-of-32-random-bytes`。  
`docker-compose.yml` 的 `api.environment` 增加：

```yaml
AI_CONFIG_ENCRYPTION_KEY: ${AI_CONFIG_ENCRYPTION_KEY:?AI_CONFIG_ENCRYPTION_KEY is required}
```

`docs/deployment/docker.md` 补一句：生产 `.env` 须设置 `AI_CONFIG_ENCRYPTION_KEY`。  
若存在 `scripts/docker-production.test.mjs` 对 compose 环境变量的断言，同步断言新变量。

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/ai-models/secret-crypto.ts apps/api/src/ai-models/secret-crypto.spec.ts \
  .env.example .env.docker.example docker-compose.yml docs/deployment/docker.md \
  scripts/docker-production.test.mjs
git commit -m "$(cat <<'EOF'
feat: 增加 AI 配置 API Key 加解密工具

EOF
)"
```

---

### Task 2: Prisma `AiModelConfig`

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/0005_add_ai_model_config/migration.sql`
- Test: 通过 `pnpm db:migrate`（或项目既有 migrate 命令）应用到开发库

**Interfaces:**
- Produces: Prisma model `AiModelConfig`；`User.aiModelConfigs` 反向关系

- [ ] **Step 1: 在 `schema.prisma` 的 `User` 增加关系字段**

```prisma
aiModelConfigs    AiModelConfig[]    @relation("AiModelConfigUpdater")
```

- [ ] **Step 2: 追加模型**

```prisma
model AiModelConfig {
  id               String   @id @default(cuid())
  name             String   @unique
  baseUrl          String
  apiKeyCiphertext String
  apiKeyLast4      String
  isEnabled        Boolean  @default(true)
  updatedBy        String
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  updater          User     @relation("AiModelConfigUpdater", fields: [updatedBy], references: [id], onDelete: Restrict)

  @@index([updatedAt, id])
  @@index([isEnabled])
}
```

- [ ] **Step 3: 生成 migration SQL（手写或 `prisma migrate dev`）**

`migration.sql` 须创建表与索引、外键到 `User`。`baseUrl`/`apiKeyCiphertext` 用 `TEXT`；`name`/`apiKeyLast4` 用合理 `VARCHAR`。

- [ ] **Step 4: 应用迁移并生成 client**

Run: `pnpm db:migrate`（或仓库文档中的等价命令）与 `pnpm exec prisma generate`  
Expected: 成功，无错误

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/0005_add_ai_model_config
git commit -m "$(cat <<'EOF'
feat: 增加 AiModelConfig 数据表

EOF
)"
```

---

### Task 3: AI Models Service CRUD

**Files:**
- Create: `apps/api/src/ai-models/ai-models.service.ts`
- Create: `apps/api/src/ai-models/ai-models.service.spec.ts`
- Create: `apps/api/src/ai-models/dto/create-ai-model.dto.ts`
- Create: `apps/api/src/ai-models/dto/update-ai-model.dto.ts`
- Create: `apps/api/src/ai-models/dto/list-ai-models.dto.ts`
- Test: `apps/api/src/ai-models/ai-models.service.spec.ts`

**Interfaces:**
- Consumes: `encryptSecret` / `decryptSecret` / `maskApiKey` / `resolveEncryptionKey`；`PrismaService`
- Produces:
  - `toDto(row): AiModelConfigView`
  - `list(page, pageSize, isEnabled?)`
  - `get(id)`
  - `create(input, userId)`
  - `update(id, input, userId)` — `apiKey` 空则保留密文
  - `remove(id)`
  - 类型 `AiModelConfigView = { id, name, baseUrl, apiKeyMasked, isEnabled, createdAt, updatedAt }`（时间为 ISO string）

- [ ] **Step 1: 写失败的 service 测试（mock Prisma）**

覆盖至少：
1. `create` 加密后写入，返回脱敏 DTO  
2. `update` 不传 `apiKey` 时不改 `apiKeyCiphertext`  
3. `update` 传新 `apiKey` 时更新密文与 last4  
4. `name` 冲突 → `ConflictException` code `AI_MODEL_NAME_CONFLICT`  
5. 不存在 → `NotFoundException` code `AI_MODEL_NOT_FOUND`  
6. `baseUrl` 非 http(s) → `BadRequestException` `VALIDATION_FAILED`

用固定 `AI_CONFIG_ENCRYPTION_KEY` 注入：在 `beforeEach` 设 `process.env.AI_CONFIG_ENCRYPTION_KEY`，或让 service 构造时可注入 key resolver。

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @point-quest/api test -- ai-models.service.spec.ts`  
Expected: FAIL

- [ ] **Step 3: 实现 DTO（对齐商品 DTO 风格）**

`CreateAiModelDto`：`name`（≤100）、`baseUrl`（≤500）、`apiKey`（非空字符串）、可选 `isEnabled`。  
`UpdateAiModelDto`：上述字段均可选；`apiKey` 允许空字符串。  
`ListAiModelsDto`：`page`/`pageSize`/`isEnabled?`，同 `ListProductsDto`。

Service 内校验 `baseUrl`：

```ts
function assertHttpUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw validationFailed('调用地址必须是合法 URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw validationFailed('调用地址必须是 http 或 https');
  }
  return value.replace(/\/+$/, ''); // 存库时去尾斜杠（探测时再拼 /models）
}
```

`create`/`update` 使用 `encryptSecret`；`P2002` on `name` → Conflict。  
`toDto` 使用 `maskApiKey(row.apiKeyLast4)`，`createdAt`/`updatedAt` 用 `.toISOString()`。

- [ ] **Step 4: 跑测试通过**

Run: `pnpm --filter @point-quest/api test -- ai-models.service.spec.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/ai-models
git commit -m "$(cat <<'EOF'
feat: 实现 AI 模型配置 CRUD 服务

EOF
)"
```

---

### Task 4: 连通性探测

**Files:**
- Create: `apps/api/src/ai-models/probe-openai-compatible.ts`
- Create: `apps/api/src/ai-models/probe-openai-compatible.spec.ts`
- Modify: `apps/api/src/ai-models/ai-models.service.ts`
- Modify: `apps/api/src/ai-models/ai-models.service.spec.ts`
- Create: `apps/api/src/ai-models/dto/test-ai-model-draft.dto.ts`
- Test: `probe-openai-compatible.spec.ts`、`ai-models.service.spec.ts`

**Interfaces:**
- Produces:
  - `normalizeModelsUrl(baseUrl: string): string`
  - `probeOpenAiCompatibleModels(baseUrl: string, apiKey: string, options?: { fetchImpl?; timeoutMs? }): Promise<{ ok: boolean; latencyMs: number; modelCount?: number; message?: string }>`
  - Service: `testById(id)`、`testDraft({ baseUrl, apiKey?, id? })`

- [ ] **Step 1: probe 单元测试**

```ts
it('规范化 URL', () => {
  expect(normalizeModelsUrl('https://api.example.com/v1/')).toBe(
    'https://api.example.com/v1/models',
  );
  expect(normalizeModelsUrl('https://api.example.com/v1/models')).toBe(
    'https://api.example.com/v1/models',
  );
});

it('2xx 成功并解析 modelCount', async () => {
  const fetchImpl = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ data: [{ id: 'a' }, { id: 'b' }] }),
  });
  const result = await probeOpenAiCompatibleModels(
    'https://api.example.com/v1',
    'sk-x',
    { fetchImpl, timeoutMs: 10_000 },
  );
  expect(result.ok).toBe(true);
  expect(result.modelCount).toBe(2);
  expect(fetchImpl).toHaveBeenCalledWith(
    'https://api.example.com/v1/models',
    expect.objectContaining({
      method: 'GET',
      headers: expect.objectContaining({
        Authorization: 'Bearer sk-x',
      }),
    }),
  );
});

it('401 返回 ok:false 且 message 不含密钥', async () => {
  const fetchImpl = jest.fn().mockResolvedValue({
    ok: false,
    status: 401,
    statusText: 'Unauthorized',
    json: async () => ({}),
  });
  const result = await probeOpenAiCompatibleModels(
    'https://api.example.com/v1',
    'sk-secret',
    { fetchImpl },
  );
  expect(result.ok).toBe(false);
  expect(result.message).not.toContain('sk-secret');
});
```

超时用例：`fetchImpl` 返回永不 resolve 的 Promise，配合极短 `timeoutMs`（用 `AbortSignal`），断言 `ok: false`。

- [ ] **Step 2: 实现 probe**

使用 `fetch` + `AbortSignal.timeout(timeoutMs)`（或 `AbortController`）。  
解析 JSON：若存在 `data` 数组则 `modelCount = data.length`。  
错误 message 示例：`HTTP 401`、`请求超时`、`网络错误`——不得拼接 apiKey。

- [ ] **Step 3: Service 接入**

```ts
async testById(id: string) {
  const row = await this.requireRow(id);
  const apiKey = decryptSecret(row.apiKeyCiphertext, resolveEncryptionKey());
  return probeOpenAiCompatibleModels(row.baseUrl, apiKey);
}

async testDraft(input: { baseUrl: string; apiKey?: string; id?: string }) {
  const baseUrl = assertHttpUrl(normalizeText(input.baseUrl, '调用地址', 500));
  let apiKey = input.apiKey?.trim() ?? '';
  if (!apiKey) {
    if (!input.id) throw validationFailed('测试连通需要 API Key 或已保存配置 id');
    const row = await this.requireRow(input.id);
    apiKey = decryptSecret(row.apiKeyCiphertext, resolveEncryptionKey());
  }
  return probeOpenAiCompatibleModels(baseUrl, apiKey);
}
```

补充 service 测试：mock probe 或 mock fetch；草稿优先用非空 `apiKey`。

- [ ] **Step 4: 跑测试通过**

Run: `pnpm --filter @point-quest/api test -- ai-models`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/ai-models
git commit -m "$(cat <<'EOF'
feat: 增加 AI 模型 OpenAI 兼容连通性探测

EOF
)"
```

---

### Task 5: Admin Controller + OpenAPI + api-client

**Files:**
- Create: `apps/api/src/ai-models/admin-ai-models.controller.ts`
- Create: `apps/api/src/ai-models/ai-models.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/openapi/api-contract.models.ts`（新增 DTO 类）
- Modify: `apps/api/src/openapi/api-contract.decorator.ts`（如需 `aiModelIdParam` / queries）
- Modify: `apps/api/src/openapi/create-openapi-document.spec.ts`（路径数 30→34，operationId 35→42）
- Regenerate: `openapi/openapi.json`、`packages/api-client/src/*`
- Test: `create-openapi-document.spec.ts` + 既有 api-client 测试

**Interfaces:**
- operationIds（稳定名，勿改）：
  - `adminListAiModels`
  - `adminCreateAiModel`
  - `adminGetAiModel`
  - `adminUpdateAiModel`
  - `adminDeleteAiModel`
  - `adminTestAiModelDraft` → `POST /admin/ai-models/test`
  - `adminTestAiModel` → `POST /admin/ai-models/{id}/test`
- OpenAPI schemas: `AiModelConfigDto`、`AiModelConfigListResponseDto`、`CreateAiModelRequestDto`、`UpdateAiModelRequestDto`、`TestAiModelDraftRequestDto`、`AiModelProbeResultDto`

- [ ] **Step 1: 在 `api-contract.models.ts` 追加 Swagger DTO**

字段与 spec 一致；`AiModelProbeResultDto`：`ok`、`latencyMs`、可选 `modelCount`/`message`。  
`Delete` 成功可用现有 `SuccessResponseDto` 或 `{ success: true }`（与仓库删除约定一致；若无删除先例则返回 `SuccessResponseDto`）。

- [ ] **Step 2: 实现 Controller**

```ts
@Controller('admin/ai-models')
@Roles('ADMIN')
@ApiTags('管理端-AI模型')
export class AdminAiModelsController {
  // 注意：@Post('test') 写在 @Post(':id/test') 与 @Get(':id') 之前
}
```

每个方法 `@ApiContract({ operationId, authenticated: true, mutation: true/false, ... })`。  
写操作传 `@CurrentUser() user`，把 `user.id` 交给 service。

- [ ] **Step 3: 注册 Module**

```ts
@Module({
  controllers: [AdminAiModelsController],
  providers: [AiModelsService],
  exports: [AiModelsService],
})
export class AiModelsModule {}
```

`AppModule.imports` 加入 `AiModelsModule`。

- [ ] **Step 4: 更新 OpenAPI 计数测试并生成**

`create-openapi-document.spec.ts`：`paths` 长度 **34**，operations **42**。可增一条断言 `adminListAiModels` / `adminTestAiModelDraft` 存在。

Run:

```bash
pnpm --filter @point-quest/api test -- create-openapi-document.spec.ts
pnpm api:spec
pnpm api:client
pnpm --filter @point-quest/api-client test
```

Expected: 全部 PASS；`packages/api-client` 出现 `listAdminAiModels` 等方法。

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/ai-models apps/api/src/app.module.ts \
  apps/api/src/openapi openapi/openapi.json packages/api-client
git commit -m "$(cat <<'EOF'
feat: 暴露 AI 模型管理 API 并更新契约客户端

EOF
)"
```

---

### Task 6: Web 管理端页面

**Files:**
- Create: `apps/web/components/admin/ai-model-form.tsx`
- Create: `apps/web/app/(admin)/admin/ai-models/page.tsx`
- Create: `apps/web/tests/admin-ai-model-form.test.tsx`
- Create: `apps/web/tests/admin-ai-models-page.test.tsx`（或并入 `admin-pages.test.tsx`）
- Modify: `apps/web/components/layout/admin-shell.tsx`（导航项）
- Modify: `apps/web/tests/navigation.test.tsx`（若断言侧栏条目）
- Test: 上述 web 测试

**Interfaces:**
- Consumes api-client：`listAdminAiModels`、`createAdminAiModel`、`updateAdminAiModel`、`deleteAdminAiModel`、`testAdminAiModel`、`testAdminAiModelDraft`（以生成后的真实方法名为准）
- Form props：`mode: 'create' | 'edit'`、`initial?`、`api`、`onSaved?`、`onCancel?`

- [ ] **Step 1: 表单失败测试**

覆盖：
1. 新建时名称为空 / 地址非法 / API Key 为空 → 本地校验，不调 API  
2. 编辑时 API Key 留空 → `update` 不传或传 `""`（与 client 约定一致，对应服务端「不改密钥」）  
3. 点击「测试连通」→ 调 `testAdminAiModelDraft`；成功显示耗时；失败显示 `message`  
4. 保存成功回调 `onSaved`

对齐 `admin-product-form.test.tsx` 的 mock API 风格。

- [ ] **Step 2: 实现 `ai-model-form.tsx`**

字段 label：模型名称、调用地址、API Key、启用。  
按钮：保存、测试连通、取消（编辑时）。  
`type="password"` 用于 API Key；编辑占位「留空则不修改」。

- [ ] **Step 3: 列表页测试 + 实现**

对齐 `products/page.tsx`：URL `isEnabled`/`page`、`StatusFilter`、分页、`AsyncError`、删除确认、`isEnabled` 快捷切换（`update` 只改该字段）、行内「测试」调 `testAdminAiModel(id)`。  
展示 `apiKeyMasked`，永不假设有明文。

- [ ] **Step 4: 侧栏**

`admin-shell.tsx` 的 `adminItems` 在积分设置后增加：

```ts
{ href: "/admin/ai-models", icon: Bot /* 或 Cpu */, label: "AI 模型" },
```

更新导航相关测试断言。

- [ ] **Step 5: 跑 Web 测试**

Run: `pnpm --filter @point-quest/web test -- admin-ai-model`  
Expected: PASS  
（若导航测试文件名不同，一并跑 `navigation.test.tsx`）

- [ ] **Step 6: Commit**

```bash
git add apps/web
git commit -m "$(cat <<'EOF'
feat: 增加运营台 AI 模型配置页

EOF
)"
```

---

## Spec Coverage Checklist

| Spec 要求 | Task |
|-----------|------|
| `AiModelConfig` 字段与唯一 name | 2 |
| AES-256-GCM + `AI_CONFIG_ENCRYPTION_KEY` | 1 |
| 脱敏 DTO / 留空不改密钥 | 3 |
| 独立 `isEnabled`、CRUD、分页筛选 | 3、5、6 |
| `POST .../test` 与 `POST .../{id}/test`、密钥解析顺序 | 4、5 |
| OpenAI `/models` 探测、10s、失败仍 200 | 4 |
| Web 列表/表单/测试按钮/侧栏 | 6 |
| 单元测试 + OpenAPI/client | 1、3、4、5、6 |
| 无默认模型 / 无业务调用 / 无明文查看 | 全任务 YAGNI |

## Self-Review Notes

- 无 TBD；operationId 与路径已钉死。  
- 草稿测试密钥优先级与 spec 一致：非空 `apiKey` 优先，否则 `id`。  
- OpenAPI 计数从 30/35 → 34/42（4 路径、7 operation）。若实现时合并路径导致计数不同，以实际 `document.paths` 为准并更新断言，但 operationId 名称保持上表。

---

**Plan complete.** 执行方式二选一：

1. **Subagent-Driven（推荐）** — 每任务新开子代理，任务间审查  
2. **Inline Execution** — 本会话按 executing-plans 连续推进并设检查点

你要哪一种？
