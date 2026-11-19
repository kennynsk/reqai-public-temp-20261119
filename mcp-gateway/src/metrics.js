export function createMetrics() {
  const counters = new Map();
  const durations = new Map();
  const key = (name, labels) => `${name}|${Object.entries(labels).sort().map(([k, v]) => `${k}=${v}`).join(',')}`;
  return Object.freeze({
    increment(name, labels = {}) { const id = key(name, labels); counters.set(id, (counters.get(id) || 0) + 1); },
    observe(name, value, labels = {}) { const id = key(name, labels); const current = durations.get(id) || { sum: 0, count: 0 }; durations.set(id, { sum: current.sum + value, count: current.count + 1 }); },
    render() {
      const lines = ['# ReqAI MCP gateway metrics'];
      for (const [id, value] of counters) { const [name, raw] = id.split('|'); const labels = raw ? `{${raw.split(',').map((part) => { const [k, v] = part.split('='); return `${k}="${v}"`; }).join(',')}}` : ''; lines.push(`${name}${labels} ${value}`); }
      for (const [id, value] of durations) { const [name, raw] = id.split('|'); const labels = raw ? `{${raw.split(',').map((part) => { const [k, v] = part.split('='); return `${k}="${v}"`; }).join(',')}}` : ''; lines.push(`${name}_sum${labels} ${value.sum}`, `${name}_count${labels} ${value.count}`); }
      return `${lines.join('\n')}\n`;
    },
  });
}
