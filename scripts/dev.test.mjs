import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import { loadRootEnvironment, startDevProcess } from "./dev.mjs";

test("从仓库根 .env 加载环境且不覆盖调用方已有值", () => {
  const environment = { PORT: "4100" };
  let receivedOptions;

  const loaded = loadRootEnvironment({
    environment,
    loadDotenv: (options) => {
      receivedOptions = options;
      options.processEnv.WEB_ORIGIN = "http://localhost:3001";
      return { parsed: { WEB_ORIGIN: "http://localhost:3001" } };
    },
    repoRoot: "/workspace/point",
  });

  assert.equal(receivedOptions.path, "/workspace/point/.env");
  assert.equal(receivedOptions.processEnv, environment);
  assert.equal(receivedOptions.override, false);
  assert.equal(receivedOptions.quiet, true);
  assert.equal(loaded, environment);
  assert.equal(loaded.PORT, "4100");
  assert.equal(loaded.WEB_ORIGIN, "http://localhost:3001");
});

test("启动两个工作区并转发信号和退出码", () => {
  const runtimeProcess = new EventEmitter();
  runtimeProcess.exitCode = undefined;
  const child = new EventEmitter();
  const forwardedSignals = [];
  child.kill = (signal) => {
    forwardedSignals.push(signal);
    return true;
  };

  let spawnCall;
  const environment = { PORT: "3000" };
  startDevProcess({
    environment,
    repoRoot: "/workspace/point",
    runtimeProcess,
    spawnProcess: (command, args, options) => {
      spawnCall = { args, command, options };
      return child;
    },
  });

  assert.deepEqual(spawnCall, {
    args: [
      "--parallel",
      "--filter",
      "@point-quest/api",
      "--filter",
      "@point-quest/web",
      "dev",
    ],
    command: "pnpm",
    options: {
      cwd: "/workspace/point",
      env: environment,
      stdio: "inherit",
    },
  });

  runtimeProcess.emit("SIGINT");
  assert.deepEqual(forwardedSignals, ["SIGINT"]);

  child.emit("exit", 7, null);
  assert.equal(runtimeProcess.exitCode, 7);
  assert.equal(runtimeProcess.listenerCount("SIGINT"), 0);
  assert.equal(runtimeProcess.listenerCount("SIGTERM"), 0);
});

test("子进程被信号终止时返回约定退出码", () => {
  const runtimeProcess = new EventEmitter();
  runtimeProcess.exitCode = undefined;
  const child = new EventEmitter();
  child.kill = () => true;

  startDevProcess({
    environment: {},
    repoRoot: "/workspace/point",
    runtimeProcess,
    spawnProcess: () => child,
  });
  child.emit("exit", null, "SIGTERM");

  assert.equal(runtimeProcess.exitCode, 143);
});
