"use client";

import type { ApiClient, ApiComponents } from "@point-quest/api-client";
import { Button, Card } from "@point-quest/ui";
import {
  Ban,
  CircleCheck,
  ClipboardList,
  Clock3,
  Filter,
  LoaderCircle,
  Search,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  OrderStatusDialog,
  type OrderStatusAction,
} from "@/components/admin/order-status-dialog";
import { Pagination } from "@/components/data/pagination";
import { StatusFilter } from "@/components/data/status-filter";
import { EmptyState } from "@/components/empty-state";
import { AsyncError } from "@/components/feedback/async-error";
import { browserApiClient } from "@/lib/api/browser-client";
import { getApiErrorMessage } from "@/lib/api/error-message";

type Schemas = ApiComponents["schemas"];
type AdminOrder = Schemas["AdminOrderDto"];
type PageMeta = Schemas["PageMetaDto"];
type AdminOrdersApi = Pick<
  ApiClient,
  "cancelAdminOrder" | "completeAdminOrder" | "listAdminOrders"
>;

type FilterState = {
  orderNo: string;
  username: string;
  status: string;
  createdFrom: string;
  createdTo: string;
};

const emptyFilters: FilterState = {
  orderNo: "",
  username: "",
  status: "",
  createdFrom: "",
  createdTo: "",
};

const statusPresentation = {
  CANCELLED: { Icon: Ban, label: "已取消" },
  COMPLETED: { Icon: CircleCheck, label: "已完成" },
  PENDING_PICKUP: { Icon: Clock3, label: "待领取" },
} satisfies Record<AdminOrder["status"], { Icon: typeof Ban; label: string }>;

const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Shanghai",
});

function readUrlState(): { filters: FilterState; page: number } {
  if (typeof window === "undefined") {
    return { filters: emptyFilters, page: 1 };
  }
  const params = new URLSearchParams(window.location.search);
  const page = Number(params.get("page"));
  return {
    page: Number.isInteger(page) && page > 0 ? page : 1,
    filters: {
      orderNo: params.get("orderNo") ?? "",
      username: params.get("username") ?? "",
      status: params.get("status") ?? "",
      createdFrom: params.get("createdFrom") ?? "",
      createdTo: params.get("createdTo") ?? "",
    },
  };
}

function writeUrl(filters: FilterState, page: number) {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  if (page > 1) params.set("page", String(page));
  const search = params.toString();
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${search ? `?${search}` : ""}`,
  );
}

function toApiQuery(filters: FilterState, page: number) {
  return {
    page,
    pageSize: 20,
    ...(filters.orderNo.trim() ? { orderNo: filters.orderNo.trim() } : {}),
    ...(filters.username.trim() ? { username: filters.username.trim() } : {}),
    ...(filters.status
      ? {
          status: filters.status as AdminOrder["status"],
        }
      : {}),
    ...(filters.createdFrom
      ? { createdFrom: `${filters.createdFrom}T00:00:00.000+08:00` }
      : {}),
    ...(filters.createdTo
      ? { createdTo: `${filters.createdTo}T23:59:59.999+08:00` }
      : {}),
  };
}

type ActiveDialog = {
  action: OrderStatusAction;
  order: AdminOrder;
};

export default function AdminOrdersPage({
  api = browserApiClient,
}: {
  api?: AdminOrdersApi;
} = {}) {
  const [initial] = useState(readUrlState);
  const [filters, setFilters] = useState(initial.filters);
  const [appliedFilters, setAppliedFilters] = useState(initial.filters);
  const [page, setPage] = useState(initial.page);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filterError, setFilterError] = useState<string | null>(null);
  const [activeDialog, setActiveDialog] = useState<ActiveDialog | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const automaticLoadKey = useRef<string | null>(null);
  const latestRequest = useRef(0);
  const fallbackFocusRef = useRef<HTMLDivElement>(null);
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
    setLoadError(null);
    try {
      const response = await api.listAdminOrders(
        toApiQuery(appliedFilters, page),
      );
      if (!mounted.current || latestRequest.current !== requestId) return;
      const lastPage = Math.max(1, response.meta.totalPages);
      if (page > lastPage) {
        setPage(lastPage);
        return;
      }
      setOrders(response.data);
      setMeta(response.meta);
    } catch (error) {
      if (!mounted.current || latestRequest.current !== requestId) return;
      setLoadError(getApiErrorMessage(error));
    } finally {
      if (mounted.current && latestRequest.current === requestId) {
        setLoading(false);
      }
    }
  }, [api, appliedFilters, page]);

  useEffect(() => {
    const loadKey = JSON.stringify({ appliedFilters, page });
    if (automaticLoadKey.current === loadKey) return;
    automaticLoadKey.current = loadKey;
    writeUrl(appliedFilters, page);
    void load();
  }, [appliedFilters, load, page]);

  function applyFilters() {
    if (
      filters.createdFrom &&
      filters.createdTo &&
      filters.createdFrom > filters.createdTo
    ) {
      setFilterError("开始日期不能晚于结束日期");
      return;
    }
    setFilterError(null);
    setPage(1);
    setAppliedFilters({ ...filters });
  }

  async function confirmAction() {
    if (!activeDialog || actionPending) return;
    const current = activeDialog;
    setActionPending(true);
    setActionError(null);
    try {
      if (current.action === "cancel") {
        await api.cancelAdminOrder(current.order.id);
      } else {
        await api.completeAdminOrder(current.order.id);
      }
      setSuccessMessage(
        current.action === "cancel"
          ? "订单已取消，积分与库存已退回"
          : "订单已完成，可交付商品",
      );
      await load();
      setActiveDialog(null);
    } catch (error) {
      setActionError(getApiErrorMessage(error));
    } finally {
      setActionPending(false);
    }
  }

  return (
    <section className="admin-page list-page">
      <div className="list-page__chrome">
        <div
          className="admin-filter-focus-target"
          ref={fallbackFocusRef}
          tabIndex={-1}
        >
          <Card className="admin-filter-card">
            <form
              className="admin-filter-grid admin-filter-grid--orders"
              onSubmit={(event) => {
                event.preventDefault();
                applyFilters();
              }}
            >
              <label className="admin-field">
                <span>订单号</span>
                <div className="input-with-icon">
                  <Search aria-hidden="true" />
                  <input
                    onChange={(event) =>
                      setFilters((current) => ({
                        ...current,
                        orderNo: event.target.value,
                      }))
                    }
                    placeholder="例如 PQ-2026"
                    value={filters.orderNo}
                  />
                </div>
              </label>
              <label className="admin-field">
                <span>用户名</span>
                <input
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      username: event.target.value,
                    }))
                  }
                  placeholder="输入学员用户名"
                  value={filters.username}
                />
              </label>
              <StatusFilter
                label="订单状态"
                onChange={(status) =>
                  setFilters((current) => ({ ...current, status }))
                }
                options={[
                  { label: "待领取", value: "PENDING_PICKUP" },
                  { label: "已完成", value: "COMPLETED" },
                  { label: "已取消", value: "CANCELLED" },
                ]}
                value={filters.status}
              />
              <label className="admin-field">
                <span>开始日期</span>
                <input
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      createdFrom: event.target.value,
                    }))
                  }
                  type="date"
                  value={filters.createdFrom}
                />
              </label>
              <label className="admin-field">
                <span>结束日期</span>
                <input
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      createdTo: event.target.value,
                    }))
                  }
                  type="date"
                  value={filters.createdTo}
                />
              </label>
              <Button disabled={loading} type="submit">
                <Filter aria-hidden="true" />
                应用筛选
              </Button>
            </form>
            {filterError ? (
              <p className="admin-form__errors" role="alert">
                {filterError}
              </p>
            ) : null}
          </Card>
        </div>

        {successMessage ? (
          <p className="success-banner" role="status">
            <CircleCheck aria-hidden="true" />
            {successMessage}
          </p>
        ) : null}
      </div>

      {loading ? (
        <Card aria-live="polite" className="page-loading" role="status">
          <LoaderCircle aria-hidden="true" className="spin" />
          正在加载订单
        </Card>
      ) : loadError ? (
        <AsyncError message={loadError} onRetry={() => void load()} />
      ) : orders.length === 0 ? (
        <EmptyState
          description="当前筛选条件下没有订单，可以调整条件后重新查找。"
          icon={<ClipboardList />}
          title="没有匹配的订单"
        />
      ) : (
        <div className="paginated-panel">
          <div className="paginated-panel__body">
            <div className="admin-table-wrap">
              <table className="admin-table">
                <caption className="sr-only">管理员订单列表</caption>
                <thead>
                  <tr>
                    <th>订单与学员</th>
                    <th>商品</th>
                    <th>花费</th>
                    <th>创建时间</th>
                    <th>状态</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => {
                    const status = statusPresentation[order.status];
                    const StatusIcon = status.Icon;
                    return (
                      <tr key={order.id}>
                        <td data-label="订单与学员">
                          <strong>{order.orderNo}</strong>
                          <small>{order.user.username}</small>
                        </td>
                        <td data-label="商品">{order.productNameSnapshot}</td>
                        <td data-label="花费">{order.pointsCostSnapshot} 积分</td>
                        <td data-label="创建时间">
                          <time dateTime={order.createdAt}>
                            {dateTimeFormatter.format(new Date(order.createdAt))}
                          </time>
                        </td>
                        <td data-label="状态">
                          <span
                            className={`admin-status admin-status--${order.status.toLowerCase()}`}
                          >
                            <StatusIcon
                              aria-label={`${status.label}状态图标`}
                              role="img"
                            />
                            {status.label}
                          </span>
                        </td>
                        <td data-label="操作">
                          {order.status === "PENDING_PICKUP" ? (
                            <div className="admin-table__actions">
                              <Button
                                onClick={() => {
                                  setSuccessMessage(null);
                                  setActionError(null);
                                  setActiveDialog({
                                    action: "complete",
                                    order,
                                  });
                                }}
                              >
                                <CircleCheck aria-hidden="true" />
                                完成订单
                              </Button>
                              <Button
                                onClick={() => {
                                  setSuccessMessage(null);
                                  setActionError(null);
                                  setActiveDialog({
                                    action: "cancel",
                                    order,
                                  });
                                }}
                                variant="danger"
                              >
                                <Ban aria-hidden="true" />
                                取消订单
                              </Button>
                            </div>
                          ) : (
                            <span className="admin-table__muted">无需操作</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
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

      {activeDialog ? (
        <OrderStatusDialog
          action={activeDialog.action}
          error={actionError}
          fallbackFocusRef={fallbackFocusRef}
          onCancel={() => {
            if (!actionPending) setActiveDialog(null);
          }}
          onConfirm={() => void confirmAction()}
          order={activeDialog.order}
          pending={actionPending}
        />
      ) : null}
    </section>
  );
}
