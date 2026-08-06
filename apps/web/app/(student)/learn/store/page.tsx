"use client";

import type {
  ApiClient,
  ApiComponents,
} from "@point-quest/api-client";
import { ApiClientError } from "@point-quest/api-client";
import { Card } from "@point-quest/ui";
import { Gift, LoaderCircle, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { AsyncError } from "@/components/feedback/async-error";
import { PaginationControls } from "@/components/pagination-controls";
import { ProductCard } from "@/components/store/product-card";
import { RedeemDialog } from "@/components/store/redeem-dialog";
import { browserApiClient } from "@/lib/api/browser-client";
import { getApiErrorMessage } from "@/lib/api/error-message";
import { publishPointBalance } from "@/lib/point-balance-event";

type Schemas = ApiComponents["schemas"];
type Product = Schemas["ProductDto"];
type PageMeta = Schemas["PageMetaDto"];

type StoreApi = Pick<
  ApiClient,
  "createOrder" | "getPointBalance" | "listProducts"
>;

type Redemption = {
  idempotencyKey: string;
  product: Product;
};

type StorePageProps = {
  api?: StoreApi;
  initialBalance?: number;
};

function createRedemptionKey() {
  return globalThis.crypto.randomUUID();
}

export default function StorePage({
  api = browserApiClient,
  initialBalance,
}: StorePageProps = {}) {
  const [balance, setBalance] = useState<number | null>(
    initialBalance ?? null,
  );
  const [products, setProducts] = useState<Product[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deficits, setDeficits] = useState<Record<string, number>>({});
  const [redemption, setRedemption] = useState<Redemption | null>(null);
  const [redeeming, setRedeeming] = useState(false);
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const automaticLoadKey = useRef<string | null>(null);
  const fallbackFocusRef = useRef<HTMLDivElement>(null);
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
    setLoadError(null);
    try {
      const balancePromise =
        initialBalance === undefined
          ? api.getPointBalance()
          : Promise.resolve({ balance: initialBalance });
      const [balanceResponse, productResponse] = await Promise.all([
        balancePromise,
        api.listProducts({ page, pageSize: 12 }),
      ]);
      if (!mounted.current || latestLoadRequest.current !== requestId) return;
      setBalance(balanceResponse.balance);
      const lastValidPage = Math.max(1, productResponse.meta.totalPages);
      if (
        productResponse.data.length === 0 &&
        productResponse.meta.total > 0 &&
        page > lastValidPage
      ) {
        setPage(lastValidPage);
        return;
      }
      setProducts(productResponse.data);
      setMeta(productResponse.meta);
    } catch (error) {
      if (!mounted.current || latestLoadRequest.current !== requestId) return;
      setLoadError(getApiErrorMessage(error));
    } finally {
      if (mounted.current && latestLoadRequest.current === requestId) {
        setLoading(false);
      }
    }
  }, [api, initialBalance, page]);

  useEffect(() => {
    const loadKey = String(page);
    if (automaticLoadKey.current === loadKey) return;
    automaticLoadKey.current = loadKey;
    void load();
  }, [load, page]);

  function beginRedemption(product: Product) {
    if (
      balance === null ||
      product.stock <= 0 ||
      redemption ||
      redeeming
    ) {
      return;
    }
    setSuccessMessage(null);
    if (balance < product.pointsCost) {
      setDeficits((current) => ({
        ...current,
        [product.id]: product.pointsCost - balance,
      }));
      return;
    }
    setDeficits((current) => {
      const next = { ...current };
      delete next[product.id];
      return next;
    });
    setRedeemError(null);
    setRedemption({
      idempotencyKey: createRedemptionKey(),
      product,
    });
  }

  async function confirmRedemption() {
    if (!redemption || redeeming) return;
    const activeRedemption = redemption;
    setRedeeming(true);
    setRedeemError(null);
    try {
      const order = await api.createOrder({
        idempotencyKey: activeRedemption.idempotencyKey,
        productId: activeRedemption.product.id,
      });
      setBalance(order.balance);
      publishPointBalance(order.balance);
      setProducts((items) =>
        items.map((product) =>
          product.id === activeRedemption.product.id
            ? { ...product, stock: Math.max(0, product.stock - 1) }
            : product,
        ),
      );
      setSuccessMessage("兑换成功，订单已生成");
      setRedemption(null);
    } catch (error) {
      if (
        error instanceof ApiClientError &&
        error.body.code === "INSUFFICIENT_POINTS"
      ) {
        const latestBalance = error.body.details.balance;
        if (
          typeof latestBalance === "number" &&
          Number.isSafeInteger(latestBalance) &&
          latestBalance >= 0
        ) {
          setBalance(latestBalance);
          publishPointBalance(latestBalance);
          setDeficits((current) => ({
            ...current,
            [activeRedemption.product.id]: Math.max(
              activeRedemption.product.pointsCost - latestBalance,
              0,
            ),
          }));
          setRedemption(null);
          return;
        }
      }
      if (
        error instanceof ApiClientError &&
        error.body.code === "OUT_OF_STOCK"
      ) {
        setProducts((items) =>
          items.map((product) =>
            product.id === activeRedemption.product.id
              ? { ...product, stock: 0 }
              : product,
          ),
        );
        setRedemption(null);
        return;
      }
      if (
        error instanceof ApiClientError &&
        error.body.code === "PRODUCT_INACTIVE"
      ) {
        setProducts((items) =>
          items.filter(
            (product) => product.id !== activeRedemption.product.id,
          ),
        );
        setRedemption(null);
        automaticLoadKey.current = null;
        void load();
        return;
      }
      setRedeemError(getApiErrorMessage(error));
    } finally {
      setRedeeming(false);
    }
  }

  return (
    <section className="student-page">
      <div
        className="page-heading page-heading--split"
        ref={fallbackFocusRef}
        tabIndex={-1}
      >
        <div>
          <p className="page-kicker">积分奖励站</p>
          <h1>把学习成果兑换成喜欢的奖励</h1>
          <p>每次兑换一件商品，确认后会立即生成待领取订单。</p>
        </div>
        <Card
          aria-label={`当前可用积分 ${balance ?? "加载中"}`}
          className="balance-card"
          tone="reward"
        >
          <Sparkles aria-hidden="true" />
          <div>
            <span>当前可用积分</span>
            <strong>{balance ?? "—"}</strong>
          </div>
        </Card>
      </div>

      {successMessage ? (
        <p className="success-banner" role="status">
          {successMessage}
        </p>
      ) : null}

      {loading ? (
        <Card aria-live="polite" className="page-loading" role="status">
          <LoaderCircle aria-hidden="true" className="spin" />
          正在加载可兑换商品
        </Card>
      ) : loadError ? (
        <AsyncError message={loadError} onRetry={() => void load()} />
      ) : products.length === 0 ? (
        <EmptyState
          description="暂时没有上架商品，继续积累积分，新的奖励很快就会出现。"
          icon={<Gift />}
          title="商城正在补充奖励"
        />
      ) : (
        <div className="paginated-panel">
          <div className="paginated-panel__body">
            <div className="product-grid">
              {products.map((product) => (
                <ProductCard
                  balance={balance ?? 0}
                  deficit={deficits[product.id]}
                  key={product.id}
                  onRedeem={beginRedemption}
                  product={product}
                />
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

      {redemption && balance !== null ? (
        <RedeemDialog
          balance={balance}
          error={redeemError}
          fallbackFocusRef={fallbackFocusRef}
          onCancel={() => {
            if (!redeeming) setRedemption(null);
          }}
          onConfirm={() => void confirmRedemption()}
          pending={redeeming}
          product={redemption.product}
        />
      ) : null}
    </section>
  );
}
