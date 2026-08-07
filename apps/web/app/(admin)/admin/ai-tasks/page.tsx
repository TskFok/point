"use client";

import type { ApiClient, ApiComponents } from "@point-quest/api-client";
import { Button, Card } from "@point-quest/ui";
import {
  CircleCheck,
  CircleOff,
  Filter,
  History,
  LoaderCircle,
  Pencil,
  Play,
  Plus,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { AiTaskForm } from "@/components/admin/ai-task-form";
import { Pagination } from "@/components/data/pagination";
import { StatusFilter } from "@/components/data/status-filter";
import { EmptyState } from "@/components/empty-state";
import { AsyncError } from "@/components/feedback/async-error";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FormDialog } from "@/components/ui/form-dialog";
import { useConfirmAction } from "@/hooks/use-confirm-action";
import { browserApiClient } from "@/lib/api/browser-client";
import { getApiErrorMessage } from "@/lib/api/error-message";
import { LANG_CODE_LABELS, type LangCode } from "@/lib/lang-code";

type Schemas = ApiComponents["schemas"];
type AiTask = Schemas["AiTaskDto"];
type AiTaskRun = Schemas["AiTaskRunDto"];
type PageMeta = Schemas["PageMetaDto"];
type AiTasksApi = Pick<
  ApiClient,
  | "listAdminAiTasks"
  | "createAdminAiTask"
  | "updateAdminAiTask"
  | "deleteAdminAiTask"
  | "runAdminAiTask"
  | "listAdminAiTaskRuns"
  | "listAdminAiModels"
>;

type Filters = { isEnabled: string };

type ConfirmAction =
  | { kind: "delete"; target: AiTask }
  | { kind: "disable"; target: AiTask }
  | { kind: "run"; target: AiTask };

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

export default function AdminAiTasksPage({
  api = browserApiClient,
}: {
  api?: AiTasksApi;
} = {}) {
  const [initial] = useState(readUrlState);
  const [filters, setFilters] = useState(initial.filters);
  const [appliedFilters, setAppliedFilters] = useState(initial.filters);
  const [page, setPage] = useState(initial.page);
  const [tasks, setTasks] = useState<AiTask[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AiTask | "create" | null>(null);
  const [formPending, setFormPending] = useState(false);
  const [runsFor, setRunsFor] = useState<AiTask | null>(null);
  const [runs, setRuns] = useState<AiTaskRun[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [models, setModels] = useState<Array<{ id: string; name: string }>>(
    [],
  );
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

  useEffect(() => {
    void api
      .listAdminAiModels({ isEnabled: true, page: 1, pageSize: 100 })
      .then((response) => {
        if (!mounted.current) return;
        setModels(
          response.data.map((model) => ({ id: model.id, name: model.name })),
        );
      })
      .catch(() => {
        if (!mounted.current) return;
        setModels([]);
      });
  }, [api]);

  const load = useCallback(async () => {
    const requestId = latestRequest.current + 1;
    latestRequest.current = requestId;
    setLoading(true);
    setError(null);
    try {
      const response = await api.listAdminAiTasks({
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
      setTasks(response.data);
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

  async function loadRuns(task: AiTask) {
    setRunsFor(task);
    setRunsLoading(true);
    setRuns([]);
    try {
      const response = await api.listAdminAiTaskRuns(task.id, {
        page: 1,
        pageSize: 20,
      });
      if (!mounted.current) return;
      setRuns(response.data);
    } catch (caught) {
      if (!mounted.current) return;
      setActionMessage(getApiErrorMessage(caught));
    } finally {
      if (mounted.current) setRunsLoading(false);
    }
  }

  function handleSaved() {
    setFormPending(false);
    setEditing(null);
    setActionMessage("任务已保存");
    void load();
  }

  async function toggleEnabled(task: AiTask): Promise<string | null> {
    if (busyId) return "请等待当前操作完成";
    setBusyId(task.id);
    setActionMessage(null);
    try {
      await api.updateAdminAiTask(task.id, { isEnabled: !task.isEnabled });
      setActionMessage(task.isEnabled ? "已停用自动调度" : "已启用自动调度");
      await load();
      return null;
    } catch (caught) {
      return getApiErrorMessage(caught);
    } finally {
      setBusyId(null);
    }
  }

  async function removeTask(task: AiTask): Promise<string | null> {
    if (busyId) return "请等待当前操作完成";
    setBusyId(task.id);
    setActionMessage(null);
    try {
      await api.deleteAdminAiTask(task.id);
      setActionMessage("已删除");
      if (runsFor?.id === task.id) setRunsFor(null);
      await load();
      return null;
    } catch (caught) {
      return getApiErrorMessage(caught);
    } finally {
      setBusyId(null);
    }
  }

  async function runTask(task: AiTask): Promise<string | null> {
    if (busyId) return "请等待当前操作完成";
    setBusyId(task.id);
    setActionMessage(null);
    try {
      const result = await api.runAdminAiTask(task.id);
      setActionMessage(
        result.status === "SUCCESS"
          ? `「${task.name}」执行成功，生成 ${result.questionsCreated} 题`
          : `「${task.name}」执行失败：${result.errorMessage ?? "未知错误"}`,
      );
      await load();
      if (runsFor?.id === task.id) {
        await loadRuns(task);
      }
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
      execute: async (action) => {
        if (action.kind === "delete") return removeTask(action.target);
        if (action.kind === "disable") return toggleEnabled(action.target);
        return runTask(action.target);
      },
    });

  const confirmPresentation = confirmAction
    ? confirmAction.kind === "delete"
      ? {
          title: `确认删除任务「${confirmAction.target.name}」？`,
          description: "此操作不可撤销。",
          confirmLabel: "删除",
          confirmVariant: "danger" as const,
        }
      : confirmAction.kind === "disable"
        ? {
            title: `确认停用任务「${confirmAction.target.name}」？`,
            description: "停用后将不再按计划自动出题。",
            confirmLabel: "停用",
            confirmVariant: "danger" as const,
          }
        : {
            title: `确认立即执行「${confirmAction.target.name}」？`,
            description: "将立即调用 AI 生成题目，可能产生费用与耗时。",
            confirmLabel: "立即执行",
            confirmVariant: "primary" as const,
          }
    : null;

  return (
    <section className="admin-page list-page">
      <div className="list-page__chrome">
        <Card className="admin-filter-card">
          <div className="admin-filter-grid">
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
            <Button
              onClick={() => {
                setAppliedFilters(filters);
                setPage(1);
              }}
              type="button"
            >
              <Filter aria-hidden="true" />
              筛选
            </Button>
            <Button
              onClick={() => {
                setEditing("create");
                setActionMessage(null);
              }}
              type="button"
            >
              <Plus aria-hidden="true" />
              新建任务
            </Button>
          </div>
        </Card>

        {actionMessage ? (
          <p className="success-banner" role="status">
            {actionMessage}
          </p>
        ) : null}
      </div>

      {confirmAction && confirmPresentation ? (
        <ConfirmDialog
          cancelLabel="取消"
          confirmLabel={confirmPresentation.confirmLabel}
          confirmVariant={confirmPresentation.confirmVariant}
          description={confirmPresentation.description}
          error={confirmError}
          onCancel={closeConfirm}
          onConfirm={() => void handleConfirm()}
          pending={busyId === confirmAction.target.id}
          title={confirmPresentation.title}
        />
      ) : null}

      {editing ? (
        <FormDialog
          onClose={() => {
            if (!formPending) setEditing(null);
          }}
          pending={formPending}
          title={editing === "create" ? "新建 AI 任务" : "编辑 AI 任务"}
        >
          <AiTaskForm
            api={api}
            initialTask={editing === "create" ? undefined : editing}
            key={editing === "create" ? "create" : editing.id}
            mode={editing === "create" ? "create" : "edit"}
            models={
              editing === "create"
                ? models
                : [
                    ...models,
                    ...(models.some((m) => m.id === editing.aiModelConfigId)
                      ? []
                      : [
                          {
                            id: editing.aiModelConfigId,
                            name: editing.aiModelName,
                          },
                        ]),
                  ]
            }
            onPendingChange={setFormPending}
            onSaved={handleSaved}
          />
        </FormDialog>
      ) : null}

      {runsFor ? (
        <FormDialog
          onClose={() => setRunsFor(null)}
          title={`执行记录 · ${runsFor.name}`}
        >
          {runsLoading ? (
            <p>
              <LoaderCircle aria-hidden="true" className="spin" /> 加载中
            </p>
          ) : runs.length === 0 ? (
            <EmptyState
              title="暂无执行记录"
              description="立即执行或等待 crontab 触发后会出现记录。"
            />
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>触发</th>
                    <th>状态</th>
                    <th>开始</th>
                    <th>结束</th>
                    <th>题数</th>
                    <th>游标</th>
                    <th>错误</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr key={run.id}>
                      <td>{run.trigger}</td>
                      <td>{run.status}</td>
                      <td>{formatter.format(new Date(run.startedAt))}</td>
                      <td>
                        {run.finishedAt
                          ? formatter.format(new Date(run.finishedAt))
                          : "—"}
                      </td>
                      <td>{run.questionsCreated}</td>
                      <td>
                        {run.lastEntryIdBefore ?? "∅"} →{" "}
                        {run.lastEntryIdAfter ?? "∅"}
                      </td>
                      <td className="admin-table__error">
                        {run.errorMessage ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </FormDialog>
      ) : null}

      {loading ? (
        <p>
          <LoaderCircle aria-hidden="true" className="spin" /> 加载中
        </p>
      ) : null}
      {error ? <AsyncError message={error} onRetry={() => void load()} /> : null}
      {!loading && !error && tasks.length === 0 ? (
        <EmptyState
          title="还没有 AI 任务"
          description="创建任务后可立即执行，或按 crontab 自动出题。"
        />
      ) : null}

      {!loading && !error && tasks.length > 0 ? (
        <div className="paginated-panel">
          <div className="paginated-panel__body">
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>名称</th>
                    <th>模型</th>
                    <th>语言</th>
                    <th>数量</th>
                    <th>crontab</th>
                    <th>游标</th>
                    <th>连续失败</th>
                    <th>启用</th>
                    <th>最近执行</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((task) => (
                    <tr key={task.id}>
                      <td>{task.name}</td>
                      <td>{task.aiModelName}</td>
                      <td>
                        {LANG_CODE_LABELS[task.langCode as LangCode] ??
                          task.langCode}
                      </td>
                      <td>
                        {task.questionCount} 题 / {task.optionCount} 选项 /{" "}
                        {task.basePoints} 分
                      </td>
                      <td>
                        <code>{task.cronExpression}</code>
                      </td>
                      <td>{task.lastEntryId ?? "—"}</td>
                      <td>
                        {task.maxConsecutiveFailures > 0
                          ? `${task.consecutiveFailureCount}/${task.maxConsecutiveFailures}`
                          : "未启用"}
                      </td>
                      <td>{task.isEnabled ? "已启用" : "未启用"}</td>
                      <td>
                        {task.latestRun
                          ? `${task.latestRun.status} · ${formatter.format(new Date(task.latestRun.startedAt))}`
                          : "—"}
                      </td>
                      <td>
                        <div className="admin-table__actions">
                          <Button
                            disabled={busyId === task.id}
                            onClick={() => {
                              setEditing(task);
                              setActionMessage(null);
                            }}
                            type="button"
                            variant="secondary"
                          >
                            <Pencil aria-hidden="true" />
                            编辑
                          </Button>
                          <Button
                            disabled={busyId === task.id}
                            onClick={() => {
                              if (task.isEnabled) {
                                openConfirm({
                                  kind: "disable",
                                  target: task,
                                });
                                return;
                              }
                              void (async () => {
                                const error = await toggleEnabled(task);
                                if (error) setActionMessage(error);
                              })();
                            }}
                            type="button"
                            variant="secondary"
                          >
                            {task.isEnabled ? (
                              <CircleOff aria-hidden="true" />
                            ) : (
                              <CircleCheck aria-hidden="true" />
                            )}
                            {task.isEnabled ? "停用" : "启用"}
                          </Button>
                          <Button
                            disabled={busyId === task.id}
                            onClick={() =>
                              openConfirm({ kind: "run", target: task })
                            }
                            type="button"
                            variant="secondary"
                          >
                            {busyId === task.id ? (
                              <LoaderCircle
                                aria-hidden="true"
                                className="spin"
                              />
                            ) : (
                              <Play aria-hidden="true" />
                            )}
                            立即执行
                          </Button>
                          <Button
                            disabled={busyId === task.id}
                            onClick={() => void loadRuns(task)}
                            type="button"
                            variant="secondary"
                          >
                            <History aria-hidden="true" />
                            执行记录
                          </Button>
                          <Button
                            disabled={busyId === task.id}
                            onClick={() =>
                              openConfirm({ kind: "delete", target: task })
                            }
                            type="button"
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
      ) : null}
    </section>
  );
}
