-- 英文词库数据表（线上库已由外部导入流程建表；IF NOT EXISTS 兼容存量库，
-- 同时保证全新环境 / 测试库 migrate 后表结构可用）

-- 原始数据表
CREATE TABLE IF NOT EXISTS raw_entry (
    id            BIGSERIAL PRIMARY KEY,
    source_id     TEXT NOT NULL,
    source_line   BIGINT NOT NULL,

    word          TEXT,
    lang          TEXT,
    lang_code     TEXT,
    pos           TEXT,

    raw_data      JSONB NOT NULL,
    imported_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (source_id, source_line)
);

-- 词条表
CREATE TABLE IF NOT EXISTS entry (
    id               BIGINT PRIMARY KEY,
    word             TEXT NOT NULL,
    lang             TEXT,
    lang_code        TEXT NOT NULL,
    pos              TEXT,
    etymology_text   TEXT,

    CONSTRAINT entry_raw_fk
        FOREIGN KEY (id)
        REFERENCES raw_entry(id)
        ON DELETE CASCADE
);

-- 释义表
CREATE TABLE IF NOT EXISTS sense (
    id            BIGSERIAL PRIMARY KEY,
    entry_id      BIGINT NOT NULL
                  REFERENCES entry(id)
                  ON DELETE CASCADE,
    sense_order   INTEGER NOT NULL,
    definition    TEXT,
    tags          JSONB,
    examples      JSONB,
    raw_data      JSONB NOT NULL,

    UNIQUE (entry_id, sense_order)
);

-- 词形表
CREATE TABLE IF NOT EXISTS word_form (
    id          BIGSERIAL PRIMARY KEY,
    entry_id    BIGINT NOT NULL
                REFERENCES entry(id)
                ON DELETE CASCADE,
    form        TEXT NOT NULL,
    tags        JSONB,
    source      TEXT
);

-- 发音表
CREATE TABLE IF NOT EXISTS pronunciation (
    id          BIGSERIAL PRIMARY KEY,
    entry_id    BIGINT NOT NULL
                REFERENCES entry(id)
                ON DELETE CASCADE,
    ipa         TEXT,
    enpr        TEXT,
    audio       TEXT,
    ogg_url     TEXT,
    mp3_url     TEXT,
    description TEXT,
    tags        JSONB
);

-- AI 任务按字母序取词的游标查询索引（COLLATE "C" 与查询中的排序/比较一致）
CREATE INDEX IF NOT EXISTS entry_lang_word_c_idx
    ON entry (lang_code, word COLLATE "C");
