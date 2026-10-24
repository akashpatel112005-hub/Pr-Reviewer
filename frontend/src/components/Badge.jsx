// kind: severity | risk | status. Black and white only: meaning comes from fill, border weight, and dashes.
export default function Badge({ kind, value }) {
  const key = value || 'none';
  return <span className={`badge badge-${kind}-${key}`}>{value || 'not rated'}</span>;
}