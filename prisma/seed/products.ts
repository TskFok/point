import type { Prisma } from '@prisma/client';

export const productSeeds: Prisma.ProductCreateManyInput[] = [
  {
    id: 'seed-product-notebook',
    name: 'Point Quest 单词本',
    description: '便携英语单词本，适合记录每日学习内容。',
    imageKey: 'seed/products/vocabulary-notebook.png',
    stock: 30,
    pointsCost: 80,
  },
  {
    id: 'seed-product-pencil-case',
    name: 'Point Quest 笔袋',
    description: '轻便耐用的学习笔袋。',
    imageKey: 'seed/products/pencil-case.png',
    stock: 20,
    pointsCost: 150,
  },
  {
    id: 'seed-product-water-bottle',
    name: 'Point Quest 水杯',
    description: '带有 Point Quest 标识的随行水杯。',
    imageKey: 'seed/products/water-bottle.png',
    stock: 10,
    pointsCost: 300,
  },
];
