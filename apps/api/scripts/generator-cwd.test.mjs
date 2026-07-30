import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("../../../", import.meta.url);
const openApiPath = new URL("openapi/openapi.json", repoRoot);
const schemaPath = new URL("packages/api-client/src/schema.ts", repoRoot);
test("两个生成器从任意 cwd 调用时仍只写仓库目标文件", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "point-generators-"));
  try {
    const foreignCwd = join(temporary, "a", "b");
    const decoyDirectory = join(temporary, "openapi");
    const decoyPath = join(decoyDirectory, "openapi.json");
    await mkdir(foreignCwd, { recursive: true });
    await mkdir(decoyDirectory, { recursive: true });
    await writeFile(decoyPath, "decoy", "utf8");

    const apiBefore = await readFile(openApiPath, "utf8");
    const schemaBefore = await readFile(schemaPath, "utf8");
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
    assert.equal(await readFile(openApiPath, "utf8"), apiBefore);
    assert.equal(await readFile(schemaPath, "utf8"), schemaBefore);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
