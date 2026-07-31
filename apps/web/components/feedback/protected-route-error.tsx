"use client";

import { Button, Card } from "@point-quest/ui";
import { RefreshCw, TriangleAlert } from "lucide-react";
import Link from "next/link";

type ProtectedRouteErrorProps = {
  error: Error & { digest?: string };
  unstable_retry: () => void;
};

export default function ProtectedRouteError({
  error,
  unstable_retry,
}: ProtectedRouteErrorProps) {
  void error;

  return (
    <main className="protected-error">
      <Card className="protected-error__card">
        <span aria-hidden="true" className="protected-error__icon">
          <TriangleAlert />
        </span>
        <p className="page-kicker">连接暂时中断</p>
        <h1>暂时无法加载这个页面</h1>
        <p>你的数据没有丢失，可以重新加载；如果登录已过期，也可以返回登录。</p>
        <div className="protected-error__actions">
          <Button onClick={unstable_retry}>
            <RefreshCw aria-hidden="true" />
            重新加载
          </Button>
          <Link className="pq-button pq-button--secondary" href="/login">
            返回登录
          </Link>
        </div>
      </Card>
    </main>
  );
}
