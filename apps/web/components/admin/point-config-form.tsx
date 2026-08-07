"use client";

import type { ApiClient, ApiComponents } from "@point-quest/api-client";
import { Button, Card } from "@point-quest/ui";
import { CheckCircle2, LoaderCircle, Save, Sparkles } from "lucide-react";
import { useState } from "react";

import { browserApiClient } from "@/lib/api/browser-client";
import { getApiErrorMessage } from "@/lib/api/error-message";

type PointConfig = ApiComponents["schemas"]["PointConfigDto"];
type PointConfigApi = Pick<ApiClient, "updateAdminPointConfig">;

export function PointConfigForm({
  api = browserApiClient,
  currentMultiplier,
  onSaved,
}: {
  api?: PointConfigApi;
  currentMultiplier: number;
  onSaved?: (config: PointConfig) => void;
}) {
  const [multiplier, setMultiplier] = useState(String(currentMultiplier));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  async function submit() {
    if (saving) return;
    const value = Number(multiplier);
    if (!Number.isInteger(value) || value < 1 || value > 10) {
      setError("积分倍率必须是 1–10 的整数");
      setSuccess(null);
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const config = await api.updateAdminPointConfig({
        multiplier: value,
      });
      setSuccess(`倍率已更新为 ${config.multiplier}×`);
      onSaved?.(config);
    } catch (caught) {
      setError(getApiErrorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="point-config-card" tone="reward">
      <form
        className="point-config-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="point-config-card__heading">
          <div className="point-config-card__heading-main">
            <div className="point-config-card__icon">
              <Sparkles aria-hidden="true" />
            </div>
            <div>
              <p className="page-kicker">全局奖励规则</p>
              <h2>积分倍率</h2>
              <p>答对首答题目时，基础积分会乘以当前倍率。</p>
            </div>
          </div>
          <Button disabled={saving} type="submit">
            {saving ? (
              <LoaderCircle aria-hidden="true" className="spin" />
            ) : (
              <Save aria-hidden="true" />
            )}
            {saving ? "正在保存" : error ? "重试保存倍率" : "保存倍率"}
          </Button>
        </div>
        <label className="admin-field">
          <span>积分倍率</span>
          <div className="multiplier-input">
            <input
              aria-label="积分倍率"
              inputMode="numeric"
              max={10}
              min={1}
              onChange={(event) => {
                setMultiplier(event.target.value);
                setError(null);
                setSuccess(null);
              }}
              step={1}
              type="number"
              value={multiplier}
            />
            <strong>×</strong>
          </div>
          <small>输入 1–10 的整数，新配置立即对后续答题生效。</small>
        </label>
      </form>
      {error ? (
        <p className="admin-form__errors" role="alert">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="success-banner" role="status">
          <CheckCircle2 aria-hidden="true" />
          {success}
        </p>
      ) : null}
    </Card>
  );
}
