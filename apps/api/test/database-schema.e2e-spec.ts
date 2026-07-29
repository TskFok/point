import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  'postgresql://point:point@localhost:5433/point_test';
const adapter = new PrismaPg({ connectionString: testDatabaseUrl });
const prisma = new PrismaClient({ adapter });

const schemaUserId = 'schema-test-user';
const schemaQuestionId = 'schema-test-question';

describe('数据库 Schema 不变量', () => {
  beforeEach(async () => {
    await prisma.questionProgress.deleteMany({
      where: {
        OR: [{ userId: schemaUserId }, { questionId: schemaQuestionId }],
      },
    });
    await prisma.question.deleteMany({ where: { id: schemaQuestionId } });
    await prisma.user.deleteMany({ where: { id: schemaUserId } });
  });

  afterEach(async () => {
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
});
