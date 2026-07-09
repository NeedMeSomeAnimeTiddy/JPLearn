
export function InfoRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0.75rem', borderRadius: '0', background: 'rgba(255,255,255,0.05)' }}>
      <span style={{ opacity: 0.7 }}>{label}</span>
      <span style={{ fontWeight: 600, color: highlight ? 'var(--accent)' : undefined }}>{value}</span>
    </div>
  )
}

