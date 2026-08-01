import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { test as base } from "playwright/test";
import { hash } from "bcryptjs";
import { rm } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { tmpdir } from "node:os";
import { Client } from "pg";

const defaultTestDatabaseUrl =
  "postgresql://point:point@127.0.0.1:5433/point_test";
const advisoryLockId = 72_456_390;
const password = "StrongPass123!";

const fileNamespaces: Record<string, string> = {
  "auth-and-questions.spec.ts": "pw_authq",
  "practice-and-wrong-book.spec.ts": "pw_wrong",
  "responsive-and-a11y.spec.ts": "pw_a11y",
  "store-and-orders.spec.ts": "pw_store",
};

export function resolveTestDatabaseUrl(
  value = process.env.TEST_DATABASE_URL ?? defaultTestDatabaseUrl,
): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Playwright 测试数据库 URL 无效");
  }
  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
    !["localhost", "127.0.0.1"].includes(parsed.hostname) ||
    parsed.port !== "5433" ||
    parsed.pathname !== "/point_test" ||
    parsed.search !== "" ||
    parsed.hash !== ""
  ) {
    throw new Error(
      "Playwright 只允许使用 localhost:5433/point_test 测试数据库",
    );
  }
  return value;
}

function namespaceForFile(file: string): string {
  const namespace = fileNamespaces[basename(file)];
  if (!namespace) {
    throw new Error(`未给 Playwright 测试文件配置唯一命名空间：${file}`);
  }
  return namespace;
}

function createPrisma(databaseUrl: string): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });
}

async function clearDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.$transaction([
    prisma.pointLedger.deleteMany(),
    prisma.answerAttempt.deleteMany(),
    prisma.questionProgress.deleteMany(),
    prisma.order.deleteMany(),
    prisma.questionOption.deleteMany(),
    prisma.question.deleteMany(),
    prisma.product.deleteMany(),
    prisma.pointConfig.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.user.deleteMany(),
  ]);
}

export type PlaywrightDatabase = {
  admin: {
    id: string;
    password: string;
    username: string;
  };
  prisma: PrismaClient;
  student: {
    password: string;
    username: string;
  };
};

type DatabaseFixtures = {
  database: PlaywrightDatabase;
};

export const test = base.extend<DatabaseFixtures>({
  database: async ({}, use, testInfo) => {
    const databaseUrl = resolveTestDatabaseUrl();
    const namespace = namespaceForFile(testInfo.file);
    const prisma = createPrisma(databaseUrl);
    const passwordHash = await hash(password, 12);
    const database: PlaywrightDatabase = {
      admin: {
        id: `${namespace}-admin`,
        password,
        username: `${namespace}_admin`,
      },
      prisma,
      student: {
        password,
        username: `${namespace}_student`,
      },
    };

    await clearDatabase(prisma);
    await prisma.user.createMany({
      data: [
        {
          id: database.admin.id,
          passwordHash,
          role: "ADMIN",
          username: database.admin.username,
        },
      ],
    });

    try {
      await use(database);
    } finally {
      await clearDatabase(prisma);
      await prisma.$disconnect();
    }
  },
});

async function removeUploadRoot(): Promise<void> {
  const configuredRoot = process.env.PLAYWRIGHT_UPLOAD_ROOT;
  if (!configuredRoot) return;
  const allowedParent = resolve(tmpdir());
  const target = resolve(configuredRoot);
  if (
    !target.startsWith(`${allowedParent}/point-quest-playwright-uploads-`) ||
    target === allowedParent
  ) {
    throw new Error("拒绝清理非 Playwright 专用上传目录");
  }
  await rm(target, { force: true, recursive: true });
}

export default async function globalSetup(): Promise<() => Promise<void>> {
  const databaseUrl = resolveTestDatabaseUrl();
  const client = new Client({
    application_name: `point-quest-playwright-${process.pid}`,
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5_000,
  });
  await client.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [advisoryLockId]);
    const schema = await client.query<{ users: string | null }>(
      `SELECT to_regclass('"User"')::text AS users`,
    );
    if (!schema.rows[0]?.users) {
      throw new Error(
        "point_test 尚未迁移，请先使用该测试库运行 prisma migrate deploy",
      );
    }
  } catch (error) {
    await client.end();
    throw error;
  }

  return async () => {
    const failures: unknown[] = [];
    try {
      await client.query("SELECT pg_advisory_unlock($1)", [advisoryLockId]);
    } catch (error) {
      failures.push(error);
    }
    try {
      await client.end();
    } catch (error) {
      failures.push(error);
    }
    try {
      await removeUploadRoot();
    } catch (error) {
      failures.push(error);
    }
    if (failures.length > 0) {
      throw new AggregateError(failures, "Playwright 全局资源清理失败");
    }
  };
}
