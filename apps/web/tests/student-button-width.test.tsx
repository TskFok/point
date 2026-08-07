import { readFileSync } from "node:fs";
import { join } from "node:path";

import { render, screen } from "@testing-library/react";

import LearnPage from "@/app/(student)/learn/page";

const css = readFileSync(join(__dirname, "../app/globals.css"), "utf8");

/** 取第一个匹配选择器块的声明体（不含嵌套 @media） */
function ruleBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`${escaped}\\s*\\{([^}]+)\\}`);
  const match = css.match(re);
  if (!match) {
    throw new Error(`selector not found: ${selector}`);
  }
  return match[1];
}

describe("学生端练习相关按钮宽度", () => {
  it("学习首页「开始随机练习」在进度条之前，避免落入满宽列", async () => {
    const api = {
      getPracticeSummary: jest.fn().mockResolvedValue({
        activeTotal: 20,
        balance: 160,
        firstAnsweredCount: 12,
        masteredWrongCount: 2,
        pendingWrongCount: 3,
        unansweredCount: 8,
      }),
    };

    const { container } = render(<LearnPage api={api} />);
    const start = await screen.findByRole("link", { name: /开始随机练习/ });
    const bar = container.querySelector(".hero-progress__bar");

    expect(bar).not.toBeNull();
    expect(
      start.compareDocumentPosition(bar as Node) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("hero 主按钮与导航提交按钮按内容宽度，不抢满宽", () => {
    const heroButton = ruleBody(".hero-progress > .pq-button");
    expect(heroButton).toMatch(/width:\s*max-content/);
    expect(heroButton).not.toMatch(/(?<!max-)width:\s*100%/);

    const navSubmit = ruleBody(".practice-navigation .practice-submit");
    expect(navSubmit).toMatch(/flex:\s*0\s+1\s+auto/);
    expect(navSubmit).toMatch(/width:\s*max-content/);
    expect(navSubmit).not.toMatch(/flex:\s*1\s+1\s+auto/);
  });
});
