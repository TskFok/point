import {
  DEFAULT_WORD_MATCH_SUFFIXES,
  buildWordMatchRulesFromInputs,
  parseIrregularsInput,
  parseSuffixesInput,
} from "@/lib/ai-task-word-match-rules";

describe("ai-task-word-match-rules helpers", () => {
  it("解析逗号分隔后缀并去重", () => {
    expect(parseSuffixesInput("s, ES, ed, s")).toEqual(["s", "es", "ed"]);
  });

  it("解析不规则变形行", () => {
    const parsed = parseIrregularsInput("go=went,gone\nchild=children");
    expect(parsed).toEqual({
      ok: true,
      irregulars: {
        go: ["went", "gone"],
        child: ["children"],
      },
    });
  });

  it("非法不规则行报错", () => {
    const parsed = parseIrregularsInput("go went");
    expect(parsed.ok).toBe(false);
  });

  it("组装默认后缀规则", () => {
    const built = buildWordMatchRulesFromInputs(
      DEFAULT_WORD_MATCH_SUFFIXES.join(", "),
      "",
    );
    expect(built.ok).toBe(true);
    if (built.ok) {
      expect(built.rules.suffixes).toEqual([...DEFAULT_WORD_MATCH_SUFFIXES]);
      expect(built.rules.irregulars).toEqual({});
    }
  });
});
