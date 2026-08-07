-- AiTask: 词形匹配白名单（屈折后缀 + 不规则整词映射）
ALTER TABLE "AiTask"
ADD COLUMN "wordMatchRules" JSONB NOT NULL
DEFAULT '{"suffixes":["s","es","ed","ing","er","est","ies","ied","ying","''s"],"irregulars":{}}'::jsonb;
