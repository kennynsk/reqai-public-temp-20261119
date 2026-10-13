export function gapStateLabel(state = {}) {
  return state.state === 'closed' ? state.closureKind === 'resolved' ? 'Закрыт · ответ учтён' : state.closureKind === 'dismissed' ? 'Снят с рассмотрения' : 'Закрыт · прежнее решение' : state.answer?.trim() ? 'Ответ добавлен · ещё открыт' : 'Ожидает ответа';
}

