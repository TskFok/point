import { expect, test } from "./fixtures/auth";

const product = {
  cost: 40,
  description: "Playwright 端到端测试专用英语学习奖励。",
  name: "PW Store 英语徽章",
  stock: 2,
};

const validPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

async function redeemProduct(
  studentPage: import("playwright/test").Page,
): Promise<void> {
  await studentPage.goto("/learn/store");
  const productCard = studentPage.locator(".product-card", {
    hasText: product.name,
  });
  await productCard
    .getByRole("button", { name: `兑换 ${product.cost} 积分` })
    .click();
  const dialog = studentPage.getByRole("dialog", { name: "确认兑换商品" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "确认兑换" }).click();
  await expect(
    studentPage.getByText("兑换成功，订单已生成", { exact: true }),
  ).toBeVisible();
}

test("上传商品并兑换两次，管理员完成一单并取消另一单退款", async ({
  adminPage,
  database,
  studentPage,
}) => {
  await database.prisma.user.update({
    data: { pointsBalance: 100 },
    where: { username: database.student.username },
  });

  await adminPage.goto("/admin/products");
  await adminPage.getByRole("button", { name: "添加商品" }).click();
  await adminPage.getByLabel("商品名称").fill(product.name);
  await adminPage.getByLabel("库存数量").fill(String(product.stock));
  await adminPage.getByLabel("花费积分").fill(String(product.cost));
  await adminPage.getByLabel("商品描述").fill(product.description);
  await adminPage.getByLabel("商品图片").setInputFiles({
    buffer: validPng,
    mimeType: "image/png",
    name: "pw-store-product.png",
  });
  await adminPage.getByRole("button", { name: "保存商品" }).click();
  await expect(
    adminPage.getByRole("heading", { name: product.name }),
  ).toBeVisible();
  await expect(
    adminPage.getByRole("img", { name: product.name }),
  ).toBeVisible();

  await redeemProduct(studentPage);
  await studentPage.goto("/learn/orders");
  await expect(studentPage.getByText("待领取", { exact: true })).toBeVisible();
  await expect(
    studentPage.getByRole("img", { name: "待领取状态图标" }),
  ).toBeVisible();

  await redeemProduct(studentPage);

  await adminPage.goto("/admin/orders");
  const productRows = adminPage.locator("tbody tr", {
    hasText: product.name,
  });
  await expect(productRows).toHaveCount(2);

  const rowToComplete = productRows
    .filter({
      has: adminPage.getByRole("button", { name: "完成订单" }),
    })
    .first();
  await rowToComplete.getByRole("button", { name: "完成订单" }).click();
  const completeDialog = adminPage.getByRole("dialog", {
    name: "确认完成订单",
  });
  await completeDialog.getByRole("button", { name: "确认完成订单" }).click();
  await expect(
    adminPage.getByText("订单已完成，可交付商品", { exact: true }),
  ).toBeVisible();

  const rowToCancel = adminPage.locator("tbody tr", {
    has: adminPage.getByRole("button", { name: "取消订单" }),
    hasText: product.name,
  });
  await rowToCancel.getByRole("button", { name: "取消订单" }).click();
  const cancelDialog = adminPage.getByRole("dialog", {
    name: "确认取消订单",
  });
  await cancelDialog.getByRole("button", { name: "确认取消并退款" }).click();
  await expect(
    adminPage.getByText("订单已取消，积分与库存已退回", { exact: true }),
  ).toBeVisible();

  await studentPage.goto("/learn/orders");
  await expect(studentPage.getByText("已完成", { exact: true })).toBeVisible();
  await expect(studentPage.getByText("已取消", { exact: true })).toBeVisible();
  await expect(
    studentPage.getByRole("img", { name: "已完成状态图标" }),
  ).toBeVisible();
  await expect(
    studentPage.getByRole("img", { name: "已取消状态图标" }),
  ).toBeVisible();

  await studentPage.goto("/learn/store");
  await expect(studentPage.getByLabel("当前可用积分 60")).toBeVisible();
  await expect(
    studentPage
      .locator(".product-card", { hasText: product.name })
      .getByText("库存 1", { exact: true }),
  ).toBeVisible();
});
