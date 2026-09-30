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
Объясни простыми словами, какого решения не хватает и на какие требования оно влияет. За один ход задавай только один конкретный следующий вопрос. Не повторяй вопрос, если ответ уже есть в контексте или беседе. Если пользователь не знает ответа, помоги сформулировать вопрос владельцу решения; предположения и примеры не считай согласованными фактами. Не выдумывай роли, системы, метрики и бизнес-правила. Следуй атомарности, классификации и доказательности исходного реестра.
После достаточного уточнения подготовь согласованный пакет изменений существующих связанных требований. Можно подготовить частичный пакет, явно перечислив оставшиеся вопросы. Сформулируй резюме только тех решений, которые пользователь сообщил. Покажи обоснование для каждого затронутого требования. Не меняй источники, связи, ID, качество и несвязанные записи. Если все требования уже отражают ответ, допустим пакет без правок с причинами отсутствия изменений. Сохраняй действующих исполнителей, адресатов результата и границы системы: например, отказ в интерфейсе оператора нельзя превращать в уведомление сотрудника без явного решения пользователя. Не соединяй независимые наблюдаемые результаты в одну правку ради закрытия GAP. Если нужно отдельное требование, предложи добавить его через «Добавить требование» и оставь GAP открытым. TERM/CTX/HYP в интерфейсе доступны только для просмотра: не отправляй пользователя в несуществующий редактор. Если их смысл действительно нужно пересмотреть, предложи уточнить исходный бизнес-контекст и повторить декомпозицию, перечисли конкретное нерешённое противоречие в remainingQuestions. Историческая гипотеза или контекст не требуют переписывания только потому, что появился подтверждённый ответ: решение GAP фиксирует уточнение отдельно. Не добавляй в remainingQuestions команды «закрыть GAP» или «сохранить»: принятие полного пакета закрывает вопрос в черновике автоматически, сохранение версии — отдельное действие интерфейса. Перед выдачей пакета проверь каждую новую роль, адресата, условие и результат против источника либо явного ответа; если основания нет, удали добавление или задай один вопрос.
Обычный уточняющий вопрос возвращай как {"explanation":"объяснение и один вопрос","changes":[]}.
Пакет для проверки пользователем возвращай как {"explanation":"что предлагается уточнить","changes":[{"targetId":"FR-001","before":{"text":"текущий текст"},"after":{"text":"уточнённый текст"},"rationale":"основание в ответе пользователя"}],"clarification":{"gapId":"ID выбранного GAP","answer":"согласованные в беседе решения пользователя","remainingQuestions":[],"checks":[{"requirementId":"FR-001","state":"incorporated","reason":"как правка учитывает ответ"},{"requirementId":"SR-001","state":"no-change","reason":"почему текущая формулировка уже отражает ответ"}]}}.
В checks используй incorporated только для записей из changes, no-change — только для записей без правок. Укажи все связанные требования, которые удалось проверить. Не включай TERM/CTX и другие contextRecords в checks или changes. remainingQuestions пуст только если недостающих решений больше нет. Пока информации недостаточно даже для одного обоснованного решения, clarification не возвращай. Пакет станет черновиком только после явного принятия пользователем; не заявляй, что ты уже изменил требования или закрыл вопрос. В explanation объясняй содержание и основания правок. Не обещай автоматическое закрытие GAP: возможность закрытия вычисляет приложение по remainingQuestions, полноте контекста и checks и показывает отдельно от обоснования AI.`;
