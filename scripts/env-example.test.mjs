import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { parse } from "dotenv";

test(".env.example 提供可启动且仅限本地开发的基础配置", async () => {
  const example = parse(
    await readFile(new URL("../.env.example", import.meta.url), "utf8"),
  );

  assert.ok(
    Buffer.byteLength(example.AUTH_JWT_SECRET ?? "", "utf8") >= 32,
    "AUTH_JWT_SECRET 必须满足 API 至少 32 字节的要求",
  );
  assert.match(
    example.AUTH_JWT_SECRET ?? "",
    /local|development|dev/i,
    "AUTH_JWT_SECRET 必须明确标注仅用于本地开发",
  );
  assert.equal(example.PORT, "3000");
  assert.equal(example.WEB_ORIGIN, "http://localhost:3001");
});
