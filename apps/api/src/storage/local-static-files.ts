import { type INestApplication } from '@nestjs/common';
import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import { lstat, realpath } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import {
  type PreparedProductUploadRoot,
  prepareProductUploadRoot,
  resolveProductUploadRoot,
} from './local-storage.provider';

const publicProductPathPattern =
  /^\/products\/([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|webp))$/;

async function isSafePreparedProductFile(
  prepared: PreparedProductUploadRoot,
  requestPath: string,
): Promise<boolean> {
  const match = publicProductPathPattern.exec(requestPath);
  if (!match) {
    return false;
  }
  const candidate = join(prepared.productDirectory, match[1]);
  try {
    const fileStat = await lstat(candidate);
    if (
      fileStat.isSymbolicLink() ||
      !fileStat.isFile() ||
      fileStat.nlink !== 1
    ) {
      return false;
    }
    const canonicalFile = await realpath(candidate);
    const fromProductDirectory = relative(
      prepared.productDirectory,
      canonicalFile,
    );
    return (
      fromProductDirectory.length > 0 &&
      fromProductDirectory !== '..' &&
      !fromProductDirectory.startsWith(`..${sep}`) &&
      !fromProductDirectory.includes(sep)
    );
  } catch {
    return false;
  }
}

export async function isSafeProductUploadFile(
  configuredRoot: string,
  requestPath: string,
): Promise<boolean> {
  try {
    const resolvedRoot = resolveProductUploadRoot(configuredRoot);
    const rootStat = await lstat(resolvedRoot);
    if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
      return false;
    }
    const productDirectory = join(resolvedRoot, 'products');
    const productStat = await lstat(productDirectory);
    if (productStat.isSymbolicLink() || !productStat.isDirectory()) {
      return false;
    }
    const canonicalRoot = await realpath(resolvedRoot);
    const canonicalProductDirectory = await realpath(productDirectory);
    if (relative(canonicalRoot, canonicalProductDirectory) !== 'products') {
      return false;
    }
    return isSafePreparedProductFile(
      {
        uploadRoot: canonicalRoot,
        productDirectory: canonicalProductDirectory,
      },
      requestPath,
    );
  } catch {
    return false;
  }
}

export async function configureLocalStaticFiles(
  app: INestApplication,
  configuredRoot?: string,
): Promise<void> {
  const prepared = await prepareProductUploadRoot(configuredRoot);
  const guard = async (
    request: Request,
    response: Response,
    next: NextFunction,
  ) => {
    if (await isSafePreparedProductFile(prepared, request.path)) {
      next();
      return;
    }
    response.status(404).end();
  };

  app.use(
    '/uploads',
    guard,
    express.static(prepared.uploadRoot, {
      dotfiles: 'deny',
      index: false,
      redirect: false,
      setHeaders: (response) => {
        response.setHeader('X-Content-Type-Options', 'nosniff');
      },
    }),
  );
}
