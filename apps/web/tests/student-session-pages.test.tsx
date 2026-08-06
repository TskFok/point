import { render, screen } from "@testing-library/react";

import PracticePage from "@/app/(student)/learn/practice/page";
import PreviewPage from "@/app/(student)/learn/preview/page";

jest.mock("@/components/practice/practice-session", () => ({
  PracticeSession: () => <div data-testid="practice-session" />,
}));

jest.mock("@/components/preview/preview-session", () => ({
  PreviewSession: () => <div data-testid="preview-session" />,
}));

describe("学员练习与预习页顶栏", () => {
  it("随机练习页无 page-heading", () => {
    const { container } = render(<PracticePage />);
    expect(screen.getByTestId("practice-session")).toBeVisible();
    expect(container.querySelector(".page-heading")).toBeNull();
  });

  it("预习页无 page-heading", () => {
    const { container } = render(<PreviewPage />);
    expect(screen.getByTestId("preview-session")).toBeVisible();
    expect(container.querySelector(".page-heading")).toBeNull();
  });
});
