"use client";

import { Button, Card, FormField } from "@point-quest/ui";
import { ArrowRight, CheckCircle2, Target } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { browserApiClient } from "@/lib/api/browser-client";
import { getApiErrorMessage } from "@/lib/api/error-message";

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (password !== confirmation) {
      setConfirmation("");
      setError("两次输入的密码不一致");
      return;
    }

    setPending(true);
    try {
      await browserApiClient.register({ username, password });
      router.push("/login?registered=1");
    } catch (caught) {
      setPassword("");
      setConfirmation("");
      setError(getApiErrorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="auth-page auth-page--register">
      <section className="auth-story" aria-label="注册说明">
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
            <Target aria-hidden="true" />
            从今天开始积累
          </span>
          <h1>建立你的成长记录，让坚持有迹可循。</h1>
          <ul className="auth-benefits">
            <li>
              <CheckCircle2 aria-hidden="true" />
              随机挑战未回答题目
            </li>
            <li>
              <CheckCircle2 aria-hidden="true" />
              错题进入专属错题本
            </li>
            <li>
              <CheckCircle2 aria-hidden="true" />
              正确作答赢取积分奖励
            </li>
          </ul>
        </div>
      </section>

      <section className="auth-panel">
        <Card className="auth-card">
          <div className="auth-card__heading">
            <p className="auth-card__eyebrow">创建账号</p>
            <h2>开启英语积分之旅</h2>
            <p>用户名可使用小写字母、数字与下划线。</p>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            {error ? (
              <p className="form-alert" role="alert">
                {error}
              </p>
            ) : null}
            <FormField htmlFor="register-username" label="用户名">
              <input
                autoComplete="username"
                className="pq-input"
                id="register-username"
                minLength={3}
                name="username"
                onChange={(event) => setUsername(event.target.value)}
                pattern="[a-z0-9_]+"
                required
                value={username}
              />
            </FormField>
            <FormField
              hint="至少 10 位，并同时包含字母和数字"
              htmlFor="register-password"
              label="密码"
            >
              <input
                aria-describedby="register-password-hint"
                autoComplete="new-password"
                className="pq-input"
                id="register-password"
                minLength={10}
                name="password"
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
            </FormField>
            <FormField htmlFor="register-confirmation" label="确认密码">
              <input
                autoComplete="new-password"
                className="pq-input"
                id="register-confirmation"
                minLength={10}
                name="confirmation"
                onChange={(event) => setConfirmation(event.target.value)}
                required
                type="password"
                value={confirmation}
              />
            </FormField>
            <Button disabled={pending} fullWidth type="submit">
              <span>{pending ? "正在创建…" : "创建账号"}</span>
              <ArrowRight aria-hidden="true" />
            </Button>
          </form>

          <p className="auth-switch">
            已有账号？ <Link href="/login">返回登录</Link>
          </p>
        </Card>
      </section>
    </main>
  );
}
