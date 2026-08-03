import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const makefilePath = fileURLToPath(new URL("../Makefile", import.meta.url));

test("Makefile 提供跨平台 Docker 构建入口", async () => {
  const makefile = await readFile(makefilePath, "utf8");

  assert.match(makefile, /^IMAGE_REGISTRY\s*\?=/m);
  assert.match(makefile, /^IMAGE_TAG\s*\?=/m);
  assert.match(makefile, /^help:/m);
  assert.match(makefile, /^build:/m);
  assert.match(makefile, /^build-amd64:/m);
  assert.match(makefile, /^build-arm64:/m);
  assert.match(makefile, /linux\/amd64/);
  assert.match(makefile, /linux\/arm64/);
  assert.match(makefile, /point-quest-/);
  assert.match(makefile, /--target/);
  assert.match(makefile, /docker buildx build/);
});
