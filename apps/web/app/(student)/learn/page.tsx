import { Card } from "@point-quest/ui";
import { ArrowRight, BookOpen, Sparkles } from "lucide-react";

export default function LearnPage() {
  return (
    <section className="placeholder-page">
      <div className="page-heading">
        <div>
          <p className="page-kicker">每日英语挑战</p>
          <h1>准备好开始今天的学习了吗？</h1>
          <p>答题区将在下一阶段接入，这里已经为你的学习旅程准备好了框架。</p>
        </div>
      </div>
      <Card className="journey-card" tone="primary">
        <span className="journey-card__icon">
          <BookOpen aria-hidden="true" />
        </span>
        <div>
          <p>今日任务</p>
          <h2>完成一组随机选择题</h2>
          <span className="journey-card__hint">
            <Sparkles aria-hidden="true" />
            正确作答即可获得积分
          </span>
        </div>
        <span className="journey-card__action">
          即将开放 <ArrowRight aria-hidden="true" />
        </span>
      </Card>
    </section>
  );
}
