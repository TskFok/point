"use client";

import type { ApiClient, ApiComponents } from "@point-quest/api-client";
import { Button, Card } from "@point-quest/ui";
import {
  Boxes,
  CircleGauge,
  ClipboardCheck,
  LibraryBig,
  LoaderCircle,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { AsyncError } from "@/components/feedback/async-error";
import { ADMIN_QUESTIONS_OPEN_CREATE_KEY } from "@/lib/admin/questions-ui";
import { browserApiClient } from "@/lib/api/browser-client";
import { getApiErrorMessage } from "@/lib/api/error-message";

type Dashboard = ApiComponents["schemas"]["AdminDashboardDto"];
type DashboardApi = Pick<ApiClient, "getAdminDashboard">;

const dashboardCards = [
  {
    key: "activeQuestionCount",
    label: "启用题目",
    helper: "当前可进入首次练习的题目",
    href: "/admin/questions?isActive=true",
    Icon: LibraryBig,
    tone: "primary",
  },
  {
    key: "todayAnswerCount",
    label: "今日答题",
    helper: "Asia/Shanghai 今日提交次数",
    href: "/admin/questions",
    Icon: CircleGauge,
    tone: "success",
  },
  {
    key: "pendingOrderCount",
    label: "待领取订单",
    helper: "需要确认交付或处理的订单",
    href: "/admin/orders?status=PENDING_PICKUP",
    Icon: ClipboardCheck,
    tone: "warning",
  },
  {
    key: "activeProductCount",
    label: "上架商品",
    helper: "商城中当前可兑换的奖励",
    href: "/admin/products?isActive=true",
    Icon: Boxes,
    tone: "reward",
  },
] as const;

export default function AdminDashboardPage({
  api = browserApiClient,
}: {
  api?: DashboardApi;
} = {}) {
  const router = useRouter();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const loaded = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDashboard(await api.getAdminDashboard());
    } catch (caught) {
      setError(getApiErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    void load();
  }, [load]);

  return (
    <section className="admin-page">
      {loading ? (
        <Card aria-live="polite" className="page-loading" role="status">
          <LoaderCircle aria-hidden="true" className="spin" />
          正在汇总运营数据
        </Card>
      ) : error ? (
        <AsyncError message={error} onRetry={() => void load()} />
      ) : dashboard ? (
        <div className="admin-dashboard-grid">
          {dashboardCards.map((card) => {
            const Icon = card.Icon;
            return (
              <Link
                className={`admin-dashboard-card admin-dashboard-card--${card.tone}`}
                href={card.href}
                key={card.key}
              >
                <span className="admin-dashboard-card__icon">
                  <Icon aria-hidden="true" />
                </span>
                <div>
                  <p>{card.label}</p>
                  <strong>{dashboard[card.key]}</strong>
                  <small>{card.helper}</small>
                </div>
              </Link>
            );
          })}
        </div>
      ) : null}

      <Card className="admin-quick-actions">
        <div>
          <p className="page-kicker">快捷操作</p>
          <h2>继续维护学习体验</h2>
        </div>
        <div className="admin-quick-actions__links">
          <Button
            onClick={() => {
              sessionStorage.setItem(ADMIN_QUESTIONS_OPEN_CREATE_KEY, "1");
              router.push("/admin/questions");
            }}
          >
            添加英语题目
          </Button>
          <Link
            className="pq-button pq-button--secondary"
            href="/admin/products"
          >
            管理商城商品
          </Link>
          <Link className="pq-button pq-button--secondary" href="/admin/points">
            调整积分倍率
          </Link>
        </div>
      </Card>
    </section>
  );
}
