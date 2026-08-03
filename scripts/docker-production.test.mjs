import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { parse } from "dotenv";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const productionEnvUrl = new URL("../.env.docker.example", import.meta.url);
const productionComposeUrl = new URL("../docker-compose.yml", import.meta.url);

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

test("生产环境模板要求镜像坐标、强密钥和容器内数据库地址", async () => {
  const environment = await readProductionEnvironment();

  assert.ok(environment.IMAGE_REGISTRY);
  assert.doesNotMatch(environment.IMAGE_REGISTRY, /\/$/);
  assert.ok(environment.IMAGE_TAG);
  assert.ok(Buffer.byteLength(environment.AUTH_JWT_SECRET ?? "", "utf8") >= 32);
  assert.match(environment.AUTH_JWT_SECRET ?? "", /replace|example/i);
  assert.equal(new URL(environment.DATABASE_URL).hostname, "db");
  assert.match(environment.WEB_ORIGIN ?? "", /^https:\/\//);
  assert.equal(environment.BOOTSTRAP_ADMIN_USERNAME, "admin");
  assert.ok(
    Buffer.byteLength(environment.BOOTSTRAP_ADMIN_PASSWORD ?? "", "utf8") >= 10,
  );
  assert.match(environment.BOOTSTRAP_ADMIN_PASSWORD ?? "", /[A-Za-z]/);
  assert.match(environment.BOOTSTRAP_ADMIN_PASSWORD ?? "", /\d/);
  assert.ok(environment.AI_CONFIG_ENCRYPTION_KEY);
  assert.equal(
    Buffer.from(environment.AI_CONFIG_ENCRYPTION_KEY, "base64").length,
    32,
  );
  assert.match(
    Buffer.from(environment.AI_CONFIG_ENCRYPTION_KEY, "base64").toString(
      "utf8",
    ),
    /replace|example/i,
  );
});

test("生产 Compose 向 API 注入 bootstrap 管理员变量", async () => {
  const environment = await readProductionEnvironment();
  const compose = readProductionCompose();

  assert.equal(
    compose.services.api.environment.BOOTSTRAP_ADMIN_USERNAME,
    environment.BOOTSTRAP_ADMIN_USERNAME,
  );
  assert.equal(
    compose.services.api.environment.BOOTSTRAP_ADMIN_PASSWORD,
    environment.BOOTSTRAP_ADMIN_PASSWORD,
  );
  assert.equal(
    compose.services.api.environment.AI_CONFIG_ENCRYPTION_KEY,
    environment.AI_CONFIG_ENCRYPTION_KEY,
  );
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

test("生产应用服务使用预构建镜像且不包含 build", async () => {
  const environment = await readProductionEnvironment();
  const compose = readProductionCompose();

  for (const name of ["migrate", "api", "web"]) {
    assert.equal(compose.services[name].build, undefined);
    assert.equal(
      compose.services[name].image,
      `${environment.IMAGE_REGISTRY}/point-quest-${name}:${environment.IMAGE_TAG}`,
    );
  }
});
