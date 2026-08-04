const ENV_KEY = 'AI_TASK_STORE_RESPONSE_BODY';

export function isAiTaskStoreResponseBodyEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const raw = env[ENV_KEY]?.trim().toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes';
}
