"use client";

import type {
  ApiClient,
  ApiComponents,
} from "@point-quest/api-client";
import { Button, Card } from "@point-quest/ui";
import { BookOpenCheck, LoaderCircle, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { AsyncError } from "@/components/feedback/async-error";
import { PaginationControls } from "@/components/pagination-controls";
import { PracticeSession } from "@/components/practice/practice-session";
import { browserApiClient } from "@/lib/api/browser-client";
import { getApiErrorMessage } from "@/lib/api/error-message";

type Schemas = ApiComponents["schemas"];
type AnswerResult = Schemas["AnswerResultDto"];
type WrongQuestion = Schemas["WrongQuestionItemDto"];
type PageMeta = Schemas["PageMetaDto"];
type WrongQuestionApi = Pick<
  ApiClient,
  | "answerQuestion"
  | "getRandomQuestion"
  | "listWrongQuestions"
  | "retryWrongQuestion"
>;

export default function WrongQuestionsPage({
  api = browserApiClient,
}: {
  api?: WrongQuestionApi;
} = {}) {
  const [items, setItems] = useState<WrongQuestion[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [selected, setSelected] = useState<WrongQuestion | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const automaticLoadKey = useRef<string | null>(null);
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
    setError(null);
    try {
      const response = await api.listWrongQuestions({
        page,
        pageSize: 12,
      });
      if (!mounted.current || latestLoadRequest.current !== requestId) return;
      const lastValidPage = Math.max(1, response.meta.totalPages);
      if (
        response.data.length === 0 &&
        response.meta.total > 0 &&
        page > lastValidPage
      ) {
        setPage(lastValidPage);
        return;
      }
      setItems(response.data);
      setMeta(response.meta);
      setSelected(null);
    } catch (loadError) {
      if (!mounted.current || latestLoadRequest.current !== requestId) return;
      setError(getApiErrorMessage(loadError));
    } finally {
      if (mounted.current && latestLoadRequest.current === requestId) {
        setLoading(false);
      }
    }
  }, [api, page]);

  useEffect(() => {
    const loadKey = String(page);
    if (automaticLoadKey.current === loadKey) return;
    automaticLoadKey.current = loadKey;
    void load();
  }, [load, page]);

  function markMastered(questionId: string) {
    setItems((current) =>
      current.filter((item) => item.question.id !== questionId),
    );
  }

  function syncResult(questionId: string, result: AnswerResult) {
    setSelected((current) =>
      current?.question.id === questionId
        ? { ...current, errorCount: result.errorCount }
        : current,
    );
    setItems((current) =>
      current.map((item) =>
        item.question.id === questionId
          ? { ...item, errorCount: result.errorCount }
          : item,
      ),
    );
  }

  function returnToList() {
    setSelected(null);
    automaticLoadKey.current = null;
    void load();
  }

  return (
    <section className={selected ? "student-page" : "student-page list-page"}>
      {selected ? (
        <div className="wrong-practice">
          <div className="wrong-practice__heading">
            <div>
              <p className="page-kicker">正在重练</p>
              <h2>累计答错 {selected.errorCount} 次</h2>
            </div>
            <Button onClick={returnToList} variant="secondary">
              返回错题列表
            </Button>
          </div>
          <PracticeSession
            api={api}
            initialQuestion={selected.question}
            key={selected.question.id}
            mode="WRONG_RETRY"
            onMastered={markMastered}
            onResult={syncResult}
          />
        </div>
      ) : loading ? (
        <Card aria-live="polite" className="page-loading" role="status">
          <LoaderCircle aria-hidden="true" className="spin" />
          正在整理待练错题
        </Card>
      ) : error ? (
        <AsyncError message={error} onRetry={() => void load()} />
      ) : items.length === 0 ? (
        <EmptyState
          action={
            <Link
              className="pq-button pq-button--primary"
              href="/learn/practice"
            >
              继续随机练习
            </Link>
          }
          description="答错且尚未掌握的题目会出现在这里。"
          icon={<BookOpenCheck />}
          title="暂时没有待练错题"
        />
      ) : (
        <div className="paginated-panel">
          <div className="paginated-panel__body">
            <div className="wrong-grid">
              {items.map((item) => (
                <Card className="wrong-card" key={item.question.id}>
                  <div className="wrong-card__count">
                    <RotateCcw aria-hidden="true" />
                    累计答错 {item.errorCount} 次
                  </div>
                  <h2>{item.question.stem}</h2>
                  <p>{item.question.options.length} 个选项 · 单项选择</p>
                  <Button
                    fullWidth
                    onClick={() => setSelected(item)}
                    variant="secondary"
                  >
                    继续练习
                  </Button>
                </Card>
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
    </section>
  );
}
