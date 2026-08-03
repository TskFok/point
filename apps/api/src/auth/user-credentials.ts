export const USERNAME_PATTERN = /^[a-z0-9_]{3,32}$/;
export const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d).{10,}$/;

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function assertValidBootstrapCredentials(
  username: string,
  password: string,
): string {
  const normalized = normalizeUsername(username);
  if (!USERNAME_PATTERN.test(normalized) || !PASSWORD_PATTERN.test(password)) {
    throw new Error('BOOTSTRAP_ADMIN 用户名或密码不符合要求');
  }
  return normalized;
}
