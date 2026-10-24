export default function ErrorState({ message, onRetry }) {
  return (
    <div className="error" role="alert">
      <strong>Something went wrong.</strong> {message}
      {onRetry && (
        <div style={{ marginTop: '0.75rem' }}>
          <button className="btn btn-outline" onClick={onRetry}>
            Try again
          </button>
        </div>
      )}
    </div>
  );
}