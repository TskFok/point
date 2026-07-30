export async function runWithRecovery({ execute, recover }) {
  let coreFailed = false;
  let coreError;
  let result;
  try {
    result = await execute();
  } catch (error) {
    coreFailed = true;
    coreError = error;
  }

  const recoveryResults = await Promise.allSettled(
    recover.map((operation) => Promise.resolve().then(operation)),
  );
  const recoveryErrors = recoveryResults.flatMap((recoveryResult) =>
    recoveryResult.status === "rejected" ? [recoveryResult.reason] : [],
  );

  if (coreFailed && recoveryErrors.length === 0) {
    throw coreError;
  }
  if (coreFailed) {
    throw new AggregateError(
      [coreError, ...recoveryErrors],
      "生成校验失败，且恢复或清理也失败",
      { cause: coreError },
    );
  }
  if (recoveryErrors.length > 0) {
    throw new AggregateError(recoveryErrors, "恢复生成产物或清理临时目录失败");
  }
  return result;
}
