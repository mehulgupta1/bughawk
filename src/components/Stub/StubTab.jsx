// Placeholder for tabs whose data domain isn't built yet (Port Scan, URL Parser).
export default function StubTab({ title, icon, blurb }) {
  return (
    <div className="tab-content">
      <div className="tab-head">
        <h2>{title}</h2>
        <p>{blurb}</p>
      </div>
      <div className="glass-card stub-card">
        <div className="stub-icon">{icon}</div>
        <div className="stub-title">Coming soon</div>
        <div className="stub-sub">
          {title} needs its own import &amp; parse flow — same pattern as Subdomains. It’ll get
          its own data model in a future pass so we don’t fake numbers here.
        </div>
      </div>
    </div>
  );
}
