import { PreviewSession } from "@/components/preview/preview-session";

export default function PreviewPage() {
  return (
    <section className="student-page">
      <div className="page-heading">
        <div>
          <p className="page-kicker">预习新题</p>
          <h1>先看题解学习，再答题赚积分</h1>
          <p>
            随机抽取一批未作答的新题，预习时可以查看正确答案和解析；预习结束后在本次范围内作答，答对正常获得积分。
          </p>
        </div>
      </div>
      <PreviewSession />
    </section>
  );
}
