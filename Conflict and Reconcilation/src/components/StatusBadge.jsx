function toneFor(value) {
  const text = String(value ?? '').toLowerCase();
  if (/critical|severe|open|required|historical|retired/.test(text)) return 'danger';
  if (/major|high|mixed|moderate|medium/.test(text)) return 'warning';
  if (/resolved|current|active|minor|low/.test(text)) return 'success';
  return 'neutral';
}

export default function StatusBadge({ children, value = children, compact = false }) {
  return <span className={`status-badge status-badge--${toneFor(value)}${compact ? ' status-badge--compact' : ''}`}>{children}</span>;
}
