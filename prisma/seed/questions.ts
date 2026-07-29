import type { Prisma } from '@prisma/client';

export const seedAdminId = 'seed-user-admin';

export const questionSeeds: Prisma.QuestionCreateManyInput[] = [
  {
    id: 'seed-question-01',
    stem: 'Choose the correct sentence.',
    explanation: 'A singular third-person subject takes “goes” in the present simple.',
    basePoints: 10,
    createdBy: seedAdminId,
  },
  {
    id: 'seed-question-02',
    stem: 'Which word is the opposite of “ancient”?',
    explanation: '“Modern” describes something belonging to the present or recent times.',
    basePoints: 10,
    createdBy: seedAdminId,
  },
  {
    id: 'seed-question-03',
    stem: 'Complete the sentence: I have lived here ___ 2020.',
    explanation: 'Use “since” with a specific starting point.',
    basePoints: 10,
    createdBy: seedAdminId,
  },
  {
    id: 'seed-question-04',
    stem: 'Choose the correct past tense of “teach”.',
    explanation: '“Teach” is irregular; its past tense is “taught”.',
    basePoints: 10,
    createdBy: seedAdminId,
  },
  {
    id: 'seed-question-05',
    stem: 'Which sentence uses the comparative adjective correctly?',
    explanation: 'The comparative form of “easy” is “easier”.',
    basePoints: 15,
    createdBy: seedAdminId,
  },
  {
    id: 'seed-question-06',
    stem: 'Choose the correct article: She bought ___ umbrella.',
    explanation: 'Use “an” before a vowel sound.',
    basePoints: 10,
    createdBy: seedAdminId,
  },
  {
    id: 'seed-question-07',
    stem: 'What does “look after” mean?',
    explanation: 'The phrasal verb “look after” means to take care of someone or something.',
    basePoints: 15,
    createdBy: seedAdminId,
  },
  {
    id: 'seed-question-08',
    stem: 'Complete the conditional: If it rains, we ___ at home.',
    explanation: 'The first conditional uses “will” in the result clause.',
    basePoints: 15,
    createdBy: seedAdminId,
  },
  {
    id: 'seed-question-09',
    stem: 'Choose the correctly spelled word.',
    explanation: '“Necessary” has one c and two s letters.',
    basePoints: 10,
    createdBy: seedAdminId,
  },
  {
    id: 'seed-question-10',
    stem: 'Which sentence is in the passive voice?',
    explanation: '“Was written” is a passive construction: be + past participle.',
    basePoints: 20,
    createdBy: seedAdminId,
  },
];

type SeedOption = Pick<
  Prisma.QuestionOptionCreateManyInput,
  'label' | 'content' | 'isCorrect'
>;

const optionsByQuestion: SeedOption[][] = [
  [
    { label: 'A', content: 'She go to school every day.', isCorrect: false },
    { label: 'B', content: 'She goes to school every day.', isCorrect: true },
    { label: 'C', content: 'She going to school every day.', isCorrect: false },
    { label: 'D', content: 'She gone to school every day.', isCorrect: false },
  ],
  [
    { label: 'A', content: 'Old', isCorrect: false },
    { label: 'B', content: 'Historic', isCorrect: false },
    { label: 'C', content: 'Modern', isCorrect: true },
    { label: 'D', content: 'Traditional', isCorrect: false },
  ],
  [
    { label: 'A', content: 'for', isCorrect: false },
    { label: 'B', content: 'since', isCorrect: true },
    { label: 'C', content: 'during', isCorrect: false },
    { label: 'D', content: 'until', isCorrect: false },
  ],
  [
    { label: 'A', content: 'teached', isCorrect: false },
    { label: 'B', content: 'teacht', isCorrect: false },
    { label: 'C', content: 'taught', isCorrect: true },
    { label: 'D', content: 'teaching', isCorrect: false },
  ],
  [
    { label: 'A', content: 'This book is more easy.', isCorrect: false },
    { label: 'B', content: 'This book is easiest than that one.', isCorrect: false },
    { label: 'C', content: 'This book is easier than that one.', isCorrect: true },
    { label: 'D', content: 'This book is easyer.', isCorrect: false },
  ],
  [
    { label: 'A', content: 'a', isCorrect: false },
    { label: 'B', content: 'an', isCorrect: true },
    { label: 'C', content: 'the', isCorrect: false },
    { label: 'D', content: 'no article', isCorrect: false },
  ],
  [
    { label: 'A', content: 'Search for', isCorrect: false },
    { label: 'B', content: 'Admire', isCorrect: false },
    { label: 'C', content: 'Take care of', isCorrect: true },
    { label: 'D', content: 'Wait for', isCorrect: false },
  ],
  [
    { label: 'A', content: 'stay', isCorrect: false },
    { label: 'B', content: 'stayed', isCorrect: false },
    { label: 'C', content: 'will stay', isCorrect: true },
    { label: 'D', content: 'would stayed', isCorrect: false },
  ],
  [
    { label: 'A', content: 'neccessary', isCorrect: false },
    { label: 'B', content: 'necessary', isCorrect: true },
    { label: 'C', content: 'necessery', isCorrect: false },
    { label: 'D', content: 'necesary', isCorrect: false },
  ],
  [
    { label: 'A', content: 'Maya wrote the letter.', isCorrect: false },
    { label: 'B', content: 'Maya is writing the letter.', isCorrect: false },
    { label: 'C', content: 'The letter was written by Maya.', isCorrect: true },
    { label: 'D', content: 'Maya will write the letter.', isCorrect: false },
  ],
];

export const optionSeeds: Prisma.QuestionOptionCreateManyInput[] =
  questionSeeds.flatMap((question, questionIndex) =>
    optionsByQuestion[questionIndex].map((option, position) => ({
      id: `${question.id}-option-${position + 1}`,
      questionId: question.id,
      position,
      ...option,
    })),
  );
