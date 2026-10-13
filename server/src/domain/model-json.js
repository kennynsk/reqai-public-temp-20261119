// Recover only JSON boundaries. Never guess missing strings, keys or values,
// and never choose between multiple structured answers.
export function parseModelJson(text) {
  const fenced = String(text).match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = String(fenced?.[1] || text).trim();
  try { return JSON.parse(body); } catch (original) {
    if (!['{', '['].includes(body[0])) throw original;
    const stack = [];
    let quoted = false, escaped = false, end = -1;
    for (let index = 0; index < body.length; index++) {
      const char = body[index];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') quoted = false;
        continue;
      }
      if (char === '"') quoted = true;
      else if (char === '{' || char === '[') stack.push(char === '{' ? '}' : ']');
      else if (char === '}' || char === ']') {
        if (stack.pop() !== char) throw original;
        if (!stack.length) { end = index + 1; break; }
      }
    }
    if (end !== -1) {
      const remainder = body.slice(end).trim();
      if (/[\[\]{}]/u.test(remainder) || /^(?:[",]|-?\d|true\b|false\b|null\b|```)/u.test(remainder)) throw original;
      return JSON.parse(body.slice(0, end));
    }
    if (quoted || !stack.length) throw original;
    return JSON.parse(body + stack.reverse().join(''));
  }
}
