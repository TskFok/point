import { expect, test } from "./fixtures/auth";

const question = {
  correctAnswer: "went",
  explanation: "The past tense of go is went.",
  id: "pw-wrong-question",
  stem: "Yesterday, Mia ___ to the library.",
  wrongAnswer: "goed",
};

test("首次答错累计错误次数，错题重练掌握且不增加积分", async ({
  database,
  studentPage,
}) => {
  await database.prisma.question.create({
    data: {
      basePoints: 10,
      createdBy: database.admin.id,
      explanation: question.explanation,
      id: question.id,
      stem: question.stem,
    },
  });
  await database.prisma.questionOption.createMany({
    data: [
      {
        content: question.correctAnswer,
        id: `${question.id}-correct`,
        isCorrect: true,
        label: "A",
        position: 0,
        questionId: question.id,
      },
      {
        content: question.wrongAnswer,
        id: `${question.id}-wrong`,
        isCorrect: false,
        label: "B",
        position: 1,
        questionId: question.id,
      },
    ],
  });

  await studentPage.goto("/learn/practice");
  await studentPage
    .getByRole("radio", { name: new RegExp(question.wrongAnswer) })
    .check();
  await studentPage.getByRole("button", { name: "提交答案" }).click();
  await expect(
    studentPage.getByText("回答错误", { exact: true }),
  ).toBeVisible();
  await expect(
    studentPage.getByText(`正确答案：A. ${question.correctAnswer}`, {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    studentPage.getByText("累计答错 1 次", { exact: true }),
  ).toBeVisible();

  await studentPage.goto("/learn/wrong-questions");
  await expect(
    studentPage.getByText("累计答错 1 次", { exact: true }),
  ).toBeVisible();
  await studentPage.getByRole("button", { name: "继续练习" }).click();
  await studentPage
    .getByRole("radio", { name: new RegExp(question.wrongAnswer) })
    .check();
  await studentPage.getByRole("button", { name: "提交重练答案" }).click();
  await expect(
    studentPage.getByRole("status").getByText("累计答错 2 次", { exact: true }),
  ).toBeVisible();
  await expect(
    studentPage.getByText("错题重练不奖励积分", { exact: true }),
  ).toBeVisible();

  await studentPage.getByRole("button", { name: "返回错题列表" }).click();
  await expect(
    studentPage.getByText("累计答错 2 次", { exact: true }),
  ).toBeVisible();
  await studentPage.getByRole("button", { name: "继续练习" }).click();
  await studentPage
    .getByRole("radio", { name: new RegExp(question.correctAnswer) })
    .check();
  await studentPage.getByRole("button", { name: "提交重练答案" }).click();
  await expect(
    studentPage.getByText("这道错题已掌握", { exact: true }),
  ).toBeVisible();
  await expect(
    studentPage.getByText("错题重练不奖励积分", { exact: true }),
  ).toBeVisible();
  await expect(studentPage.getByLabel("当前积分 0")).toBeVisible();

  await studentPage.getByRole("button", { name: "返回错题列表" }).click();
  await expect(
    studentPage.getByText("暂时没有待练错题", { exact: true }),
  ).toBeVisible();
});
