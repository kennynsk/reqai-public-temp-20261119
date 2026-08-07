import { randomUUID } from 'node:crypto';

function responseFor(prompt) {
  if (prompt.includes('Выделить 5-7 категорий')) {
    return JSON.stringify({
      categories: [
        { id: 'durable-execution', name: 'Надёжное длительное выполнение', description: 'Восстановление анализа после сбоев.', level: 'технологический', priority: 'критический', reasoning: 'Ключевое enterprise-требование.', hidden_aspects: ['идемпотентность'] },
        { id: 'horizontal-scaling', name: 'Горизонтальное масштабирование', description: 'Независимое масштабирование обработки.', level: 'технологический', priority: 'высокий', reasoning: 'Поддерживает рост нагрузки.', hidden_aspects: ['backpressure'] },
      ],
      dependencies: { 'horizontal-scaling': ['durable-execution'] },
      critical_risks: ['Повтор внешнего LLM-вызова после сбоя'],
    });
  }
  if (prompt.includes('Выдели РОВНО 4 категории')) {
    return JSON.stringify({
      categories: [
        { id: 'enterprise-requirements-platform', name: 'Рынок enterprise-платформ анализа требований', description: 'Корпоративные решения для анализа и декомпозиции требований.', level: 'продуктовый', type: 'domain', reasoning: 'Задаёт рыночный контекст решения.' },
        { id: 'durable-execution', name: 'Надёжное длительное выполнение', description: 'Восстановление анализа после сбоев и перезапусков.', level: 'технологический', type: 'leverage', reasoning: 'Определяет надёжность и архитектуру.' },
        { id: 'horizontal-scaling', name: 'Горизонтальное масштабирование обработки', description: 'Разделение очередей и независимое масштабирование этапов.', level: 'технологический', type: 'leverage', reasoning: 'Обеспечивает управление производительностью.' },
        { id: 'operational-governance', name: 'Эксплуатационное управление', description: 'Наблюдаемость, аудит и управляемое восстановление.', level: 'процессный', type: 'leverage', reasoning: 'Снижает операционные риски.' },
      ],
    });
  }
  if (prompt.includes('Разложи бизнес-задачу на три типа требований')) {
    return JSON.stringify({
      business: [
        { id: 'BT-1', text: 'Обеспечить надёжное выполнение анализа требований независимо от подключения пользователя.' },
        { id: 'BT-2', text: 'Сократить операционные потери при перезапуске компонентов.' },
        { id: 'BT-3', text: 'Обеспечить независимое масштабирование обработки запросов.' },
      ],
      functional: [
        { id: 'FT-1', text: 'Система должна принимать задачу анализа через REST API и возвращать её идентификатор.' },
        { id: 'FT-2', text: 'Система должна сохранять промежуточные результаты выполнения задачи.' },
        { id: 'FT-3', text: 'Система должна предоставлять статус и итоговый результат ранее созданной задачи.' },
      ],
      nonfunctional: [
        { id: 'NFT-1', text: 'Доступность пользовательского API должна составлять не менее 99,5%.' },
        { id: 'NFT-2', text: 'Размер входного и итогового артефакта не должен превышать 100 МБ.' },
        { id: 'NFT-3', text: 'Выполнение должно возобновляться после перезапуска worker без потери подтверждённых этапов.' },
      ],
    });
  }
  if (prompt.includes('исслед') || prompt.includes('Research')) {
    return 'Локальный mock-отчёт: подтверждены durable execution, независимые очереди, идемпотентность и наблюдаемость.';
  }
  return 'Локальный mock-результат: требования дополнены критериями надёжности, масштабирования и эксплуатации.';
}

export class MockLlmProvider {
  constructor({ delayMs = 250 } = {}) { this.delayMs = delayMs; }

  async complete({ model, messages, requestId = randomUUID() }) {
    if (this.delayMs) await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    const prompt = messages.map((message) => String(message.content || '')).join('\n');
    const text = responseFor(prompt);
    return {
      text,
      model,
      requestId: `mock-${requestId}`,
      usage: { inputTokens: Math.ceil(prompt.length / 4), outputTokens: Math.ceil(text.length / 4) },
    };
  }
}
