"use client";

import type { ApiClient, ApiComponents } from "@point-quest/api-client";
import { Button, Card } from "@point-quest/ui";
import {
  Boxes,
  CircleCheck,
  CircleOff,
  Coins,
  Filter,
  LoaderCircle,
  Package,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { ProductForm } from "@/components/admin/product-form";
import { Pagination } from "@/components/data/pagination";
import { StatusFilter } from "@/components/data/status-filter";
import { EmptyState } from "@/components/empty-state";
import { AsyncError } from "@/components/feedback/async-error";
import { ProductImage } from "@/components/media/product-image";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FormDialog } from "@/components/ui/form-dialog";
import { useConfirmAction } from "@/hooks/use-confirm-action";
import { browserApiClient } from "@/lib/api/browser-client";
import { getApiErrorMessage } from "@/lib/api/error-message";

type Schemas = ApiComponents["schemas"];
type Product = Schemas["ProductDto"];
type PageMeta = Schemas["PageMetaDto"];
type ProductsApi = Pick<
  ApiClient,
  | "createAdminProduct"
  | "listAdminProducts"
  | "updateAdminProduct"
  | "uploadAdminProductImage"
  | "deleteAdminProduct"
>;
type Filters = { search: string; isActive: string };
type ConfirmAction = { kind: "delete"; target: Product };

function readUrlState(): { filters: Filters; page: number } {
  if (typeof window === "undefined") {
    return { filters: { search: "", isActive: "" }, page: 1 };
  }
  const params = new URLSearchParams(window.location.search);
  const parsedPage = Number(params.get("page"));
  return {
    page: Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1,
    filters: {
      search: params.get("search") ?? "",
      isActive: params.get("isActive") ?? "",
    },
  };
}

function writeUrl(filters: Filters, page: number) {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams();
  if (filters.search.trim()) params.set("search", filters.search.trim());
  if (filters.isActive) params.set("isActive", filters.isActive);
  if (page > 1) params.set("page", String(page));
  const search = params.toString();
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${search ? `?${search}` : ""}`,
  );
}

export default function AdminProductsPage({
  api = browserApiClient,
}: {
  api?: ProductsApi;
} = {}) {
  const [initial] = useState(readUrlState);
  const [filters, setFilters] = useState(initial.filters);
  const [appliedFilters, setAppliedFilters] = useState(initial.filters);
  const [page, setPage] = useState(initial.page);
  const [products, setProducts] = useState<Product[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Product | "create" | null>(null);
  const [formPending, setFormPending] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
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
      const response = await api.listAdminProducts({
        page,
        pageSize: 20,
        ...(appliedFilters.search.trim()
          ? { search: appliedFilters.search.trim() }
          : {}),
        ...(appliedFilters.isActive
          ? { isActive: appliedFilters.isActive === "true" }
          : {}),
      });
      if (!mounted.current || latestRequest.current !== requestId) return;
      const lastPage = Math.max(1, response.meta.totalPages);
      if (page > lastPage) {
        setPage(lastPage);
        return;
      }
      setProducts(response.data);
      setMeta(response.meta);
    } catch (caught) {
      if (!mounted.current || latestRequest.current !== requestId) return;
      setError(getApiErrorMessage(caught));
    } finally {
      if (mounted.current && latestRequest.current === requestId) {
        setLoading(false);
      }
    }
  }, [api, appliedFilters, page]);

  useEffect(() => {
    const key = JSON.stringify({ appliedFilters, page });
    if (automaticLoadKey.current === key) return;
    automaticLoadKey.current = key;
    writeUrl(appliedFilters, page);
    void load();
  }, [appliedFilters, load, page]);

  function handleSaved() {
    setFormPending(false);
    setEditing(null);
    void load();
  }

  async function removeProduct(product: Product): Promise<string | null> {
    if (busyId) return "请等待当前操作完成";
    setBusyId(product.id);
    setActionMessage(null);
    try {
      await api.deleteAdminProduct(product.id);
      setActionMessage("已删除");
      await load();
      return null;
    } catch (caught) {
      return getApiErrorMessage(caught);
    } finally {
      setBusyId(null);
    }
  }

  const { confirmAction, confirmError, openConfirm, closeConfirm, handleConfirm } =
    useConfirmAction<ConfirmAction>({
      blocked: Boolean(busyId),
      execute: async (action) => removeProduct(action.target),
    });

  return (
    <section className="admin-page list-page">
      <div className="list-page__chrome">
        <Card className="admin-filter-card">
          <form
            className="admin-filter-grid"
            onSubmit={(event) => {
              event.preventDefault();
              setPage(1);
              setAppliedFilters({ ...filters });
            }}
          >
            <label className="admin-field">
              <span>搜索商品</span>
              <div className="input-with-icon">
                <Search aria-hidden="true" />
                <input
                  aria-label="搜索商品"
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      search: event.target.value,
                    }))
                  }
                  placeholder="搜索名称或描述"
                  value={filters.search}
                />
              </div>
            </label>
            <StatusFilter
              label="上架状态"
              onChange={(isActive) =>
                setFilters((current) => ({ ...current, isActive }))
              }
              options={[
                { label: "已上架", value: "true" },
                { label: "已下架", value: "false" },
              ]}
              value={filters.isActive}
            />
            <Button disabled={loading} type="submit">
              <Filter aria-hidden="true" />
              应用筛选
            </Button>
            <Button onClick={() => setEditing("create")} type="button">
              <Plus aria-hidden="true" />
              添加商品
            </Button>
          </form>
        </Card>

        {actionMessage ? (
          <p className="success-banner" role="status">
            {actionMessage}
          </p>
        ) : null}
      </div>

      {editing ? (
        <FormDialog
          description={
            editing === "create"
              ? "维护商品图片、库存、积分价格和上架状态。"
              : `编辑 ${editing.name}`
          }
          onClose={() => {
            if (!formPending) setEditing(null);
          }}
          pending={formPending}
          title={
            editing === "create" ? "添加新商品" : `编辑 ${editing.name}`
          }
        >
          <ProductForm
            api={api}
            initialProduct={editing === "create" ? undefined : editing}
            key={editing === "create" ? "create" : editing.id}
            mode={editing === "create" ? "create" : "edit"}
            onPendingChange={setFormPending}
            onSaved={handleSaved}
            productId={editing === "create" ? undefined : editing.id}
          />
        </FormDialog>
      ) : null}

      {confirmAction ? (
        <ConfirmDialog
          cancelLabel="取消"
          confirmLabel="删除"
          confirmVariant="danger"
          description="此操作不可撤销。仅已下架且无订单的商品可删除。"
          error={confirmError}
          onCancel={closeConfirm}
          onConfirm={() => void handleConfirm()}
          pending={busyId === confirmAction.target.id}
          title={`确认删除商品「${confirmAction.target.name}」？`}
        />
      ) : null}

      {loading ? (
        <Card aria-live="polite" className="page-loading" role="status">
          <LoaderCircle aria-hidden="true" className="spin" />
          正在加载商品
        </Card>
      ) : error ? (
        <AsyncError message={error} onRetry={() => void load()} />
      ) : products.length === 0 ? (
        <EmptyState
          action={
            <Button onClick={() => setEditing("create")}>添加第一件商品</Button>
          }
          description="调整筛选条件，或上传图片并创建一份学习奖励。"
          icon={<Boxes />}
          title="没有匹配的商品"
        />
      ) : (
        <div className="paginated-panel">
          <div className="paginated-panel__body">
            <div className="admin-product-grid">
              {products.map((product) => (
                <Card className="admin-product-card" key={product.id}>
                  <div className="admin-product-card__image">
                    <ProductImage
                      alt={product.name}
                      height={360}
                      imageKey={product.imageKey}
                      sizes="(max-width: 700px) 100vw, 33vw"
                      width={480}
                    />
                    <span
                      className={`admin-status admin-status--${
                        product.isActive ? "active" : "inactive"
                      }`}
                    >
                      {product.isActive ? (
                        <CircleCheck aria-label="已上架状态图标" role="img" />
                      ) : (
                        <CircleOff aria-label="已下架状态图标" role="img" />
                      )}
                      {product.isActive ? "已上架" : "已下架"}
                    </span>
                  </div>
                  <div className="admin-product-card__body">
                    <div>
                      <h2>{product.name}</h2>
                      <p>{product.description}</p>
                    </div>
                    <div className="admin-product-card__facts">
                      <span>
                        <Package aria-hidden="true" />
                        库存 {product.stock}
                      </span>
                      <span>
                        <Coins aria-hidden="true" />
                        {product.pointsCost} 积分
                      </span>
                    </div>
                    <div className="admin-product-card__actions">
                      <Button
                        disabled={busyId === product.id}
                        fullWidth
                        onClick={() => setEditing(product)}
                        variant="secondary"
                      >
                        <Pencil aria-hidden="true" />
                        编辑商品
                      </Button>
                      {!product.isActive ? (
                        <Button
                          disabled={busyId === product.id}
                          fullWidth
                          onClick={() =>
                            openConfirm({ kind: "delete", target: product })
                          }
                          variant="secondary"
                        >
                          <Trash2 aria-hidden="true" />
                          删除
                        </Button>
                      ) : null}
                    </div>
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
    </section>
  );
}
