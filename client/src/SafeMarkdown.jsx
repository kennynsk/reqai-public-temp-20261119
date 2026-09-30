import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';

const components = {
  h1: ({ children }) => <h1 className="mb-5 text-xl font-bold text-slate-900">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-3 mt-8 text-lg font-semibold text-slate-900">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-2 mt-6 font-semibold text-slate-900">{children}</h3>,
  p: ({ children }) => <p className="my-3 text-sm leading-relaxed text-slate-700">{children}</p>,
  ul: ({ children }) => <ul className="my-3 list-disc space-y-1 pl-5 text-sm text-slate-700">{children}</ul>,
  ol: ({ children }) => <ol className="my-3 list-decimal space-y-1 pl-5 text-sm text-slate-700">{children}</ol>,
  table: ({ children }) => <div role="region" aria-label="Таблица отчёта" tabIndex={0} className="my-4 max-w-full overflow-x-auto rounded-lg border border-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500"><table className="w-full border-collapse text-left text-sm">{children}</table></div>,
  th: ({ children }) => <th className="border-b border-slate-200 bg-slate-50 px-3 py-3 align-top font-semibold text-slate-900">{children}</th>,
  td: ({ children }) => <td className="min-w-28 max-w-lg break-words border-b border-slate-100 px-3 py-3 align-top text-slate-700">{children}</td>,
  pre: ({ children }) => <pre tabIndex={0} className="my-4 max-w-full overflow-x-auto rounded-lg bg-slate-50 p-4 text-xs leading-relaxed text-slate-800">{children}</pre>,
};

// Chat bubbles are compact: tighter block spacing and the bubble's own text color.
const chatComponents = {
  ...components,
  p: ({ children }) => <p className="my-2 text-sm leading-relaxed text-slate-800">{children}</p>,
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5 text-sm text-slate-800">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5 text-sm text-slate-800">{children}</ol>,
};

export default function SafeMarkdown({ children, chat = false }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]} components={chat ? chatComponents : components}>{children}</ReactMarkdown>;
}
