import assert from "node:assert/strict";
import {
  access,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runWithRecovery } from "./generator-error-handling.mjs";

const repoRoot = new URL("../../../", import.meta.url);
const openApiPath = new URL("openapi/openapi.json", repoRoot);
const schemaPath = new URL("packages/api-client/src/schema.ts", repoRoot);

async function verifyGeneratorsFromForeignCwd({
  failAfterApiGeneration = false,
  onTemporaryCreated = () => {},
} = {}) {
  const [apiBefore, schemaBefore] = await Promise.all([
    readFile(openApiPath),
    readFile(schemaPath),
  ]);
  const temporary = await mkdtemp(join(tmpdir(), "point-generators-"));
  return runWithRecovery({
    execute: async () => {
      onTemporaryCreated(temporary);
      const foreignCwd = join(temporary, "a", "b");
      const decoyDirectory = join(temporary, "openapi");
      const decoyPath = join(decoyDirectory, "openapi.json");
      await mkdir(foreignCwd, { recursive: true });
      await mkdir(decoyDirectory, { recursive: true });
      await writeFile(decoyPath, "decoy", "utf8");

      const apiGeneration = spawnSync(
        process.execPath,
        [
          new URL("apps/api/scripts/generate-openapi.mjs", repoRoot).pathname,
        ],
        { cwd: foreignCwd, encoding: "utf8" },
      );
      assert.equal(
        apiGeneration.status,
        0,
        `${apiGeneration.stdout}\n${apiGeneration.stderr}`,
      );
      if (failAfterApiGeneration) {
        throw new Error("故意触发生成校验失败");
      }
      const clientGeneration = spawnSync(
        process.execPath,
        [
          new URL(
            "packages/api-client/scripts/generate-schema.mjs",
            repoRoot,
          ).pathname,
        ],
        { cwd: foreignCwd, encoding: "utf8" },
      );
      assert.equal(
        clientGeneration.status,
        0,
        `${clientGeneration.stdout}\n${clientGeneration.stderr}`,
      );

      assert.equal(await readFile(decoyPath, "utf8"), "decoy");
      assert.deepEqual(await readFile(openApiPath), apiBefore);
      assert.deepEqual(await readFile(schemaPath), schemaBefore);
    },
    recover: [
      () => writeFile(openApiPath, apiBefore),
      () => writeFile(schemaPath, schemaBefore),
      () => rm(temporary, { recursive: true, force: true }),
    ],
  });
}

test(
  "两个生成器从任意 cwd 调用时仍只写仓库目标文件",
  verifyGeneratorsFromForeignCwd,
);

test("生成校验失败时恢复两个 tracked 产物的原字节", async () => {
  const apiBefore = await readFile(openApiPath);
  const schemaBefore = await readFile(schemaPath);
  const apiSentinel = Buffer.from("{ invalid openapi sentinel");
  const schemaSentinel = Buffer.from("invalid schema sentinel");
  let failedTemporary;
  await runWithRecovery({
    execute: async () => {
      await writeFile(openApiPath, apiSentinel);
      await writeFile(schemaPath, schemaSentinel);
      await assert.rejects(
        verifyGeneratorsFromForeignCwd({
          failAfterApiGeneration: true,
          onTemporaryCreated: (temporary) => {
            failedTemporary = temporary;
          },
        }),
        /故意触发生成校验失败/,
      );
      assert.deepEqual(await readFile(openApiPath), apiSentinel);
      assert.deepEqual(await readFile(schemaPath), schemaSentinel);
      assert.equal(typeof failedTemporary, "string");
      await assert.rejects(access(failedTemporary), { code: "ENOENT" });
    },
    recover: [
      () => writeFile(openApiPath, apiBefore),
      () => writeFile(schemaPath, schemaBefore),
    ],
  });
});
