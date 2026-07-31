import { Card } from "@point-quest/ui";
import { Boxes, ClipboardCheck, LibraryBig } from "lucide-react";

const modules = [
  { icon: LibraryBig, title: "题库管理", text: "维护英语选择题与答案" },
  { icon: Boxes, title: "商品管理", text: "配置库存、图片与积分价格" },
  { icon: ClipboardCheck, title: "订单管理", text: "处理兑换与领取状态" },
];

export default function AdminPage() {
  return (
    <section className="placeholder-page">
      <div className="page-heading">
        <div>
          <p className="page-kicker">运营概览</p>
          <h1>管理 Point Quest</h1>
          <p>管理功能将在后续阶段逐步接入，当前先提供安全的角色框架。</p>
        </div>
      </div>
      <div className="module-grid">
        {modules.map((module) => {
          const Icon = module.icon;
          return (
            <Card className="module-card" key={module.title}>
              <Icon aria-hidden="true" />
              <h2>{module.title}</h2>
              <p>{module.text}</p>
              <span>即将接入</span>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
