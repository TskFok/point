"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { QuestionForm } from "@/components/admin/question-form";

function returnHref() {
  if (typeof window === "undefined") return "/admin/questions";
  const value = new URLSearchParams(window.location.search).get("returnTo");
  return value?.startsWith("/admin/questions") ? value : "/admin/questions";
}

export default function NewQuestionPage() {
  const backHref = returnHref();
  return (
    <section className="admin-page">
      <div className="page-heading">
        <Link className="back-link" href={backHref}>
          <ArrowLeft aria-hidden="true" />
          返回题库
        </Link>
        <div>
          <p className="page-kicker">题库创作</p>
          <h1>添加英语选择题</h1>
          <p>选项、正确答案和积分会在保存前进行与 API 一致的校验。</p>
        </div>
      </div>
      <QuestionForm mode="create" />
    </section>
  );
}
