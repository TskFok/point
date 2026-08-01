import assert from "node:assert/strict";
import test from "node:test";

import {
  prepareTestDatabase,
  resolveTestDatabaseUrl,
  withAdvisoryLock,
} from "./clean-test-database.mjs";

test("测试库清理仅接受本机 5433 端口的 point_test", () => {
  assert.equal(
    resolveTestDatabaseUrl(
      "postgresql://point:point@localhost:5433/point_test",
    ),
    "postgresql://point:point@localhost:5433/point_test",
  );
  assert.equal(
    resolveTestDatabaseUrl("postgres://point:point@127.0.0.1:5433/point_test"),
    "postgres://point:point@127.0.0.1:5433/point_test",
  );
});

for (const value of [
  "postgresql://point:point@localhost:5432/point_test",
  "postgresql://point:point@localhost:5433/point",
  "postgresql://point:point@example.com:5433/point_test",
  "postgresql://point:point@localhost:5433/point_test?schema=public",
  "not-a-url",
]) {
  test(`测试库清理拒绝危险目标：${value}`, () => {
    assert.throws(() => resolveTestDatabaseUrl(value), /只允许清理/);
  });
}

test("测试库清理在同一 advisory lock 内执行并始终解锁", async () => {
  const calls = [];
  const client = {
    async query(sql, parameters) {
      calls.push({ parameters, sql });
    },
  };

  await withAdvisoryLock(client, async () => {
    calls.push("cleanup");
  });

  assert.deepEqual(calls, [
    {
      parameters: [72_456_390],
      sql: "SELECT pg_advisory_lock($1)",
    },
    "cleanup",
    {
      parameters: [72_456_390],
      sql: "SELECT pg_advisory_unlock($1)",
    },
  ]);
});

test("迁移和业务数据清理共享同一个 advisory lock", async () => {
  const calls = [];
  const client = {
    async query(sql) {
      calls.push(sql.includes("unlock") ? "unlock" : "lock");
    },
  };

  await prepareTestDatabase({
    cleanup: async () => calls.push("cleanup"),
    client,
    migrate: async () => calls.push("migrate"),
  });

  assert.deepEqual(calls, ["lock", "migrate", "cleanup", "unlock"]);
});
