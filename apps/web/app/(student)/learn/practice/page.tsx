import { PracticeSession } from "@/components/practice/practice-session";

export default function PracticePage() {
  return (
    <section className="student-page">
      <div className="page-heading">
        <div>
          <p className="page-kicker">随机练习</p>
          <h1>从未回答的题目开始挑战</h1>
          <p>
            可以在本次队列中自由切换上下题；提交后答案会锁定并显示结果。
          </p>
        </div>
      </div>
      <PracticeSession />
    </section>
  );
}
