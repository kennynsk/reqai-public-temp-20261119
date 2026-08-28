const reasoningLabel = { low: 'низкий', high: 'высокий', max: 'максимальный', disabled: 'выключен', enabled: 'включён, уровень не указан' };

export default function ResultSettings({ result }) {
  const saved = result.executionSettings;
  const actual = [...new Set((result.modelAttempts || []).filter((attempt) => attempt.result === 'SUCCEEDED').map((attempt) => attempt.model).filter(Boolean))];
  return <details className="my-4 rounded-xl border bg-white p-3 text-sm"><summary className="cursor-pointer p-1 font-semibold">Настройки этого результата</summary><div className="mt-3 space-y-2 text-slate-600">
    {saved ? <><p>Запрошенная модель: {saved.requestedModel}</p><p>Reasoning при запуске: {reasoningLabel[saved.effectiveReasoning] || 'не указан'}{saved.requestedReasoning !== saved.effectiveReasoning ? ' (приведён к поддерживаемому уровню)' : ''}</p><p>Температура: {saved.temperature}</p></> : <p>Для этого старого результата снимок настроек не сохранён.</p>}
    {actual.length > 0 && <p>Модель, вернувшая результат: {actual.join(', ')}</p>}
    <p>Настройки следующего запуска не изменяют этот результат. При резервной модели параметры могут отличаться; подробности — в Debug.</p>
  </div></details>;
}
