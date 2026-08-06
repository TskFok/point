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
});
