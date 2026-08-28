import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';

export default function SafeMarkdown({ children }) {
  return <ReactMarkdown rehypePlugins={[rehypeSanitize]}>{children}</ReactMarkdown>;
}
