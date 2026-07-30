import assert from "node:assert/strict";
import { rm, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";

const packageRoot = new URL("../", import.meta.url);
const distRoot = new URL("../dist/", import.meta.url);

test("从干净目录构建可执行 ESM 与声明，并通过 conditional exports 导入", async () => {
  await rm(distRoot, { recursive: true, force: true });
  const build = spawnSync("pnpm", ["run", "build"], {
    cwd: packageRoot,
    encoding: "utf8",
  });
  assert.equal(build.status, 0, `${build.stdout}\n${build.stderr}`);

  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );
  assert.deepEqual(packageJson.exports, {
    ".": {
      types: "./dist/index.d.ts",
      import: "./dist/index.js",
      default: "./dist/index.js",
    },
  });

  const built = await import(
    `${new URL("../dist/index.js", import.meta.url).href}?smoke=${Date.now()}`
  );
  assert.equal(typeof built.createApiClient, "function");
  assert.equal(typeof built.ApiClientError, "function");
  assert.equal(typeof built.ApiNetworkError, "function");
  assert.equal(typeof built.ApiProtocolError, "function");
  assert.equal(typeof built.operationRegistry, "object");
  await readFile(new URL("../dist/index.d.ts", import.meta.url), "utf8");
});
