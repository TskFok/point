import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Client } from "pg";

const defaultTestDatabaseUrl =
  "postgresql://point:point@localhost:5433/point_test";
const advisoryLockId = 72_456_390;
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function resolveTestDatabaseUrl(
  value = process.env.TEST_DATABASE_URL ??
    process.env.DATABASE_URL ??
    defaultTestDatabaseUrl,
) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("只允许清理 localhost:5433/point_test 测试数据库");
  }

  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
    !["localhost", "127.0.0.1"].includes(parsed.hostname) ||
    parsed.port !== "5433" ||
    parsed.pathname !== "/point_test" ||
    parsed.search !== "" ||
    parsed.hash !== ""
  ) {
    throw new Error("只允许清理 localhost:5433/point_test 测试数据库");
  }

  return value;
}

export async function clearTestDatabase(prisma) {
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

export async function withAdvisoryLock(client, operation) {
  await client.query("SELECT pg_advisory_lock($1)", [advisoryLockId]);
  try {
    return await operation();
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [advisoryLockId]);
  }
}

export async function prepareTestDatabase({ cleanup, client, migrate }) {
  await withAdvisoryLock(client, async () => {
    await migrate();
    await cleanup();
  });
}

function deployMigrations() {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn("pnpm", ["prisma", "migrate", "deploy"], {
      cwd: repoRoot,
      env: process.env,
      stdio: "inherit",
    });
    child.once("error", rejectPromise);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      rejectPromise(
        new Error(
          `测试库迁移失败：${signal ? `signal ${signal}` : `exit ${code}`}`,
        ),
      );
    });
  });
}

async function main() {
  const databaseUrl = resolveTestDatabaseUrl();
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });
  const lockClient = new Client({
    application_name: `point-quest-verify-cleanup-${process.pid}`,
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5_000,
  });

  await lockClient.connect();
  try {
    await prepareTestDatabase({
      cleanup: () => clearTestDatabase(prisma),
      client: lockClient,
      migrate: deployMigrations,
    });
    process.stdout.write(
      `${JSON.stringify({ cleaned: "localhost:5433/point_test" })}\n`,
    );
  } finally {
    await Promise.all([prisma.$disconnect(), lockClient.end()]);
  }
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  await main();
}
