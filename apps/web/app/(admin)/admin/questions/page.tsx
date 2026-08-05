"use client";

import type { ApiClient, ApiComponents } from "@point-quest/api-client";
import { Button, Card } from "@point-quest/ui";
import {
  CircleCheck,
  CircleOff,
  Filter,
  LibraryBig,
  LoaderCircle,
  Pencil,
  Plus,
  Search,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { AdminPageHeading } from "@/components/admin/admin-page-heading";
import { QuestionFormDialog } from "@/components/admin/question-form-dialog";
import { Pagination } from "@/components/data/pagination";
import { StatusFilter } from "@/components/data/status-filter";
import { EmptyState } from "@/components/empty-state";
import { AsyncError } from "@/components/feedback/async-error";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { browserApiClient } from "@/lib/api/browser-client";
import { getApiErrorMessage } from "@/lib/api/error-message";
import { ADMIN_QUESTIONS_OPEN_CREATE_KEY } from "@/lib/admin/questions-ui";

type Schemas = ApiComponents["schemas"];
type Question = Schemas["AdminQuestionDto"];
type PageMeta = Schemas["PageMetaDto"];
type QuestionsApi = Pick<
  ApiClient,
  | "createAdminQuestion"
  | "getAdminQuestion"
  | "listAdminQuestions"
  | "updateAdminQuestion"
>;
type Filters = { search: string; isActive: string };
type ConfirmAction = { kind: "disable"; target: Question };

const emptyFilters: Filters = { search: "", isActive: "" };

function readUrlState(): { filters: Filters; page: number } {
  if (typeof window === "undefined") return { filters: emptyFilters, page: 1 };
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

export default function AdminQuestionsPage({
  api = browserApiClient,
}: {
  api?: QuestionsApi;
} = {}) {
  const [initial] = useState(readUrlState);
  const [filters, setFilters] = useState(initial.filters);
  const [appliedFilters, setAppliedFilters] = useState(initial.filters);
  const [page, setPage] = useState(initial.page);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [mutatingId, setMutatingId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(
    null,
  );
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [editing, setEditing] = useState<"create" | { id: string } | null>(
    null,
  );
  const automaticLoadKey = useRef<string | null>(null);
  const mounted = useRef(true);
  const latestRequest = useRef(0);

  useEffect(() => {
    mounted.current = true;
    if (sessionStorage.getItem(ADMIN_QUESTIONS_OPEN_CREATE_KEY) === "1") {
      sessionStorage.removeItem(ADMIN_QUESTIONS_OPEN_CREATE_KEY);
      queueMicrotask(() => {
        if (mounted.current) setEditing("create");
      });
    }
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    const requestId = latestRequest.current + 1;
    latestRequest.current = requestId;
    setLoading(true);
    setLoadError(null);
    try {
      const response = await api.listAdminQuestions({
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
      const lastPage = Math.max(1, response.meta.totalPages);
      if (page > lastPage) {
        setPage(lastPage);
        return;
      }
      setQuestions(response.data);
      setMeta(response.meta);
    } catch (error) {
      if (!mounted.current || latestRequest.current !== requestId) return;
      setLoadError(getApiErrorMessage(error));
    } finally {
      if (mounted.current && latestRequest.current === requestId) {
        setLoading(false);
      }
    }
  }, [api, appliedFilters, page]);

  useEffect(() => {
    const loadKey = JSON.stringify({ appliedFilters, page });
    if (automaticLoadKey.current === loadKey) return;
    automaticLoadKey.current = loadKey;
    writeUrl(appliedFilters, page);
    void load();
  }, [appliedFilters, load, page]);

  async function toggleStatus(question: Question): Promise<string | null> {
    if (mutatingId) return "请等待当前操作完成";
    setMutatingId(question.id);
    setMutationError(null);
    try {
      await api.updateAdminQuestion(question.id, {
        isActive: !question.isActive,
      });
      await load();
      return null;
    } catch (error) {
      return getApiErrorMessage(error);
    } finally {
      setMutatingId(null);
    }
  }

  function openConfirm(action: ConfirmAction) {
    setConfirmError(null);
    setConfirmAction(action);
  }

  async function handleConfirm() {
    if (!confirmAction || mutatingId) return;
    setConfirmError(null);
    const error = await toggleStatus(confirmAction.target);
    if (!mounted.current) return;
    if (error) {
      setConfirmError(error);
      return;
    }
    setConfirmAction(null);
  }

  return (
    <section className="admin-page">
      <AdminPageHeading
        description="维护题干、答案、解析和基础积分，控制题目是否进入练习池。"
        kicker="英语内容中心"
        title="题库管理"
      >
        <Button onClick={() => setEditing("create")}>
          <Plus aria-hidden="true" />
          添加题目
        </Button>
      </AdminPageHeading>

      {editing ? (
        <QuestionFormDialog
          api={api}
          mode={editing === "create" ? "create" : "edit"}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
          questionId={editing === "create" ? undefined : editing.id}
        />
      ) : null}

      {confirmAction ? (
        <ConfirmDialog
          cancelLabel="取消"
          confirmLabel="停用题目"
          confirmVariant="danger"
          description="停用后该题目将不再进入练习池。"
          error={confirmError}
          onCancel={() => {
            if (!mutatingId) {
              setConfirmAction(null);
              setConfirmError(null);
            }
          }}
          onConfirm={() => void handleConfirm()}
          pending={mutatingId === confirmAction.target.id}
          title="确认停用该题目？"
        />
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
            <span>搜索题目</span>
            <div className="input-with-icon">
              <Search aria-hidden="true" />
              <input
                aria-label="搜索题目"
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    search: event.target.value,
                  }))
                }
                placeholder="搜索题干或解析"
                value={filters.search}
              />
            </div>
          </label>
          <StatusFilter
            label="启用状态"
            onChange={(isActive) =>
              setFilters((current) => ({ ...current, isActive }))
            }
            options={[
              { label: "已启用", value: "true" },
              { label: "已停用", value: "false" },
            ]}
            value={filters.isActive}
          />
          <Button disabled={loading} type="submit">
            <Filter aria-hidden="true" />
            应用筛选
          </Button>
        </form>
      </Card>

      {mutationError ? (
        <p className="admin-form__errors" role="alert">
          {mutationError}
        </p>
      ) : null}

      {loading ? (
        <Card aria-live="polite" className="page-loading" role="status">
          <LoaderCircle aria-hidden="true" className="spin" />
          正在加载题库
        </Card>
      ) : loadError ? (
        <AsyncError message={loadError} onRetry={() => void load()} />
      ) : questions.length === 0 ? (
        <EmptyState
          action={
            <Button onClick={() => setEditing("create")}>
              添加第一道题目
            </Button>
          }
          description="调整筛选条件，或创建一道新的英语选择题。"
          icon={<LibraryBig />}
          title="没有匹配的题目"
        />
      ) : (
        <>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <caption className="sr-only">管理员题库列表</caption>
              <thead>
                <tr>
                  <th>题干</th>
                  <th>选项</th>
                  <th>基础积分</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {questions.map((question) => (
                  <tr key={question.id}>
                    <td data-label="题干">
                      <strong>{question.stem}</strong>
                      <small>{question.explanation}</small>
                    </td>
                    <td data-label="选项">{question.options.length} 项</td>
                    <td data-label="基础积分">{question.basePoints} 分</td>
                    <td data-label="状态">
                      <span
                        className={`admin-status admin-status--${
                          question.isActive ? "active" : "inactive"
                        }`}
                      >
                        {question.isActive ? (
                          <CircleCheck aria-label="已启用状态图标" role="img" />
                        ) : (
                          <CircleOff aria-label="已停用状态图标" role="img" />
                        )}
                        {question.isActive ? "已启用" : "已停用"}
                      </span>
                    </td>
                    <td data-label="操作">
                      <div className="admin-table__actions">
                        <Button
                          onClick={() => setEditing({ id: question.id })}
                          variant="secondary"
                        >
                          <Pencil aria-hidden="true" />
                          编辑题目
                        </Button>
                        <Button
                          disabled={
                            mutatingId !== null ||
                            (question.hasAttempts && !question.isActive)
                          }
                          onClick={() => {
                            if (question.isActive) {
                              openConfirm({
                                kind: "disable",
                                target: question,
                              });
                              return;
                            }
                            void (async () => {
                              const error = await toggleStatus(question);
                              if (error) setMutationError(error);
                            })();
                          }}
                          variant="secondary"
                        >
                          {mutatingId === question.id ? (
                            <LoaderCircle aria-hidden="true" className="spin" />
                          ) : question.isActive ? (
                            <CircleOff aria-hidden="true" />
                          ) : (
                            <CircleCheck aria-hidden="true" />
                          )}
                          {question.hasAttempts && !question.isActive
                            ? "已有记录不可启用"
                            : question.isActive
                              ? "停用题目"
                              : "启用题目"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
