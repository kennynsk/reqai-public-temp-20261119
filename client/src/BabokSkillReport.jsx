import { useMemo } from 'react';
import { renderBabokReport } from '../../server/src/services/babok-report-renderer.js';
import SafeMarkdown from './SafeMarkdown.jsx';

export default function BabokSkillReport({ registry, review = {} }) {
  const report = useMemo(() => {
    try { return { text: renderBabokReport(registry, { review }) }; }
    catch { return { error: 'Не удалось построить отчёт: проверьте обязательные поля и ссылки в реестре.' }; }
  }, [registry, review]);
  function downloadReport() {
    const url = URL.createObjectURL(new Blob([report.text], { type: 'text/markdown;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'babok-report.md';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  if (report.error) return <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{report.error}</p>;
  return <section aria-label="Полный отчёт по скиллу BABOK" className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
    <p className="mb-5 text-sm text-slate-600">Текущие формулировки требований и решения по вопросам. Резюме и исходный анализ сохранены из декомпозиции; оценка качества проверяется отдельно.</p>
    <button type="button" onClick={downloadReport} className="mb-5 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500">Скачать текущий отчёт (.md)</button>
    <SafeMarkdown>{report.text}</SafeMarkdown>
  </section>;
}
