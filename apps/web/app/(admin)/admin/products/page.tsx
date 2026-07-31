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
  X,
} from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

import { ProductForm } from "@/components/admin/product-form";
import { Pagination } from "@/components/data/pagination";
import { StatusFilter } from "@/components/data/status-filter";
import { EmptyState } from "@/components/empty-state";
import { AsyncError } from "@/components/feedback/async-error";
import { browserApiClient } from "@/lib/api/browser-client";
import { getApiErrorMessage } from "@/lib/api/error-message";
import { productImageUrl } from "@/lib/product-image";

type Schemas = ApiComponents["schemas"];
type Product = Schemas["ProductDto"];
type PageMeta = Schemas["PageMetaDto"];
type ProductsApi = Pick<
  ApiClient,
  | "createAdminProduct"
  | "listAdminProducts"
  | "updateAdminProduct"
  | "uploadAdminProductImage"
>;
type Filters = { search: string; isActive: string };

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

  function handleSaved(product: Product) {
    setProducts((items) => {
      const exists = items.some((item) => item.id === product.id);
      return exists
        ? items.map((item) => (item.id === product.id ? product : item))
        : [product, ...items];
    });
    setEditing(null);
  }

  return (
    <section className="admin-page">
      <div className="page-heading page-heading--split">
        <div>
          <p className="page-kicker">积分奖励中心</p>
          <h1>商品管理</h1>
          <p>维护商品图片、库存、积分价格和上架状态。</p>
        </div>
        <Button onClick={() => setEditing("create")}>
          <Plus aria-hidden="true" />
          添加商品
        </Button>
      </div>

      {editing ? (
        <section className="admin-editor-panel" aria-label="商品编辑区">
          <div className="admin-section-heading">
            <div>
              <p className="page-kicker">
                {editing === "create" ? "新奖励" : "商品维护"}
              </p>
              <h2>
                {editing === "create" ? "添加新商品" : `编辑 ${editing.name}`}
              </h2>
            </div>
            <Button onClick={() => setEditing(null)} variant="secondary">
              <X aria-hidden="true" />
              关闭表单
            </Button>
          </div>
          <ProductForm
            api={api}
            initialProduct={editing === "create" ? undefined : editing}
            mode={editing === "create" ? "create" : "edit"}
            onSaved={handleSaved}
            productId={editing === "create" ? undefined : editing.id}
          />
        </section>
      ) : null}

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
        </form>
      </Card>

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
        <>
          <div className="admin-product-grid">
            {products.map((product) => (
              <Card className="admin-product-card" key={product.id}>
                <div className="admin-product-card__image">
                  <Image
                    alt={product.name}
                    height={360}
                    sizes="(max-width: 700px) 100vw, 33vw"
                    src={productImageUrl(product.imageKey)}
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
                  <Button
                    fullWidth
                    onClick={() => setEditing(product)}
                    variant="secondary"
                  >
                    <Pencil aria-hidden="true" />
                    编辑商品
                  </Button>
                </div>
              </Card>
            ))}
          </div>
          {meta ? (
            <Pagination
              disabled={loading}
              onPageChange={setPage}
              page={meta.page}
              totalPages={meta.totalPages}
            />
          ) : null}
        </>
      )}
    </section>
  );
}
