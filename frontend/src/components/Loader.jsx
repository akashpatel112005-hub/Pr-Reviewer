export default function Loader({ label = 'Loading...' }) {
  return (
    <div className="loader" role="status">
      {label}
    </div>
  );
}