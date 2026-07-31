import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { createE2eRunId } from './e2e-run-id';

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  'postgresql://point:point@localhost:5433/point_test';
const adapter = new PrismaPg({ connectionString: testDatabaseUrl });
const prisma = new PrismaClient({ adapter });

const testRunId = createE2eRunId();
const schemaUserId = `schema-test-user-${testRunId}`;
const schemaQuestionId = `schema-test-question-${testRunId}`;
const auditCreatorId = `schema-audit-creator-${testRunId}`;
const auditStudentId = `schema-audit-student-${testRunId}`;
const auditQuestionId = `schema-audit-question-${testRunId}`;
const auditOptionId = `schema-audit-option-${testRunId}`;
const schemaUsername = `schema_user_${testRunId}`;
const auditCreatorUsername = `schema_creator_${testRunId}`;
const auditStudentUsername = `schema_student_${testRunId}`;
const errorCountMigrationPath = resolve(
  __dirname,
  '../../../prisma/migrations/0004_add_answer_attempt_error_count_snapshot/migration.sql',
);

describe('数据库 Schema 不变量', () => {
  beforeEach(async () => {
    await prisma.answerAttempt.deleteMany({
      where: {
        OR: [{ userId: auditStudentId }, { questionId: auditQuestionId }],
      },
    });
    await prisma.questionOption.deleteMany({
      where: { questionId: auditQuestionId },
    });
    await prisma.question.deleteMany({ where: { id: auditQuestionId } });
    await prisma.user.deleteMany({
      where: { id: { in: [auditCreatorId, auditStudentId] } },
    });
    await prisma.questionProgress.deleteMany({
      where: {
        OR: [{ userId: schemaUserId }, { questionId: schemaQuestionId }],
      },
    });
    await prisma.question.deleteMany({ where: { id: schemaQuestionId } });
    await prisma.user.deleteMany({ where: { id: schemaUserId } });
  });

  afterEach(async () => {
    await prisma.answerAttempt.deleteMany({
      where: {
        OR: [{ userId: auditStudentId }, { questionId: auditQuestionId }],
      },
    });
    await prisma.questionOption.deleteMany({
      where: { questionId: auditQuestionId },
    });
    await prisma.question.deleteMany({ where: { id: auditQuestionId } });
    await prisma.user.deleteMany({
      where: { id: { in: [auditCreatorId, auditStudentId] } },
    });
    await prisma.questionProgress.deleteMany({
      where: {
        OR: [{ userId: schemaUserId }, { questionId: schemaQuestionId }],
      },
    });
    await prisma.question.deleteMany({ where: { id: schemaQuestionId } });
    await prisma.user.deleteMany({ where: { id: schemaUserId } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('拒绝负积分余额并保证用户题目进度唯一', async () => {
    const user = await prisma.user.create({
      data: {
        id: schemaUserId,
        username: schemaUsername,
        passwordHash: 'hash',
        role: 'STUDENT',
      },
    });
    const question = await prisma.question.create({
      data: {
        id: schemaQuestionId,
        stem: 'Schema invariant question',
        explanation: 'Used only by the schema test.',
        basePoints: 10,
        createdBy: user.id,
      },
    });

    await expect(
      prisma.user.update({
        where: { id: user.id },
        data: { pointsBalance: -1 },
      }),
    ).rejects.toBeDefined();

    await prisma.questionProgress.create({
      data: {
        userId: user.id,
        questionId: question.id,
        firstCorrect: false,
        errorCount: 1,
      },
    });
    await expect(
      prisma.questionProgress.create({
        data: {
          userId: user.id,
          questionId: question.id,
          firstCorrect: false,
          errorCount: 1,
        },
      }),
    ).rejects.toBeDefined();
  });

  it('用户存在答题记录时拒绝删除以保留审计历史', async () => {
    await prisma.user.createMany({
      data: [
        {
          id: auditCreatorId,
          username: auditCreatorUsername,
          passwordHash: 'hash',
          role: 'ADMIN',
        },
        {
          id: auditStudentId,
          username: auditStudentUsername,
          passwordHash: 'hash',
          role: 'STUDENT',
        },
      ],
    });
    const question = await prisma.question.create({
      data: {
        id: auditQuestionId,
        stem: 'Audit history question',
        explanation: 'Used to verify audit retention.',
        basePoints: 10,
        createdBy: auditCreatorId,
      },
    });
    const option = await prisma.questionOption.create({
      data: {
        id: auditOptionId,
        questionId: question.id,
        label: 'A',
        content: 'An incorrect answer',
        position: 0,
        isCorrect: false,
      },
    });
    await prisma.answerAttempt.create({
      data: {
        userId: auditStudentId,
        questionId: question.id,
        selectedOptionId: option.id,
        mode: 'FIRST_ATTEMPT',
        isCorrect: false,
        basePointsSnapshot: 10,
        multiplierSnapshot: 1,
        pointsAwarded: 0,
        balanceAfterSnapshot: 0,
        errorCountSnapshot: 1,
        idempotencyKey: `schema-audit-attempt-${testRunId}`,
      },
    });

    await expect(
      prisma.user.delete({ where: { id: auditStudentId } }),
    ).rejects.toBeDefined();
  });

  it('集合回填答题错误次数快照并强制非空、无默认值和非负约束', async () => {
    const client = new Client({ connectionString: testDatabaseUrl });
    const schemaName = `task6_migration_${process.pid}`;
    await client.connect();
    try {
      await client.query('BEGIN');
      await client.query(`CREATE SCHEMA "${schemaName}"`);
      await client.query(`SET LOCAL search_path TO "${schemaName}"`);
      await client.query(
        `CREATE TYPE "AnswerMode" AS ENUM ('FIRST_ATTEMPT', 'WRONG_RETRY')`,
      );
      await client.query(`
        CREATE TABLE "AnswerAttempt" (
          "id" TEXT PRIMARY KEY,
          "userId" TEXT NOT NULL,
          "questionId" TEXT NOT NULL,
          "mode" "AnswerMode" NOT NULL,
          "isCorrect" BOOLEAN NOT NULL,
          "createdAt" TIMESTAMP(3) NOT NULL
        )
      `);
      await client.query(`
        INSERT INTO "AnswerAttempt"
          ("id", "userId", "questionId", "mode", "isCorrect", "createdAt")
        VALUES
          ('first-wrong', 'student-1', 'question-1', 'FIRST_ATTEMPT', false, '2026-01-01T00:00:00.000Z'),
          ('retry-wrong-1', 'student-1', 'question-1', 'WRONG_RETRY', false, '2026-01-02T00:00:00.000Z'),
          ('retry-correct', 'student-1', 'question-1', 'WRONG_RETRY', true, '2026-01-03T00:00:00.000Z'),
          ('retry-wrong-2', 'student-1', 'question-1', 'WRONG_RETRY', false, '2026-01-04T00:00:00.000Z'),
          ('first-correct', 'student-1', 'question-2', 'FIRST_ATTEMPT', true, '2026-01-01T00:00:00.000Z')
      `);

      await client.query(readFileSync(errorCountMigrationPath, 'utf8'));

      const snapshots = await client.query<{
        id: string;
        errorCountSnapshot: number;
      }>(`
        SELECT id, "errorCountSnapshot"
        FROM "AnswerAttempt"
        ORDER BY "createdAt", id
      `);
      expect(snapshots.rows).toEqual([
        { id: 'first-correct', errorCountSnapshot: 0 },
        { id: 'first-wrong', errorCountSnapshot: 1 },
        { id: 'retry-wrong-1', errorCountSnapshot: 2 },
        { id: 'retry-correct', errorCountSnapshot: 2 },
        { id: 'retry-wrong-2', errorCountSnapshot: 3 },
      ]);

      const column = await client.query<{
        isNullable: 'YES' | 'NO';
        columnDefault: string | null;
      }>(`
        SELECT
          "is_nullable" AS "isNullable",
          "column_default" AS "columnDefault"
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'AnswerAttempt'
          AND column_name = 'errorCountSnapshot'
      `);
      expect(column.rows).toEqual([{ isNullable: 'NO', columnDefault: null }]);
      await expect(
        client.query(`
          UPDATE "AnswerAttempt"
          SET "errorCountSnapshot" = -1
          WHERE id = 'first-wrong'
        `),
      ).rejects.toMatchObject({ code: '23514' });
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  });
});
