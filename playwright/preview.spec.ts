import { expect, test } from "./fixtures/auth";

const explanation = "go 的过去式是 went。";
const questions = [
  {
    id: "pw-preview-question-1",
    stem: "Yesterday, Mia ___ to the library.",
  },
  {
    id: "pw-preview-question-2",
    stem: "Last week, Tom ___ to the museum.",
  },
];

test("预习抽题展示题解，预习结束后在范围内答题并获得积分", async ({
  database,
  studentPage,
}) => {
  for (const question of questions) {
    await database.prisma.question.create({
      data: {
        basePoints: 10,
        createdBy: database.admin.id,
        explanation,
        id: question.id,
        stem: question.stem,
      },
    });
  }
  await database.prisma.questionOption.createMany({
    data: questions.flatMap((question) => [
      {
        content: "went",
        id: `${question.id}-correct`,
        isCorrect: true,
        label: "A",
        position: 0,
        questionId: question.id,
      },
      {
        content: "goed",
        id: `${question.id}-wrong`,
        isCorrect: false,
        label: "B",
        position: 1,
        questionId: question.id,
      },
    ]),
  });

  await studentPage.goto("/learn");
  await studentPage
    .getByRole("navigation", { name: "学员主导航" })
    .getByRole("link", { name: "预习" })
    .click();
  await expect(studentPage).toHaveURL(/\/learn\/preview$/);

  await studentPage.getByLabel("自定义数量").fill("2");
  await studentPage.getByRole("button", { name: "开始预习" }).click();

  await expect(
    studentPage.getByText("预习第 1 / 2 题", { exact: true }),
  ).toBeVisible();
  await expect(
    studentPage.getByText("正确答案：A. went", { exact: true }),
  ).toBeVisible();
  await expect(studentPage.getByText(explanation, { exact: true })).toBeVisible();
  await expect(
    studentPage.getByRole("radio", { name: /A.*went/ }),
  ).toBeDisabled();

  await studentPage.getByRole("button", { name: "下一题" }).click();
  await expect(
    studentPage.getByText("预习第 2 / 2 题", { exact: true }),
  ).toBeVisible();

  await studentPage
    .getByRole("button", { name: "完成预习，开始答题" })
    .click();
  await expect(
    studentPage.getByText("答题第 1 / 2 题", { exact: true }),
  ).toBeVisible();

  await studentPage.getByRole("radio", { name: /A.*went/ }).check();
  await studentPage.getByRole("button", { name: "提交答案" }).click();
  await expect(
    studentPage.getByText("回答正确", { exact: true }),
  ).toBeVisible();

  await studentPage.getByRole("button", { name: "下一题" }).click();
  await expect(
    studentPage.getByText("答题第 2 / 2 题", { exact: true }),
  ).toBeVisible();
  await studentPage.getByRole("radio", { name: /A.*went/ }).check();
  await studentPage.getByRole("button", { name: "提交答案" }).click();
  await expect(
    studentPage.getByText("回答正确", { exact: true }),
  ).toBeVisible();

  await studentPage.getByRole("button", { name: "查看本次成绩" }).click();
  await expect(
    studentPage.getByText("本次预习答题完成", { exact: true }),
  ).toBeVisible();
  await expect(
    studentPage.getByText("共 2 题，答对 2 题", { exact: true }),
  ).toBeVisible();
  await expect(
    studentPage.getByText("本次获得 20 积分", { exact: true }),
  ).toBeVisible();
  await expect(studentPage.getByLabel("当前积分 20")).toBeVisible();
});
