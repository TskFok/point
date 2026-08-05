import type { Page } from "playwright/test";

import { expect, test } from "./fixtures/auth";
import type { PlaywrightDatabase } from "./fixtures/database";

const viewports = [
  { height: 812, width: 375 },
  { height: 1024, width: 768 },
  { height: 900, width: 1024 },
  { height: 1000, width: 1440 },
] as const;

async function seedResponsiveData(database: PlaywrightDatabase): Promise<void> {
  await database.prisma.user.update({
    data: { pointsBalance: 100 },
    where: { username: database.student.username },
  });
  await database.prisma.question.create({
    data: {
      basePoints: 10,
      createdBy: database.admin.id,
      explanation: "Responsive E2E explanation.",
      id: "pw-a11y-question",
      stem: "Choose the accessible correct answer.",
    },
  });
  await database.prisma.questionOption.createMany({
    data: [
      {
        content: "accessible",
        id: "pw-a11y-question-correct",
        isCorrect: true,
        label: "A",
        position: 0,
        questionId: "pw-a11y-question",
      },
      {
        content: "inaccessible",
        id: "pw-a11y-question-wrong",
        isCorrect: false,
        label: "B",
        position: 1,
        questionId: "pw-a11y-question",
      },
    ],
  });
  await database.prisma.product.create({
    data: {
      description: "用于验证图片替代文本与固定尺寸。",
      id: "pw-a11y-product",
      imageKey: "seed/products/a11y.png",
      name: "PW A11y 单词卡",
      pointsCost: 20,
      stock: 2,
    },
  });
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    )
    .toBe(true);
}

async function expectFixedNavigationDoesNotCoverMain(
  page: Page,
): Promise<void> {
  const geometry = await page.evaluate(() => {
    const main = document.querySelector<HTMLElement>(".app-content");
    const sidebar = document.querySelector<HTMLElement>(".app-sidebar");
    if (!main || !sidebar) {
      throw new Error("应用框架缺少导航或主内容");
    }
    if (document.querySelector(".app-header")) {
      throw new Error("不应再渲染拥挤的 app-header");
    }
    const mainRect = main.getBoundingClientRect();
    const sidebarRect = sidebar.getBoundingClientRect();
    return {
      mainLeft: mainRect.left,
      sidebarDisplay: getComputedStyle(sidebar).display,
      sidebarRight: sidebarRect.right,
    };
  });

  if (geometry.sidebarDisplay !== "none") {
    expect(geometry.mainLeft).toBeGreaterThanOrEqual(geometry.sidebarRight - 1);
  }
}

for (const viewport of viewports) {
  test(`${viewport.width}px 下练习与商城无横向滚动且支持键盘和减少动画`, async ({
    database,
    studentPage,
  }) => {
    await studentPage.setViewportSize(viewport);
    await seedResponsiveData(database);

    await studentPage.goto("/learn/practice");
    await expectNoHorizontalOverflow(studentPage);
    await expectFixedNavigationDoesNotCoverMain(studentPage);

    const correctAnswer = studentPage.getByRole("radio", {
      name: /^A accessible$/,
    });
    await correctAnswer.focus();
    await correctAnswer.press("Space");
    await expect(correctAnswer).toBeChecked();
    const outline = await correctAnswer.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        style: style.outlineStyle,
        width: Number.parseFloat(style.outlineWidth),
      };
    });
    expect(outline.style).not.toBe("none");
    expect(outline.width).toBeGreaterThan(0);

    const submit = studentPage.getByRole("button", { name: "提交答案" });
    await submit.focus();
    await submit.press("Enter");
    const status = studentPage.getByRole("status").filter({
      hasText: "回答正确",
    });
    await expect(status).toBeVisible();
    await expect(status.locator("svg")).toHaveCount(3);

    await studentPage.emulateMedia({ reducedMotion: "reduce" });
    const visibleNavigationLink = studentPage
      .locator(".sidebar-nav__link:visible, .mobile-bottom-nav__link:visible")
      .first();
    const reducedDurations = await visibleNavigationLink.evaluate((element) => {
      const style = getComputedStyle(element);
      const seconds = (value: string) =>
        value.endsWith("ms")
          ? Number.parseFloat(value) / 1_000
          : Number.parseFloat(value) || 0;
      return {
        animations: style.animationDuration.split(",").map(seconds),
        iterations: style.animationIterationCount.split(","),
        transitions: style.transitionDuration.split(",").map(seconds),
      };
    });
    expect(
      reducedDurations.animations.every((duration) => duration <= 0.001),
    ).toBe(true);
    expect(
      reducedDurations.transitions.every((duration) => duration <= 0.001),
    ).toBe(true);
    expect(reducedDurations.iterations).not.toContain("infinite");

    await studentPage.goto("/learn/store");
    await expectNoHorizontalOverflow(studentPage);
    const productImage = studentPage.getByRole("img", {
      name: "PW A11y 单词卡",
    });
    await expect(productImage).toBeVisible();
    await expect(productImage).toHaveAttribute("width", "800");
    await expect(productImage).toHaveAttribute("height", "600");

    if (viewport.width === 375) {
      const redeemButton = studentPage.getByRole("button", {
        name: "兑换 20 积分",
      });
      await redeemButton.focus();
      await redeemButton.press("Enter");
      const dialog = studentPage.getByRole("dialog", {
        name: "确认兑换商品",
      });
      await expect(dialog).toBeVisible();
      await expect
        .poll(() =>
          dialog.evaluate((element) =>
            element.contains(document.activeElement),
          ),
        )
        .toBe(true);
      await studentPage.keyboard.press("Tab");
      await expect
        .poll(() =>
          dialog.evaluate((element) =>
            element.contains(document.activeElement),
          ),
        )
        .toBe(true);
      await studentPage.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(redeemButton).toBeFocused();
    }
  });
}

test("375px 下管理员抽屉与分页可用键盘操作且状态同时有文字和图标", async ({
  adminPage,
  database,
}) => {
  await database.prisma.product.createMany({
    data: Array.from({ length: 21 }, (_, index) => ({
      description: `响应式分页商品 ${index + 1}`,
      id: `pw-a11y-admin-product-${String(index + 1).padStart(2, "0")}`,
      imageKey: "seed/products/a11y-admin.png",
      name: `PW 管理商品 ${String(index + 1).padStart(2, "0")}`,
      pointsCost: 10,
      stock: 1,
    })),
  });
  await adminPage.setViewportSize({ height: 812, width: 375 });
  await adminPage.goto("/admin/products");
  await expectNoHorizontalOverflow(adminPage);
  await expectFixedNavigationDoesNotCoverMain(adminPage);

  const menuButton = adminPage.getByRole("button", {
    name: "打开管理员菜单",
  });
  await menuButton.focus();
  await menuButton.press("Enter");
  const drawer = adminPage.getByRole("dialog", { name: "管理菜单" });
  await expect(drawer).toBeVisible();
  await expect(
    drawer.getByRole("button", { name: "关闭管理员菜单" }),
  ).toBeFocused();
  await adminPage.keyboard.press("Shift+Tab");
  await expect
    .poll(() =>
      drawer.evaluate((element) => element.contains(document.activeElement)),
    )
    .toBe(true);
  await adminPage.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(menuButton).toBeFocused();

  const firstProductCard = adminPage.locator(".admin-product-card").first();
  await expect(
    firstProductCard.getByRole("img", { name: "已上架状态图标" }),
  ).toBeVisible();
  await expect(
    firstProductCard.getByText("已上架", { exact: true }),
  ).toBeVisible();

  const nextPage = adminPage.getByRole("button", { name: "下一页" });
  await nextPage.focus();
  await nextPage.press("Enter");
  await expect(
    adminPage.getByText("第 2 / 2 页", { exact: true }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(adminPage);
});
