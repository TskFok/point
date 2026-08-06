"use client";

import type {
  ApiClient,
  ApiComponents,
} from "@point-quest/api-client";
import { Card } from "@point-quest/ui";
import {
  CircleDollarSign,
  Coins,
  LoaderCircle,
  ReceiptText,
  UserRound,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { AsyncError } from "@/components/feedback/async-error";
import { PaginationControls } from "@/components/pagination-controls";
import { browserApiClient } from "@/lib/api/browser-client";
import { getApiErrorMessage } from "@/lib/api/error-message";
import { publishPointBalance } from "@/lib/point-balance-event";

type Schemas = ApiComponents["schemas"];
type User = Schemas["PublicUserDto"];
type Ledger = Schemas["PointLedgerDto"];
type PageMeta = Schemas["PageMetaDto"];
type ProfileApi = Pick<
  ApiClient,
  "getCurrentUser" | "getPointBalance" | "listPointLedger"
>;

const ledgerLabels: Record<Ledger["type"], string> = {
  ANSWER_REWARD: "答题奖励",
  ORDER_REDEEM: "商品兑换",
  ORDER_REFUND: "订单退款",
};

const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "medium",
  timeStyle: "short",
});

export default function ProfilePage({
  api = browserApiClient,
}: {
  api?: ProfileApi;
} = {}) {
  const [user, setUser] = useState<User | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [ledger, setLedger] = useState<Ledger[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const automaticLoadKey = useRef<string | null>(null);
  const latestRequest = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    const requestId = latestRequest.current + 1;
    latestRequest.current = requestId;
    setLoading(true);
    setError(null);
    try {
      const [currentUser, pointBalance, ledgerResponse] = await Promise.all([
        api.getCurrentUser(),
        api.getPointBalance(),
        api.listPointLedger({ page, pageSize: 10 }),
      ]);
      if (!mounted.current || latestRequest.current !== requestId) return;
      setUser(currentUser.user);
      setBalance(pointBalance.balance);
      publishPointBalance(pointBalance.balance);
      setLedger(ledgerResponse.data);
      setMeta(ledgerResponse.meta);
    } catch (loadError) {
      if (!mounted.current || latestRequest.current !== requestId) return;
      setError(getApiErrorMessage(loadError));
    } finally {
      if (mounted.current && latestRequest.current === requestId) {
        setLoading(false);
      }
    }
  }, [api, page]);

  useEffect(() => {
    const loadKey = String(page);
    if (automaticLoadKey.current === loadKey) return;
    automaticLoadKey.current = loadKey;
    void load();
  }, [load, page]);

  return (
    <section className="student-page list-page">
      <div className="list-page__chrome">
        <div className="page-heading">
          <div>
            <p className="page-kicker">个人中心</p>
            <h1>账户与积分流水</h1>
            <p>每一笔答题奖励、兑换和退款都会保留可审计记录。</p>
          </div>
        </div>

        {user && balance !== null ? (
          <>
            <div className="profile-summary">
              <Card className="profile-card" tone="primary">
                <span className="profile-avatar" aria-hidden="true">
                  <UserRound />
                </span>
                <div>
                  <p>学员账户</p>
                  <h2>{user.username}</h2>
                  <span>账号 ID：{user.id}</span>
                </div>
              </Card>
              <Card className="profile-balance" tone="reward">
                <CircleDollarSign aria-hidden="true" />
                <div>
                  <p>可用积分</p>
                  <h2>当前余额 {balance} 积分</h2>
                </div>
              </Card>
            </div>

            <div className="section-heading">
              <div>
                <p className="page-kicker">积分明细</p>
                <h2>最近流水</h2>
              </div>
            </div>
          </>
        ) : null}
      </div>

      {loading ? (
        <Card aria-live="polite" className="page-loading" role="status">
          <LoaderCircle aria-hidden="true" className="spin" />
          正在加载账户信息
        </Card>
      ) : error ? (
        <AsyncError message={error} onRetry={() => void load()} />
      ) : user && balance !== null ? (
        ledger.length === 0 ? (
          <EmptyState
            description="完成首次正确作答后，积分奖励会记录在这里。"
            icon={<ReceiptText />}
            title="还没有积分流水"
          />
        ) : (
          <div className="paginated-panel">
            <div className="paginated-panel__body">
              <Card className="ledger-list">
                {ledger.map((entry) => (
                  <article className="ledger-row" key={entry.id}>
                    <span
                      className={`ledger-row__icon ledger-row__icon--${
                        entry.delta >= 0 ? "income" : "expense"
                      }`}
                    >
                      <Coins aria-hidden="true" />
                    </span>
                    <div>
                      <h3>{ledgerLabels[entry.type]}</h3>
                      <time dateTime={entry.createdAt}>
                        {dateTimeFormatter.format(new Date(entry.createdAt))}
                      </time>
                    </div>
                    <div className="ledger-row__amount">
                      <strong>
                        {entry.delta > 0 ? "+" : ""}
                        {entry.delta}
                      </strong>
                      <span>余额 {entry.balanceAfter}</span>
                    </div>
                  </article>
                ))}
              </Card>
            </div>
            {meta ? (
              <PaginationControls
                disabled={loading}
                onPageChange={setPage}
                page={meta.page}
                totalPages={meta.totalPages}
              />
            ) : null}
          </div>
        )
      ) : null}
    </section>
  );
}
