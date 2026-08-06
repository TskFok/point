"use client";

import type { ApiClient, ApiComponents } from "@point-quest/api-client";
import { Card } from "@point-quest/ui";
import { Clock3, Gauge, History, LoaderCircle, UserRound } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  AdminPageHeading,
  AdminPageHeadingStat,
} from "@/components/admin/admin-page-heading";
import { PointConfigForm } from "@/components/admin/point-config-form";
import { Pagination } from "@/components/data/pagination";
import { EmptyState } from "@/components/empty-state";
import { AsyncError } from "@/components/feedback/async-error";
import { browserApiClient } from "@/lib/api/browser-client";
import { getApiErrorMessage } from "@/lib/api/error-message";

type Schemas = ApiComponents["schemas"];
type PointConfig = Schemas["PointConfigDto"];
type PageMeta = Schemas["PageMetaDto"];
type PointsApi = Pick<
  ApiClient,
  | "getAdminPointConfig"
  | "listAdminPointConfigHistory"
  | "updateAdminPointConfig"
>;

const formatter = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Shanghai",
});

function readPage(): number {
  if (typeof window === "undefined") return 1;
  const parsedPage = Number(
    new URLSearchParams(window.location.search).get("page"),
  );
  return Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
}

function writePage(page: number) {
  if (typeof window === "undefined") return;
  const search = page > 1 ? `?page=${page}` : "";
  window.history.replaceState(null, "", `${window.location.pathname}${search}`);
}

export default function AdminPointsPage({
  api = browserApiClient,
}: {
  api?: PointsApi;
} = {}) {
  const [current, setCurrent] = useState<PointConfig | null>(null);
  const [history, setHistory] = useState<PointConfig[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [page, setPage] = useState(readPage);
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
      const [config, response] = await Promise.all([
        api.getAdminPointConfig(),
        api.listAdminPointConfigHistory({ page, pageSize: 20 }),
      ]);
      if (!mounted.current || latestRequest.current !== requestId) return;
      setCurrent(config);
      setHistory(response.data);
      setMeta(response.meta);
    } catch (caught) {
      if (!mounted.current || latestRequest.current !== requestId) return;
      setError(getApiErrorMessage(caught));
    } finally {
      if (mounted.current && latestRequest.current === requestId) {
        setLoading(false);
      }
    }
  }, [api, page]);

  useEffect(() => {
    const key = String(page);
    if (automaticLoadKey.current === key) return;
    automaticLoadKey.current = key;
    writePage(page);
    void load();
  }, [load, page]);

  return (
    <section className="admin-page list-page">
      <div className="list-page__chrome">
        <AdminPageHeading
          description="每次保存都会追加一条历史记录，便于追踪奖励规则变化。"
          kicker="学习奖励配置"
          title="积分倍率"
        >
          <AdminPageHeadingStat
            icon={<Gauge aria-hidden="true" />}
            label="当前倍率"
            value={current ? `${current.multiplier}×` : "—"}
          />
        </AdminPageHeading>

        {current ? (
          <>
            <PointConfigForm
              api={api}
              currentMultiplier={current.multiplier}
              onSaved={(config) => {
                setCurrent(config);
                automaticLoadKey.current = null;
                if (page === 1) {
                  void load();
                } else {
                  setPage(1);
                }
              }}
            />

            <div className="admin-section-heading">
              <div>
                <p className="page-kicker">审计历史</p>
                <h2>倍率变更记录</h2>
              </div>
              <History aria-hidden="true" />
            </div>
          </>
        ) : null}
      </div>

      {loading && !current ? (
        <Card aria-live="polite" className="page-loading" role="status">
          <LoaderCircle aria-hidden="true" className="spin" />
          正在加载积分配置
        </Card>
      ) : error ? (
        <AsyncError message={error} onRetry={() => void load()} />
      ) : current ? (
        <>
          {loading ? (
            <p
              aria-label="正在加载倍率历史"
              className="page-loading-inline"
              role="status"
            >
              <LoaderCircle aria-hidden="true" className="spin" />
              正在加载倍率历史
            </p>
          ) : null}
          {history.length === 0 ? (
            <EmptyState
              description="当前使用默认 1× 倍率，保存一次配置后会生成历史。"
              icon={<History />}
              title="还没有倍率历史"
            />
          ) : (
            <div className="paginated-panel">
              <div className="paginated-panel__body">
                <div className="config-history-list">
                  {history.map((config) => (
                    <Card className="config-history-item" key={config.id}>
                      <strong>{config.multiplier}×</strong>
                      <div>
                        <span>
                          <UserRound aria-hidden="true" />
                          {config.updater?.username ?? "系统默认"}
                        </span>
                        {config.createdAt ? (
                          <time dateTime={config.createdAt}>
                            <Clock3 aria-hidden="true" />
                            {formatter.format(new Date(config.createdAt))}
                          </time>
                        ) : null}
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
              {meta ? (
                <Pagination
                  disabled={loading}
                  onPageChange={setPage}
                  page={meta.page}
                  totalPages={meta.totalPages}
                />
              ) : null}
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}
