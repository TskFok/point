import { expect, test } from "./fixtures/auth";

const question = {
  correctAnswer: "has",
  explanation: "The singular subject she takes has.",
  stem: "She ___ finished her homework.",
  wrongAnswer: "have",
};

test("管理员添加题目，学员首次答对获得倍率积分", async ({
  adminPage,
  studentPage,
}) => {
  await adminPage.goto("/admin/questions");
  await adminPage.getByRole("button", { name: "添加题目" }).click();
  await expect(
    adminPage.getByRole("dialog", { name: "添加英语选择题" }),
  ).toBeVisible();
  await adminPage.getByLabel("题干").fill(question.stem);
  await adminPage.getByLabel("题目解析").fill(question.explanation);
  await adminPage.getByLabel("基础积分").fill("10");
  await adminPage.getByLabel("选项 A 内容").fill(question.correctAnswer);
  await adminPage.getByLabel("选项 B 内容").fill(question.wrongAnswer);
  await adminPage.getByLabel("将选项 A 设为正确答案").check();
  await adminPage.getByRole("button", { name: "保存题目" }).click();
  await expect(
    adminPage.getByText("题目已保存", { exact: true }),
  ).toBeVisible();

  await adminPage.goto("/admin/points");
  await adminPage.getByLabel("积分倍率").fill("2");
  await adminPage.getByRole("button", { name: "保存倍率" }).click();
  await expect(
    adminPage.getByText("倍率已更新为 2×", { exact: true }),
  ).toBeVisible();

  await studentPage.goto("/learn/practice");
  await expect(studentPage.getByLabel("当前积分 0")).toBeVisible();
  await studentPage
    .getByRole("radio", { name: new RegExp(question.correctAnswer) })
    .check();
  await studentPage.getByRole("button", { name: "提交答案" }).click();

  await expect(
    studentPage.getByText("+20 积分", { exact: true }),
  ).toBeVisible();
});
