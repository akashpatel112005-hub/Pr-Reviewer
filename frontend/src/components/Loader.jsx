export default function Loader({ label = 'Loading...' }) {
  return (
    <div className="loader" role="status" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.85rem' }}>
      <div
        style={{
          width: '28px',
          height: '28px',
          borderRadius: '50%',
          border: '2px solid rgba(255, 255, 255, 0.15)',
          borderTopColor: '#ffffff',
          animation: 'spin 0.75s linear infinite',
        }}
      />
      <span style={{ fontSize: '0.88rem', color: '#94a3b8' }}>{label}</span>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
