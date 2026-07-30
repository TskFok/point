import { NestFactory } from '@nestjs/core';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { AppModule } from '../src/app.module';
import { configureApiApp } from '../src/common/http/configure-api-app';
import { createOpenApiDocument } from '../src/openapi/create-openapi-document';

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortObject);
  }
  if (typeof value !== 'object' || value === null) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, child]) => [key, sortObject(child)]),
  );
}

async function generate(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false });
  try {
    configureApiApp(app, 'http://localhost:3001');
    const document = createOpenApiDocument(app);
    const outputPath = resolve(process.cwd(), '../../openapi/openapi.json');
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(
      outputPath,
      `${JSON.stringify(sortObject(document), null, 2)}\n`,
      'utf8',
    );
  } finally {
    await app.close();
  }
}

void generate();
