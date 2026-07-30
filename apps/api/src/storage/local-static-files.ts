import { type INestApplication } from '@nestjs/common';
import express from 'express';
import { resolveProductUploadRoot } from './local-storage.provider';

export function configureLocalStaticFiles(
  app: INestApplication,
  configuredRoot?: string,
): void {
  app.use(
    '/uploads',
    express.static(resolveProductUploadRoot(configuredRoot), {
      dotfiles: 'deny',
      index: false,
      redirect: false,
      setHeaders: (response) => {
        response.setHeader('X-Content-Type-Options', 'nosniff');
      },
    }),
  );
}
