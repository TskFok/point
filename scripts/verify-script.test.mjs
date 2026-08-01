import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("完整验证会在严格校验目标后迁移并清理 point_test", async () => {
  const script = await readFile(
    new URL("./verify.sh", import.meta.url),
    "utf8",
  );
  const guardIndex = script.indexOf("TEST_DATABASE_URL 必须精确指向");
  const prepareIndex = script.indexOf("node scripts/clean-test-database.mjs");
  const apiE2eIndex = script.indexOf("pnpm --filter @point-quest/api test:e2e");

  assert.notEqual(guardIndex, -1, "必须保留测试数据库目标守卫");
  assert.ok(prepareIndex > guardIndex, "必须先校验目标，再准备测试库");
  assert.ok(apiE2eIndex > prepareIndex, "必须先准备测试库，再运行 API E2E");
  assert.doesNotMatch(script, /pnpm prisma migrate deploy/);
  assert.doesNotMatch(script, /prisma migrate reset/);
});
