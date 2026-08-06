"use client";

import type { ApiClient, ApiComponents } from "@point-quest/api-client";
import { Button, Card } from "@point-quest/ui";
import {
  Bot,
  CircleCheck,
  CircleOff,
  Filter,
  LoaderCircle,
  Pencil,
  Plus,
  Trash2,
  Wifi,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { AdminPageHeading } from "@/components/admin/admin-page-heading";
import { AiModelForm } from "@/components/admin/ai-model-form";
import { Pagination } from "@/components/data/pagination";
import { StatusFilter } from "@/components/data/status-filter";
import { EmptyState } from "@/components/empty-state";
import { AsyncError } from "@/components/feedback/async-error";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FormDialog } from "@/components/ui/form-dialog";
import { useConfirmAction } from "@/hooks/use-confirm-action";
import { browserApiClient } from "@/lib/api/browser-client";
import { getApiErrorMessage } from "@/lib/api/error-message";

type Schemas = ApiComponents["schemas"];
type AiModel = Schemas["AiModelConfigDto"];
type PageMeta = Schemas["PageMetaDto"];
type AiModelsApi = Pick<
  ApiClient,
  | "listAdminAiModels"
  | "createAdminAiModel"
  | "updateAdminAiModel"
  | "deleteAdminAiModel"
  | "testAdminAiModel"
  | "testAdminAiModelDraft"
>;

type Filters = { isEnabled: string };

type ConfirmAction =
  | { kind: "delete"; target: AiModel }
  | { kind: "disable"; target: AiModel };

const formatter = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Shanghai",
});

function readUrlState(): { filters: Filters; page: number } {
  if (typeof window === "undefined") {
    return { filters: { isEnabled: "" }, page: 1 };
  }
  const params = new URLSearchParams(window.location.search);
  const parsedPage = Number(params.get("page"));
  return {
    page: Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1,
    filters: {
      isEnabled: params.get("isEnabled") ?? "",
    },
  };
}

function writeUrl(filters: Filters, page: number) {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams();
  if (filters.isEnabled) params.set("isEnabled", filters.isEnabled);
  if (page > 1) params.set("page", String(page));
  const search = params.toString();
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${search ? `?${search}` : ""}`,
  );
}

export default function AdminAiModelsPage({
  api = browserApiClient,
}: {
  api?: AiModelsApi;
} = {}) {
  const [initial] = useState(readUrlState);
  const [filters, setFilters] = useState(initial.filters);
  const [appliedFilters, setAppliedFilters] = useState(initial.filters);
  const [page, setPage] = useState(initial.page);
  const [models, setModels] = useState<AiModel[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AiModel | "create" | null>(null);
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
      const response = await api.listAdminAiModels({
        page,
        pageSize: 20,
        ...(appliedFilters.isEnabled
          ? { isEnabled: appliedFilters.isEnabled === "true" }
          : {}),
      });
      if (!mounted.current || latestRequest.current !== requestId) return;
      const lastPage = Math.max(1, response.meta.totalPages);
      if (page > lastPage) {
        setPage(lastPage);
        return;
      }
      setModels(response.data);
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
    setActionMessage("配置已保存");
    void load();
  }

  async function toggleEnabled(model: AiModel): Promise<string | null> {
    if (busyId) return "请等待当前操作完成";
    setBusyId(model.id);
    setActionMessage(null);
    try {
      await api.updateAdminAiModel(model.id, { isEnabled: !model.isEnabled });
      setActionMessage(model.isEnabled ? "已停用" : "已启用");
      await load();
      return null;
    } catch (caught) {
      return getApiErrorMessage(caught);
    } finally {
      setBusyId(null);
    }
  }

  async function removeModel(model: AiModel): Promise<string | null> {
    if (busyId) return "请等待当前操作完成";
    setBusyId(model.id);
    setActionMessage(null);
    try {
      await api.deleteAdminAiModel(model.id);
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
      execute: async (action) =>
        action.kind === "delete"
          ? removeModel(action.target)
          : toggleEnabled(action.target),
    });

  async function testModel(model: AiModel) {
    if (busyId) return;
    setBusyId(model.id);
    setActionMessage(null);
    try {
      const result = await api.testAdminAiModel(model.id);
      setActionMessage(
        result.ok
          ? `「${model.name}」连通成功（${result.latencyMs} ms）`
          : `「${model.name}」连通失败：${result.message ?? "未知错误"}`,
      );
    } catch (caught) {
      setActionMessage(getApiErrorMessage(caught));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="admin-page list-page">
      <div className="list-page__chrome">
        <AdminPageHeading
          description="配置模型名称、调用地址与 API Key，供后续智能能力使用。"
          kicker="系统能力"
          title="AI 模型"
        >
          <Button onClick={() => setEditing("create")}>
            <Plus aria-hidden="true" />
            添加模型
          </Button>
        </AdminPageHeading>

        <Card className="admin-filter-card">
          <form
            className="admin-filter-grid"
            onSubmit={(event) => {
              event.preventDefault();
              setPage(1);
              setAppliedFilters({ ...filters });
            }}
          >
            <StatusFilter
              label="启用状态"
              onChange={(isEnabled) =>
                setFilters((current) => ({ ...current, isEnabled }))
              }
              options={[
                { label: "已启用", value: "true" },
                { label: "未启用", value: "false" },
              ]}
              value={filters.isEnabled}
            />
            <Button disabled={loading} type="submit">
              <Filter aria-hidden="true" />
              应用筛选
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
          onClose={() => {
            if (!formPending) setEditing(null);
          }}
          pending={formPending}
          title={editing === "create" ? "新配置" : `编辑 ${editing.name}`}
        >
          <AiModelForm
            api={api}
            initialModel={editing === "create" ? undefined : editing}
            key={editing === "create" ? "create" : editing.id}
            mode={editing === "create" ? "create" : "edit"}
            onPendingChange={setFormPending}
            onSaved={handleSaved}
          />
        </FormDialog>
      ) : null}

      {confirmAction ? (
        <ConfirmDialog
          cancelLabel="取消"
          confirmLabel={confirmAction.kind === "delete" ? "删除" : "停用"}
          confirmVariant="danger"
          description={
            confirmAction.kind === "delete"
              ? "此操作不可撤销。"
              : "停用后将不可用于新的 AI 任务。"
          }
          error={confirmError}
          onCancel={closeConfirm}
          onConfirm={() => void handleConfirm()}
          pending={busyId === confirmAction.target.id}
          title={
            confirmAction.kind === "delete"
              ? `确认删除模型「${confirmAction.target.name}」？`
              : `确认停用模型「${confirmAction.target.name}」？`
          }
        />
      ) : null}

      {loading ? (
        <Card aria-live="polite" className="page-loading" role="status">
          <LoaderCircle aria-hidden="true" className="spin" />
          正在加载 AI 模型
        </Card>
      ) : error ? (
        <AsyncError message={error} onRetry={() => void load()} />
      ) : models.length === 0 ? (
        <EmptyState
          action={
            <Button onClick={() => setEditing("create")}>添加第一套模型</Button>
          }
          description="添加调用地址与 API Key，并按需启用。"
          icon={<Bot />}
          title="还没有 AI 模型配置"
        />
      ) : (
        <div className="paginated-panel">
          <div className="paginated-panel__body">
            <div className="admin-table-wrap">
              <table className="admin-table">
                <caption className="sr-only">AI 模型配置列表</caption>
                <thead>
                  <tr>
                    <th scope="col">模型名称</th>
                    <th scope="col">调用地址</th>
                    <th scope="col">API Key</th>
                    <th scope="col">状态</th>
                    <th scope="col">更新时间</th>
                    <th scope="col">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {models.map((model) => (
                    <tr key={model.id}>
                      <td>{model.name}</td>
                      <td>{model.baseUrl}</td>
                      <td>{model.apiKeyMasked}</td>
                      <td>
                        <span
                          className={`admin-status admin-status--${
                            model.isEnabled ? "active" : "inactive"
                          }`}
                        >
                          {model.isEnabled ? (
                            <CircleCheck aria-hidden="true" />
                          ) : (
                            <CircleOff aria-hidden="true" />
                          )}
                          {model.isEnabled ? "已启用" : "未启用"}
                        </span>
                      </td>
                      <td>{formatter.format(new Date(model.updatedAt))}</td>
                      <td>
                        <div className="admin-table__actions">
                          <Button
                            disabled={busyId === model.id}
                            onClick={() => setEditing(model)}
                            variant="secondary"
                          >
                            <Pencil aria-hidden="true" />
                            编辑
                          </Button>
                          <Button
                            disabled={busyId === model.id}
                            onClick={() => {
                              if (model.isEnabled) {
                                openConfirm({
                                  kind: "disable",
                                  target: model,
                                });
                                return;
                              }
                              void (async () => {
                                const error = await toggleEnabled(model);
                                if (error) setActionMessage(error);
                              })();
                            }}
                            variant="secondary"
                          >
                            {model.isEnabled ? "停用" : "启用"}
                          </Button>
                          <Button
                            disabled={busyId === model.id}
                            onClick={() => void testModel(model)}
                            variant="secondary"
                          >
                            <Wifi aria-hidden="true" />
                            测试
                          </Button>
                          <Button
                            disabled={busyId === model.id}
                            onClick={() =>
                              openConfirm({ kind: "delete", target: model })
                            }
                            variant="secondary"
                          >
                            <Trash2 aria-hidden="true" />
                            删除
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
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
    </section>
  );
}
