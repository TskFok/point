import { readFileSync } from "node:fs";
import { join } from "node:path";

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

describe("紧凑表单控件尺寸（globals.css）", () => {
  it(".pq-button 默认与 .pq-button--sm 同为紧凑规格", () => {
    const button = ruleBody(".pq-button");
    const sm = ruleBody(".pq-button--sm");

    expect(button).toMatch(/min-height:\s*2\.25rem/);
    expect(button).toMatch(/padding:\s*0\.45rem\s+0\.75rem/);
    expect(button).toMatch(/font-size:\s*0\.85rem/);

    expect(sm).toMatch(/min-height:\s*2\.25rem/);
    expect(sm).toMatch(/padding:\s*0\.45rem\s+0\.75rem/);
    expect(sm).toMatch(/font-size:\s*0\.85rem/);
  });

  it(".pq-input 为紧凑规格", () => {
    const input = ruleBody(".pq-input");
    expect(input).toMatch(/min-height:\s*2\.25rem/);
    expect(input).toMatch(/padding:\s*0\.45rem\s+0\.75rem/);
    expect(input).toMatch(/font-size:\s*0\.85rem/);
  });

  it("管理端字段 input/select 为紧凑规格", () => {
    expect(css).toMatch(
      /\.admin-field input,\s*\n\.admin-field select,\s*\n\.admin-field textarea,\s*\n\.input-with-icon\s*\{[^}]*min-height:\s*2\.25rem/,
    );
    expect(css).toMatch(
      /\.admin-field input,\s*\n\.admin-field select,\s*\n\.admin-field textarea\s*\{[^}]*padding:\s*0\.45rem\s+0\.75rem/,
    );
    expect(css).toMatch(
      /\.admin-field input,\s*\n\.admin-field select,\s*\n\.admin-field textarea,\s*\n\.input-with-icon\s*\{[^}]*font-size:\s*0\.85rem/,
    );
  });

  it(".sidebar-logout__button 为紧凑规格，侧栏导航不强制 2.25rem", () => {
    const logout = ruleBody(".sidebar-logout__button");
    expect(logout).toMatch(/min-height:\s*2\.25rem/);

    const nav = ruleBody(".sidebar-nav__link");
    expect(nav).not.toMatch(/min-height:\s*2\.25rem/);
  });

  it("textarea 保留多行最小高度", () => {
    // 专用 textarea 规则（避免匹配到含 textarea 的共享 padding 选择器）
    expect(css).toMatch(
      /\.admin-field textarea\s*\{\s*min-height:\s*7rem/,
    );
  });
});
