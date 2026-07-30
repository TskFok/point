export type E2eCleanupSteps = {
  cleanupDatabase: () => Promise<void>;
  closeApplication: () => Promise<void>;
  removeUploadRoot: () => Promise<void>;
  restoreEnvironment: () => void;
};

export async function disposeE2eResources(
  steps: E2eCleanupSteps,
): Promise<void> {
  const failures: unknown[] = [];
  try {
    await steps.cleanupDatabase();
  } catch (error) {
    failures.push(error);
  } finally {
    try {
      await steps.closeApplication();
    } catch (error) {
      failures.push(error);
    } finally {
      try {
        await steps.removeUploadRoot();
      } catch (error) {
        failures.push(error);
      } finally {
        try {
          steps.restoreEnvironment();
        } catch (error) {
          failures.push(error);
        }
      }
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, 'E2E 资源清理失败');
  }
}
