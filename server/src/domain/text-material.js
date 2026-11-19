import { ApiError } from '../errors/api-error.js';

const TEXT_TYPES = new Set(['text/plain', 'text/markdown', 'text/x-markdown', 'application/json', 'text/json']);
const invalid = () => new ApiError({ status: 400, code: 'INVALID_TEXT_MATERIAL', message: 'Материал должен содержать корректный текст UTF-8. PDF, DOCX и другие бинарные файлы не поддерживаются.' });

export function createTextMaterialValidator(contentType) {
  if (!TEXT_TYPES.has(String(contentType || '').split(';', 1)[0].trim().toLowerCase())) {
    throw new ApiError({ status: 415, code: 'UNSUPPORTED_MATERIAL_TYPE', message: 'Поддерживаются только текстовые файлы UTF-8: TXT, Markdown и JSON.' });
  }
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let meaningful = false;
  let prefix = '';
  function inspect(text) {
    if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(text)) throw invalid();
    if (prefix.length < 8) prefix = (prefix + text).slice(0, 8);
    if (/^(?:%PDF-|PK\x03\x04)/u.test(prefix)) throw invalid();
    meaningful ||= /\S/u.test(text);
  }
  return {
    write(bytes) { try { inspect(decoder.decode(bytes, { stream: true })); } catch (error) { if (error instanceof ApiError) throw error; throw invalid(); } },
    finish() {
      try { inspect(decoder.decode()); } catch (error) { if (error instanceof ApiError) throw error; throw invalid(); }
      if (!meaningful) throw new ApiError({ status: 400, code: 'EMPTY_TEXT_MATERIAL', message: 'Материал пуст или содержит только пробелы. Добавьте бизнес-контекст.' });
    },
  };
}
