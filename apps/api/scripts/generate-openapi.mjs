import { NestFactory } from "@nestjs/core";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
process.env.TS_NODE_PROJECT = fileURLToPath(
  new URL("../tsconfig.json", import.meta.url),
);
require("ts-node/register");
const { AppModule } = require("../src/app.module.ts");
const { configureApiApp } = require("../src/common/http/configure-api-app.ts");
const { createOpenApiDocument } = require(
  "../src/openapi/create-openapi-document.ts",
);

function sortObject(value) {
  if (Array.isArray(value)) {
    return value.map(sortObject);
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, child]) => [key, sortObject(child)]),
  );
}

const app = await NestFactory.create(AppModule, { logger: false });
try {
  configureApiApp(app, "http://localhost:3001");
  const document = createOpenApiDocument(app);
  const outputPath = fileURLToPath(
    new URL("../../../openapi/openapi.json", import.meta.url),
  );
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    `${JSON.stringify(sortObject(document), null, 2)}\n`,
    "utf8",
  );
} finally {
  await app.close();
}
