import SafeMarkdown from './SafeMarkdown.jsx';
import { presentBabokTextResponse, renderBabokTextDraft } from '../../server/src/services/babok-text-draft.js';

export default function BabokTextDraft({ value }) {
  function download() {
    const url = URL.createObjectURL(new Blob([renderBabokTextDraft(value)], { type: 'text/markdown;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'babok-draft.md'; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
    <h1 className="text-lg font-semibold">Аналитический черновик</h1>
    <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">Ответ AI получен, но его не удалось открыть в редакторе требований. Ниже сохранены ответы модели, включая попытки исправления. Они могут повторяться: проверьте их перед использованием.</p>
    {value.failedChunks?.length > 0 && <p className="text-sm text-amber-950">Не удалось обработать частей документа: {value.failedChunks.length}. Черновик неполный.</p>}
    <button onClick={download} className="rounded-lg border px-4 py-2 text-sm font-semibold text-indigo-700">Скачать черновик (.md)</button>
    {value.responses.map((text, index) => <section key={index} className="min-w-0 border-t pt-4"><h2 className="mb-3 font-semibold">Ответ {index + 1}</h2><SafeMarkdown>{presentBabokTextResponse(text)}</SafeMarkdown></section>)}
  </section>;
}
