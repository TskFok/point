import assert from "node:assert/strict";
import test from "node:test";
import { runWithRecovery } from "./generator-error-handling.mjs";

test("仅 core 失败时原样保留 core error", async () => {
  const coreError = new Error("core failed");

  await assert.rejects(
    runWithRecovery({
      execute: async () => {
        throw coreError;
      },
      recover: [async () => {}],
    }),
    (error) => error === coreError,
  );
});

test("仅两个恢复操作失败时同时报告全部恢复错误", async () => {
  const firstRecoveryError = new Error("restore openapi failed");
  const secondRecoveryError = new Error("restore schema failed");

  await assert.rejects(
    runWithRecovery({
      execute: async () => "generated",
      recover: [
        async () => {
          throw firstRecoveryError;
        },
        async () => {
          throw secondRecoveryError;
        },
      ],
    }),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.deepEqual(error.errors, [
        firstRecoveryError,
        secondRecoveryError,
      ]);
      return true;
    },
  );
});

test("core 与恢复清理同时失败时保留 core 并列出所有次级错误", async () => {
  const coreError = new Error("core failed");
  const restorationError = new Error("restore failed");
  const cleanupError = new Error("cleanup failed");

  await assert.rejects(
    runWithRecovery({
      execute: async () => {
        throw coreError;
      },
      recover: [
        async () => {
          throw restorationError;
        },
        async () => {
          throw cleanupError;
        },
      ],
    }),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.equal(error.cause, coreError);
      assert.deepEqual(error.errors, [
        coreError,
        restorationError,
        cleanupError,
      ]);
      return true;
    },
  );
});
