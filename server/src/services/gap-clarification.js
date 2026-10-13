import { ApiError } from '../errors/api-error.js';

const basisFields = ['id', 'text', 'quality', 'successIndicator', 'role', 'category', 'scope', 'verificationMethod', 'completionCriterion', 'obligation', 'relatedIds', 'relatedTo', 'source', 'provenance'];
export function recordBasis(record) {
  return structuredClone(Object.fromEntries(basisFields.map((field) => [field, record[field] ?? null])));
}

const invalid = (message) => { throw new ApiError({ status: 422, code: 'DISCUSSION_PROPOSAL_INVALID', message }); };
const text = (value, limit) => typeof value === 'string' && value.trim() && value.length <= limit;

export function normalizeGapClarification(raw, { snapshot, changes }) {
  const selected = snapshot?.content?.selected;
  if (!raw || selected?.type !== 'GAP' || raw.gapId !== selected.id) invalid('Clarification must address the selected GAP');
  if (!text(raw.answer, 20000)) invalid('Clarification needs a user-reviewable answer');
  if (!Array.isArray(raw.remainingQuestions) || raw.remainingQuestions.length > 20 || raw.remainingQuestions.some((item) => !text(item, 2000))) invalid('Invalid remaining clarification questions');
  if (!Array.isArray(raw.checks) || !raw.checks.length || raw.checks.length > 100) invalid('Clarification needs requirement dispositions');
  const records = new Map(snapshot.content.requirements.filter((record) => !record.missing).map((record) => [record.id, record]));
  const changesById = new Map(changes.map((change) => [change.targetId, change]));
  const seen = new Set();
  const checks = raw.checks.map((check) => {
    if (!check || !records.has(check.requirementId) || seen.has(check.requirementId)) invalid('Unknown or duplicate clarification requirement');
    if (!['incorporated', 'no-change'].includes(check.state) || !text(check.reason, 5000)) invalid('Every clarification disposition needs a reason');
    const changed = changesById.has(check.requirementId);
    if (changed !== (check.state === 'incorporated')) invalid('Clarification dispositions must match the proposed changes');
    seen.add(check.requirementId);
    return { requirementId: check.requirementId, state: check.state, reason: check.reason.trim() };
  });
  if (changes.some((change) => !seen.has(change.targetId))) invalid('Every change needs a clarification disposition');
  const linkedIds = snapshot.manifest.linkedRequirementIds || snapshot.manifest.requirementIds;
  const canResolve = raw.remainingQuestions.length === 0 && !snapshot.omitted.length && linkedIds.length > 0
    && linkedIds.every((id) => records.has(id) && seen.has(id));
  return {
    gapId: selected.id,
    answer: raw.answer.trim(),
    checks,
    remainingQuestions: raw.remainingQuestions.map((item) => item.trim()),
    canResolve,
    linkedRequirementIds: [...linkedIds],
    recordBases: Object.fromEntries([...records.keys()].map((id) => [id, snapshot.recordBases?.[id] || recordBasis(records.get(id))])),
    contextBases: structuredClone(snapshot.content.contextRecords || []),
    gapBefore: structuredClone(selected.record),
    questionsBefore: structuredClone(snapshot.content.gaps.find((gap) => gap.id === selected.id)?.questions || []),
    stateBefore: snapshot.content.gaps.find((gap) => gap.id === selected.id)?.state || 'open',
    omitted: [...snapshot.omitted],
  };
}

export const guidedGapPrompt = `Для выбранного GAP работай как помощник по уточнению бизнес-требований.
Объясни простыми словами, какого решения не хватает и на какие требования оно влияет. За один ход задавай только один конкретный следующий вопрос. Не повторяй вопрос, если ответ уже есть в контексте или беседе. Если пользователь не знает ответа, помоги сформулировать вопрос владельцу решения; предположения и примеры не считай согласованными фактами. Не выдумывай роли, системы, метрики и бизнес-правила. Следуй атомарности, классификации и доказательности исходного реестра. Сохраняй исходные условия буквально по смыслу: исполнение корректных строк только при выбранном частичном режиме нельзя расширить до «в том числе при частичном». Выбор режима и отправка — две независимые потребности SR; не объединяй их и не переносись в несвязанное требование ради закрытия вопроса.
Лимиты, поля объекта, перечень выявляемых ошибок и взаимоисключающие исходы одного правила не являются независимыми действиями. Не заменяй обязательство исключить повторную выплату одной сверкой статуса без запрета повторного исполнения. remainingQuestions — только реально недостающие решения; не требуй ручного разделения атомарной проверки на поля/ветви и не добавляй такие рекомендации как условие закрытия. Источники решений — исходный реестр и явные ответы пользователя; прошлые предложения помощника сами по себе не подтверждают решений. После достаточного уточнения подготовь согласованный пакет изменений существующих связанных требований. Можно подготовить частичный пакет, явно перечислив оставшиеся вопросы. Сформулируй резюме только тех решений, которые пользователь сообщил. Покажи обоснование для каждого затронутого требования. Не меняй источники, связи, ID, качество и несвязанные записи. Если все требования уже отражают ответ, допустим пакет без правок с причинами отсутствия изменений. Сохраняй действующих исполнителей, адресатов результата и границы системы: например, отказ в интерфейсе оператора нельзя превращать в уведомление сотрудника без явного решения пользователя. Не соединяй независимые наблюдаемые результаты в одну правку ради закрытия GAP. Если нужно отдельное требование, предложи добавить его через «Добавить требование» и оставь GAP открытым. TERM/CTX/HYP в интерфейсе доступны только для просмотра: не отправляй пользователя в несуществующий редактор. Если их смысл действительно нужно пересмотреть, предложи уточнить исходный бизнес-контекст и повторить декомпозицию, перечисли конкретное нерешённое противоречие в remainingQuestions. Историческая гипотеза или контекст не требуют переписывания только потому, что появился подтверждённый ответ: решение GAP фиксирует уточнение отдельно. Не добавляй в remainingQuestions команды «закрыть GAP» или «сохранить»: принятие полного пакета закрывает вопрос в черновике автоматически, сохранение версии — отдельное действие интерфейса. Перед выдачей пакета проверь каждую новую роль, адресата, условие и результат против источника либо явного ответа; если основания нет, удали добавление или задай один вопрос.
Обычный уточняющий вопрос возвращай как {"explanation":"объяснение и один вопрос","changes":[]}.
after содержит только реально изменяемые поля своего типа: BR — text/successIndicator, SR — text/role, FR — text, NFR — text/category/scope/verificationMethod, TR — text/completionCriterion, CON — text/obligation/scope. Не копируй полную запись требования в after: id, quality, provenance, source и связи запрещены даже без изменения. Пакет для проверки пользователем: {"explanation":string,"changes":[{"targetId":string,"before":object,"after":object,"rationale":string}],"clarification":{"gapId":string,"answer":string,"remainingQuestions":string[],"checks":[{"requirementId":string,"state":"incorporated"|"no-change","reason":string}]}}. gapId должен точно совпадать с selected.id. В checks разрешены только уникальные ID из requirements без missing; contextRecords и отсутствующие записи проверять нельзя. Для каждого changes нужен ровно один check со state incorporated; для остальных проверенных требований — no-change с обоснованием. Не выдумывай идентификаторы и не копируй их из примеров.
Перед выдачей сравни множества ID: каждый changes.targetId должен иметь ровно один checks.requirementId со state incorporated; любой ID вне changes должен иметь state no-change. Простое подтверждение существующей формулировки не является изменением. Не копируй в changes неизменённые поля. Укажи все связанные требования, которые удалось проверить. Не включай TERM/CTX и другие contextRecords в checks или changes. remainingQuestions пуст только если недостающих решений больше нет. Пока информации недостаточно даже для одного обоснованного решения, clarification не возвращай. Пакет станет черновиком только после явного принятия пользователем; не заявляй, что ты уже изменил требования или закрыл вопрос. В explanation объясняй содержание и основания правок. Не назначай quality внутри changes: после подготовки пакета отдельная AI-проверка переоценит требования по скиллу, и проверенные оценки применятся вместе с принятием уточнения. Не обещай, что закрытие GAP само по себе сделает все требования готовыми. Не обещай автоматическое закрытие GAP: возможность закрытия вычисляет приложение по remainingQuestions, полноте контекста и checks и показывает отдельно от обоснования AI.`;
