import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
import { productSeeds } from './products';
import { optionSeeds, questionSeeds, seedAdminId } from './questions';
import { seedAdminCredentials, seedStudentCredentials } from './users';

const connectionString =
  process.env.DATABASE_URL ??
  'postgresql://point:point@localhost:5432/point';
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main(): Promise<void> {
  const [adminPasswordHash, studentPasswordHash] = await Promise.all([
    hash(seedAdminCredentials.password, 12),
    hash(seedStudentCredentials.password, 12),
  ]);

  await prisma.user.createMany({
    data: [
      {
        id: seedAdminId,
        username: seedAdminCredentials.username,
        passwordHash: adminPasswordHash,
        role: 'ADMIN',
      },
      {
        id: 'seed-user-student',
        username: seedStudentCredentials.username,
        passwordHash: studentPasswordHash,
        role: 'STUDENT',
      },
    ],
    skipDuplicates: true,
  });
  await prisma.question.createMany({
    data: questionSeeds,
    skipDuplicates: true,
  });
  await prisma.questionOption.createMany({
    data: optionSeeds,
    skipDuplicates: true,
  });
  await prisma.product.createMany({
    data: productSeeds,
    skipDuplicates: true,
  });

  const [users, questions, options, products] = await Promise.all([
    prisma.user.count({
      where: { id: { in: [seedAdminId, 'seed-user-student'] } },
    }),
    prisma.question.count({
      where: { id: { in: questionSeeds.map(({ id }) => id) } },
    }),
    prisma.questionOption.count({
      where: { id: { in: optionSeeds.map(({ id }) => id) } },
    }),
    prisma.product.count({
      where: { id: { in: productSeeds.map(({ id }) => id) } },
    }),
  ]);

  console.log(
    JSON.stringify({
      seeded: { users, questions, options, products },
      demoUsers: [
        seedAdminCredentials.username,
        seedStudentCredentials.username,
      ],
    }),
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
