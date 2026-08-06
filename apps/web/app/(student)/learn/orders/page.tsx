"use client";

import type {
  ApiClient,
  ApiComponents,
} from "@point-quest/api-client";
import { Card } from "@point-quest/ui";
import { ClipboardList, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { AsyncError } from "@/components/feedback/async-error";
import { OrderCard } from "@/components/orders/order-card";
import { PaginationControls } from "@/components/pagination-controls";
import { browserApiClient } from "@/lib/api/browser-client";
import { getApiErrorMessage } from "@/lib/api/error-message";

type Schemas = ApiComponents["schemas"];
type Order = Schemas["OrderDto"];
type PageMeta = Schemas["PageMetaDto"];
type OrdersApi = Pick<ApiClient, "listOrders">;

export default function OrdersPage({
  api = browserApiClient,
}: {
  api?: OrdersApi;
} = {}) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const automaticLoadKey = useRef<string | null>(null);
  const latestLoadRequest = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    const requestId = latestLoadRequest.current + 1;
    latestLoadRequest.current = requestId;
    setLoading(true);
    setError(null);
    try {
      const response = await api.listOrders({ page, pageSize: 12 });
      if (!mounted.current || latestLoadRequest.current !== requestId) return;
      setOrders(response.data);
      setMeta(response.meta);
    } catch (loadError) {
      if (!mounted.current || latestLoadRequest.current !== requestId) return;
      setError(getApiErrorMessage(loadError));
    } finally {
      if (mounted.current && latestLoadRequest.current === requestId) {
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
    <section className="student-page">
      <div className="page-heading">
        <div>
          <p className="page-kicker">我的兑换</p>
          <h1>订单与领取进度</h1>
          <p>订单会保留兑换时的商品、图片和积分快照。</p>
        </div>
      </div>

      {loading ? (
        <Card aria-live="polite" className="page-loading" role="status">
          <LoaderCircle aria-hidden="true" className="spin" />
          正在加载订单
        </Card>
      ) : error ? (
        <AsyncError message={error} onRetry={() => void load()} />
      ) : orders.length === 0 ? (
        <EmptyState
          action={
            <Link className="pq-button pq-button--primary" href="/learn/store">
              去积分商城看看
            </Link>
          }
          description="兑换商品后，订单和领取状态会出现在这里。"
          icon={<ClipboardList />}
          title="还没有兑换订单"
        />
      ) : (
        <div className="paginated-panel">
          <div className="paginated-panel__body">
            <div className="order-list">
              {orders.map((order) => (
                <OrderCard key={order.id} order={order} />
              ))}
            </div>
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
      )}
    </section>
  );
}
