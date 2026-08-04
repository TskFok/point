import { isAiTaskStoreResponseBodyEnabled } from './ai-response-body-config';

describe('isAiTaskStoreResponseBodyEnabled', () => {
  it.each(['true', 'TRUE', '1', 'yes', 'Yes'])(
    '开启值 %s',
    (value) => {
      expect(
        isAiTaskStoreResponseBodyEnabled({
          AI_TASK_STORE_RESPONSE_BODY: value,
        }),
      ).toBe(true);
    },
  );

  it.each(['false', '0', 'no', '', 'maybe', undefined])(
    '关闭值 %s',
    (value) => {
      expect(
        isAiTaskStoreResponseBodyEnabled(
          value === undefined
            ? {}
            : { AI_TASK_STORE_RESPONSE_BODY: value },
        ),
      ).toBe(false);
    },
  );
});
