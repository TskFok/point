export type RuntimeConfig = {
  jwtSecret: string;
  webOrigin: string;
};

export function readJwtSecret(): string {
  const secret = process.env.AUTH_JWT_SECRET;
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('AUTH_JWT_SECRET 必须配置为至少 32 字节的密钥');
  }
  return secret;
}

function readWebOrigin(): string {
  const configuredOrigin = process.env.WEB_ORIGIN?.trim();
  if (!configuredOrigin || configuredOrigin === '*') {
    throw new Error('WEB_ORIGIN 必须配置为精确的 Web Origin');
  }

  let url: URL;
  try {
    url = new URL(configuredOrigin);
  } catch {
    throw new Error('WEB_ORIGIN 必须是有效的 HTTP(S) Origin');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.origin !== configuredOrigin
  ) {
    throw new Error('WEB_ORIGIN 必须是精确且不含路径的 HTTP(S) Origin');
  }
  return configuredOrigin;
}

export function readRuntimeConfig(): RuntimeConfig {
  return {
    jwtSecret: readJwtSecret(),
    webOrigin: readWebOrigin(),
  };
}
