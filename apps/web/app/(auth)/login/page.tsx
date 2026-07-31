"use client";

import { Button, Card, FormField } from "@point-quest/ui";
import { ArrowRight, Award, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { browserApiClient } from "@/lib/api/browser-client";
import { getApiErrorMessage } from "@/lib/api/error-message";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);

    try {
      const session = await browserApiClient.loginWeb({ username, password });
      const destination = session.user.role === "ADMIN" ? "/admin" : "/learn";
      router.push(destination);
      router.refresh();
    } catch (caught) {
      setPassword("");
      setError(getApiErrorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-story" aria-label="平台介绍">
        <Link className="brand brand--auth" href="/">
          <span aria-hidden="true" className="brand__mark">
            P
          </span>
          <span>
            <strong>Point Quest</strong>
            <small>英语成长站</small>
          </span>
        </Link>
        <div className="auth-story__content">
          <span className="auth-kicker">
            <Award aria-hidden="true" />
            学习有回响，进步看得见
          </span>
          <h1>把每一道题，变成离目标更近的一步。</h1>
          <p>
            完成英语挑战、整理错题、积累积分，并兑换你真正想要的奖励。
          </p>
        </div>
        <div className="auth-trust">
          <ShieldCheck aria-hidden="true" />
          <span>安全会话 · 角色分区 · 进度持续记录</span>
        </div>
      </section>

      <section className="auth-panel">
        <Card className="auth-card">
          <div className="auth-card__heading">
            <p className="auth-card__eyebrow">欢迎回来</p>
            <h2>登录你的账号</h2>
            <p>继续今天的英语成长旅程。</p>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            {error ? (
              <p className="form-alert" role="alert">
                {error}
              </p>
            ) : null}
            <FormField htmlFor="login-username" label="用户名">
              <input
                autoComplete="username"
                className="pq-input"
                id="login-username"
                name="username"
                onChange={(event) => setUsername(event.target.value)}
                required
                value={username}
              />
            </FormField>
            <FormField htmlFor="login-password" label="密码">
              <input
                autoComplete="current-password"
                className="pq-input"
                id="login-password"
                name="password"
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
            </FormField>
            <Button disabled={pending} fullWidth type="submit">
              <span>{pending ? "正在登录…" : "登录"}</span>
              <ArrowRight aria-hidden="true" />
            </Button>
          </form>

          <p className="auth-switch">
            还没有账号？ <Link href="/register">立即注册</Link>
          </p>
        </Card>
      </section>
    </main>
  );
}
