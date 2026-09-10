import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Тесты покрывают чистую логику: сроки шагов, выводимый статус расчёта,
    // подстановку плейсхолдеров, очистку тела документа. Сценарии с БД
    // проверяются на запущенном стенде.
    include: ['packages/*/src/**/*.test.ts', 'apps/api/src/**/*.spec.ts'],
    environment: 'node',
  },
});
