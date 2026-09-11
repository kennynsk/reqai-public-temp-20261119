export function filterRequirementList(columns, groups, { type = 'all', query = '', needsClarification = false } = {}) {
  const needle = query.trim().toLocaleLowerCase('ru');
  return columns.flatMap(([key]) => (groups[key] || []).map((requirement) => ({ type: key, requirement })))
    .filter((entry) => (type === 'all' || entry.type === type)
      && (!needsClarification || entry.requirement.quality !== 'Готово')
      && (!needle || `${entry.requirement.id} ${entry.requirement.text || ''}`.toLocaleLowerCase('ru').includes(needle)));
}

export function selectedRequirementEntry(entries, id) {
  return entries.find((entry) => entry.requirement.id === id) || entries[0] || null;
}
