import { AdminQuestionsController } from './admin-questions.controller';

describe('AdminQuestionsController', () => {
  it('remove 委托 QuestionsService.remove', async () => {
    const questionsService = {
      remove: jest.fn().mockResolvedValue({ success: true }),
    };
    const controller = new AdminQuestionsController(
      questionsService as never,
    );
    await expect(controller.remove('question-1')).resolves.toEqual({
      success: true,
    });
    expect(questionsService.remove).toHaveBeenCalledWith('question-1');
  });

  it('batch 委托 QuestionsService.batch', async () => {
    const result = {
      succeeded: 1,
      skipped: 0,
      skippedByReason: {
        notFound: 0,
        alreadyTargetState: 0,
        hasAttempts: 0,
        stillActive: 0,
      },
    };
    const questionsService = {
      batch: jest.fn().mockResolvedValue(result),
    };
    const controller = new AdminQuestionsController(
      questionsService as never,
    );
    const body = { action: 'enable' as const, ids: ['question-1'] };
    await expect(controller.batch(body)).resolves.toEqual(result);
    expect(questionsService.batch).toHaveBeenCalledWith(body);
  });

  it('clear 委托 QuestionsService.clearAll', async () => {
    const questionsService = {
      clearAll: jest.fn().mockResolvedValue({ deleted: 2 }),
    };
    const controller = new AdminQuestionsController(
      questionsService as never,
    );
    await expect(controller.clear()).resolves.toEqual({ deleted: 2 });
    expect(questionsService.clearAll).toHaveBeenCalledWith();
  });
});
