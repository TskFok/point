import { spawn } from "node:child_process";
import { constants } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { config as dotenvConfig } from "dotenv";

const devArguments = [
  "--parallel",
  "--filter",
  "@point-quest/api",
  "--filter",
  "@point-quest/web",
  "dev",
];

export function loadRootEnvironment({
  environment = process.env,
  loadDotenv = dotenvConfig,
  repoRoot,
}) {
  const result = loadDotenv({
    override: false,
    path: join(repoRoot, ".env"),
    processEnv: environment,
    quiet: true,
  });
  if (result.error) {
    throw new Error(`无法加载 ${join(repoRoot, ".env")}`, {
      cause: result.error,
    });
  }
  return environment;
}

export function startDevProcess({
  environment,
  repoRoot,
  runtimeProcess = process,
  spawnProcess = spawn,
}) {
  const child = spawnProcess("pnpm", devArguments, {
    cwd: repoRoot,
    env: environment,
    stdio: "inherit",
  });
  const signalHandlers = new Map(
    ["SIGINT", "SIGTERM"].map((signal) => [
      signal,
      () => {
        child.kill(signal);
      },
    ]),
  );

  const removeSignalHandlers = () => {
    for (const [signal, handler] of signalHandlers) {
      runtimeProcess.off(signal, handler);
    }
  };

  for (const [signal, handler] of signalHandlers) {
    runtimeProcess.on(signal, handler);
  }

  child.once("error", (error) => {
    removeSignalHandlers();
    runtimeProcess.exitCode = 1;
    runtimeProcess.stderr?.write(`开发服务启动失败：${error.message}\n`);
  });
  child.once("exit", (code, signal) => {
    removeSignalHandlers();
    runtimeProcess.exitCode = code ?? 128 + (constants.signals[signal] ?? 1);
  });

  return child;
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const isEntrypoint =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntrypoint) {
  try {
    const environment = loadRootEnvironment({ repoRoot });
    startDevProcess({ environment, repoRoot });
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
