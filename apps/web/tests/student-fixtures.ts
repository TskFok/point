import type { ApiComponents } from "@point-quest/api-client";

type Schemas = ApiComponents["schemas"];

export const questionOne: Schemas["LearnerQuestionDto"] = {
  basePoints: 10,
  id: "question-1",
  options: [
    { content: "had left", id: "option-1-a", label: "A", position: 1 },
    { content: "left", id: "option-1-b", label: "B", position: 2 },
  ],
  stem: "If she ___ earlier, she would have caught the train.",
};

export const questionTwo: Schemas["LearnerQuestionDto"] = {
  basePoints: 8,
  id: "question-2",
  options: [
    { content: "has lived", id: "option-2-a", label: "A", position: 1 },
    { content: "lived", id: "option-2-b", label: "B", position: 2 },
  ],
  stem: "He ___ here since 2020.",
};

export const questionThree: Schemas["LearnerQuestionDto"] = {
  basePoints: 6,
  id: "question-3",
  options: [
    { content: "goes", id: "option-3-a", label: "A", position: 1 },
    { content: "went", id: "option-3-b", label: "B", position: 2 },
  ],
  stem: "She usually ___ to school by bus.",
};

export const previewQuestionOne: Schemas["PreviewQuestionDto"] = {
  ...questionOne,
  correctOptionId: "option-1-a",
  explanation: "虚拟语气中，与过去事实相反时从句使用过去完成时。",
};

export const previewQuestionTwo: Schemas["PreviewQuestionDto"] = {
  ...questionTwo,
  correctOptionId: "option-2-a",
  explanation: "since 2020 表示从过去持续到现在，使用现在完成时。",
};

export const correctAnswer: Schemas["AnswerResultDto"] = {
  balance: 120,
  correct: true,
  correctOptionId: "option-1-a",
  errorCount: 0,
  explanation: "虚拟语气中，与过去事实相反时从句使用过去完成时。",
  pointsAwarded: 20,
  selectedOptionId: "option-1-a",
};

export const wrongAnswer: Schemas["AnswerResultDto"] = {
  balance: 100,
  correct: false,
  correctOptionId: "option-1-a",
  errorCount: 2,
  explanation: "虚拟语气中，与过去事实相反时从句使用过去完成时。",
  pointsAwarded: 0,
  selectedOptionId: "option-1-b",
};

export const productOne: Schemas["ProductDto"] = {
  createdAt: "2026-07-30T08:00:00.000Z",
  description: "适合记录每日英语练习。",
  id: "product-1",
  imageKey: "products/550e8400-e29b-41d4-a716-446655440000.png",
  isActive: true,
  name: "英语学习笔记本",
  pointsCost: 80,
  stock: 3,
  updatedAt: "2026-07-30T08:00:00.000Z",
};

export const productOutOfStock: Schemas["ProductDto"] = {
  ...productOne,
  id: "product-2",
  name: "限定徽章",
  pointsCost: 120,
  stock: 0,
};

export const pendingOrder: Schemas["OrderDto"] = {
  balance: 120,
  cancelledAt: null,
  completedAt: null,
  createdAt: "2026-07-30T08:00:00.000Z",
  id: "order-1",
  orderNo: "PQ-PENDING",
  pointsCostSnapshot: 80,
  productId: "product-1",
  productImageKeySnapshot:
    "products/550e8400-e29b-41d4-a716-446655440000.png",
  productNameSnapshot: "英语学习笔记本",
  status: "PENDING_PICKUP",
  updatedBy: null,
  userId: "student-1",
};

export const completedOrder: Schemas["OrderDto"] = {
  ...pendingOrder,
  completedAt: "2026-07-31T08:00:00.000Z",
  id: "order-2",
  orderNo: "PQ-COMPLETED",
  status: "COMPLETED",
  updatedBy: "admin-1",
};

export const cancelledOrder: Schemas["OrderDto"] = {
  ...pendingOrder,
  balance: 200,
  cancelledAt: "2026-07-31T09:00:00.000Z",
  id: "order-3",
  orderNo: "PQ-CANCELLED",
  status: "CANCELLED",
  updatedBy: "admin-1",
};

export const pageMeta: Schemas["PageMetaDto"] = {
  page: 1,
  pageSize: 20,
  total: 1,
  totalPages: 1,
};
