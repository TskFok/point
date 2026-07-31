export const POINT_BALANCE_EVENT = "point-quest:balance-updated";

type PointBalanceEventDetail = {
  balance: number;
};

export function publishPointBalance(balance: number) {
  if (
    typeof window === "undefined" ||
    !Number.isSafeInteger(balance) ||
    balance < 0
  ) {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<PointBalanceEventDetail>(POINT_BALANCE_EVENT, {
      detail: { balance },
    }),
  );
}

export function pointBalanceFromEvent(event: Event) {
  const detail = (event as CustomEvent<unknown>).detail;
  if (
    typeof detail !== "object" ||
    detail === null ||
    !("balance" in detail)
  ) {
    return null;
  }

  const value = detail.balance;
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
    ? value
    : null;
}
