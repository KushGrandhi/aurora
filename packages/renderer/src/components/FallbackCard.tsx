export function FallbackCard({ reason }: { reason: string }) {
  return (
    <div className="fallback" role="note">
      <span className="fallback-icon" aria-hidden>!</span>
      <div><div className="fallback-title">Couldn't render</div><div className="fallback-reason">{reason}</div></div>
    </div>
  );
}
