import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { parse } from "dotenv";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const productionEnvUrl = new URL(
  "../.env.production.example",
  import.meta.url,
);
const productionComposeUrl = new URL("../compose.prod.yaml", import.meta.url);

async function readProductionEnvironment() {
  return parse(await readFile(productionEnvUrl, "utf8"));
}

function readProductionCompose() {
  return JSON.parse(
    execFileSync(
      "docker",
      [
        "compose",
        "--env-file",
        fileURLToPath(productionEnvUrl),
        "-f",
        fileURLToPath(productionComposeUrl),
        "config",
        "--format",
        "json",
      ],
      { cwd: repositoryRoot, encoding: "utf8" },
    ),
  );
}

test("生产环境模板要求强密钥和容器内数据库地址", async () => {
  const environment = await readProductionEnvironment();

  assert.ok(
    Buffer.byteLength(environment.AUTH_JWT_SECRET ?? "", "utf8") >= 32,
  );
  assert.match(environment.AUTH_JWT_SECRET ?? "", /replace|example/i);
  assert.equal(new URL(environment.DATABASE_URL).hostname, "db");
  assert.match(environment.WEB_ORIGIN ?? "", /^https:\/\//);
});

test("生产 Compose 只把 Web 发布到宿主机回环地址", () => {
  const compose = readProductionCompose();
  assert.deepEqual(Object.keys(compose.services).sort(), [
    "api",
    "db",
    "migrate",
    "web",
  ]);
  assert.equal(compose.services.db.ports, undefined);
  assert.equal(compose.services.api.ports, undefined);
  assert.deepEqual(compose.services.web.ports, [
    {
      host_ip: "127.0.0.1",
      mode: "ingress",
      protocol: "tcp",
      published: "3001",
      target: 3001,
    },
  ]);
});

test("生产服务按数据库、迁移、API、Web 顺序启动", () => {
  const { services } = readProductionCompose();
  assert.equal(services.migrate.depends_on.db.condition, "service_healthy");
  assert.equal(
    services.api.depends_on.migrate.condition,
    "service_completed_successfully",
  );
  assert.equal(services.web.depends_on.api.condition, "service_healthy");
  assert.equal(services.migrate.restart, "no");
  assert.equal(services.api.environment.PRODUCT_UPLOAD_ROOT, "/app/uploads");
  assert.equal(
    services.web.environment.API_SERVER_BASE_URL,
    "http://api:3000/api/v1",
  );
});

test("生产 Compose 隔离数据卷并启用基础运行时加固", () => {
  const compose = readProductionCompose();
  const apiUpload = compose.services.api.volumes.find(
    (volume) => volume.target === "/app/uploads",
  );

  assert.equal(apiUpload.source, "point-upload-data");
  assert.ok(
    compose.services.db.volumes.some(
      (volume) => volume.source === "point-postgres-data",
    ),
  );
  assert.deepEqual(compose.services.api.cap_drop, ["ALL"]);
  assert.deepEqual(compose.services.web.cap_drop, ["ALL"]);
  assert.ok(
    compose.services.api.security_opt.includes("no-new-privileges:true"),
  );
  assert.ok(
    compose.services.web.security_opt.includes("no-new-privileges:true"),
  );
});
