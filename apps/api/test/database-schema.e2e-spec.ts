import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  'postgresql://point:point@localhost:5433/point_test';
const adapter = new PrismaPg({ connectionString: testDatabaseUrl });
const prisma = new PrismaClient({ adapter });

const schemaUserId = 'schema-test-user';
const schemaQuestionId = 'schema-test-question';
const auditCreatorId = 'schema-audit-creator';
const auditStudentId = 'schema-audit-student';
const auditQuestionId = 'schema-audit-question';
const auditOptionId = 'schema-audit-option';

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
        username: 'schema_user',
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
          username: 'schema_audit_creator',
          passwordHash: 'hash',
          role: 'ADMIN',
        },
        {
          id: auditStudentId,
          username: 'schema_audit_student',
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
        idempotencyKey: 'schema-audit-attempt',
      },
    });

    await expect(
      prisma.user.delete({ where: { id: auditStudentId } }),
    ).rejects.toBeDefined();
  });
});
