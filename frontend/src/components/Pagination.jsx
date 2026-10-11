export default function Pagination({ offset, pageSize, hasNext, onChange, disabled = false, label = 'Results' }) {
  return (
    <nav className="pagination" aria-label={`${label} pagination`}>
      <button className="secondary" type="button" disabled={disabled || offset === 0} onClick={() => onChange(Math.max(0, offset - pageSize))}>Previous</button>
      <span>Page {Math.floor(offset / pageSize) + 1}</span>
      <button className="secondary" type="button" disabled={disabled || !hasNext} onClick={() => onChange(offset + pageSize)}>Next</button>
    </nav>
  );
}
