import { expect, type Browser, type Page } from "playwright/test";

import { test as databaseTest, type PlaywrightDatabase } from "./database";

type AuthFixtures = {
  adminPage: Page;
  studentPage: Page;
};

async function login(
  browser: Browser,
  credentials: { password: string; username: string },
  expectedPath: "/admin" | "/learn",
): Promise<{ close: () => Promise<void>; page: Page }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("用户名").fill(credentials.username);
  await page.getByLabel("密码").fill(credentials.password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(new RegExp(`${expectedPath}$`));
  return {
    close: () => context.close(),
    page,
  };
}

async function registerStudent(
  browser: Browser,
  database: PlaywrightDatabase,
): Promise<{ close: () => Promise<void>; page: Page }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/register");
  await page.getByLabel("用户名").fill(database.student.username);
  await page
    .getByLabel("密码", { exact: true })
    .fill(database.student.password);
  await page.getByLabel("确认密码").fill(database.student.password);
  await page.getByRole("button", { name: "创建账号" }).click();
  await expect(page).toHaveURL(/\/login\?registered=1$/);
  await page.getByLabel("用户名").fill(database.student.username);
  await page.getByLabel("密码").fill(database.student.password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/learn$/);
  return {
    close: () => context.close(),
    page,
  };
}

export const test = databaseTest.extend<AuthFixtures>({
  adminPage: async ({ browser, database }, use) => {
    const session = await login(browser, database.admin, "/admin");
    try {
      await use(session.page);
    } finally {
      await session.close();
    }
  },
  studentPage: async ({ browser, database }, use) => {
    const session = await registerStudent(browser, database);
    try {
      await use(session.page);
    } finally {
      await session.close();
    }
  },
});

export { expect } from "playwright/test";
