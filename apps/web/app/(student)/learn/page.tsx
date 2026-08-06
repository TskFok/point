"use client";

import type {
  ApiClient,
  ApiComponents,
} from "@point-quest/api-client";
import { Card } from "@point-quest/ui";
import {
  ArrowRight,
  BookOpen,
  BookOpenCheck,
  CircleDollarSign,
  LoaderCircle,
  Sparkles,
  Target,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { AsyncError } from "@/components/feedback/async-error";
import { browserApiClient } from "@/lib/api/browser-client";
import { getApiErrorMessage } from "@/lib/api/error-message";
import { publishPointBalance } from "@/lib/point-balance-event";

type Summary = ApiComponents["schemas"]["PracticeSummaryDto"];
type SummaryApi = Pick<ApiClient, "getPracticeSummary">;

export default function LearnPage({
  api = browserApiClient,
}: {
  api?: SummaryApi;
} = {}) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const initialLoadStarted = useRef(false);
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
      const response = await api.getPracticeSummary();
      if (!mounted.current || latestRequest.current !== requestId) return;
      setSummary(response);
      publishPointBalance(response.balance);
    } catch (loadError) {
      if (!mounted.current || latestRequest.current !== requestId) return;
      setError(getApiErrorMessage(loadError));
    } finally {
      if (mounted.current && latestRequest.current === requestId) {
        setLoading(false);
      }
    }
  }, [api]);

  useEffect(() => {
    if (initialLoadStarted.current) return;
    initialLoadStarted.current = true;
    void load();
  }, [load]);

  return (
    <section className="student-page">
      {loading ? (
        <Card aria-live="polite" className="page-loading" role="status">
          <LoaderCircle aria-hidden="true" className="spin" />
          正在汇总你的学习进度
        </Card>
      ) : error ? (
        <AsyncError message={error} onRetry={() => void load()} />
      ) : summary ? (
        <>
          <Card className="hero-progress" tone="primary">
            <div className="hero-progress__copy">
              <span className="hero-progress__icon">
                <Target aria-hidden="true" />
              </span>
              <div>
                <p>首次答题进度</p>
                <h2>
                  已首次作答 {summary.firstAnsweredCount} 题
                </h2>
                <span>未回答 {summary.unansweredCount} 题</span>
              </div>
            </div>
            <div className="hero-progress__bar">
              <span
                style={{
                  width: `${
                    summary.activeTotal === 0
                      ? 0
                      : Math.round(
                          (summary.firstAnsweredCount /
                            summary.activeTotal) *
                            100,
                        )
                  }%`,
                }}
              />
            </div>
            <Link
              className="pq-button pq-button--primary"
              href="/learn/practice"
            >
              开始随机练习
              <ArrowRight aria-hidden="true" />
            </Link>
          </Card>

          <div className="summary-grid">
            <Card className="summary-card" tone="reward">
              <CircleDollarSign aria-hidden="true" />
              <span>当前积分</span>
              <strong>{summary.balance}</strong>
            </Card>
            <Card className="summary-card">
              <BookOpen aria-hidden="true" />
              <span>未回答</span>
              <strong>{summary.unansweredCount} 题</strong>
            </Card>
            <Card className="summary-card">
              <BookOpenCheck aria-hidden="true" />
              <span>待练错题</span>
              <strong>{summary.pendingWrongCount} 题</strong>
            </Card>
          </div>

          <div className="action-grid">
            <Link href="/learn/wrong-questions">
              <Card className="action-card">
                <BookOpenCheck aria-hidden="true" />
                <div>
                  <h2>巩固错题</h2>
                  <p>待练错题 {summary.pendingWrongCount} 题</p>
                </div>
                <ArrowRight aria-hidden="true" />
              </Card>
            </Link>
            <Link href="/learn/store">
              <Card className="action-card">
                <Sparkles aria-hidden="true" />
                <div>
                  <h2>看看积分奖励</h2>
                  <p>用 {summary.balance} 积分兑换心仪商品</p>
                </div>
                <ArrowRight aria-hidden="true" />
              </Card>
            </Link>
          </div>
        </>
      ) : null}
    </section>
  );
}
