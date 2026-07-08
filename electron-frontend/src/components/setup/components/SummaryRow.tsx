
export function SummaryRow({ label, detail }: { label: string; detail: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.6rem 0.75rem', borderRadius: '6px', background: 'rgba(255,255,255,0.05)', marginBottom: '0.4rem' }}>
      <span>{label}</span>
      <span style={{ opacity: 0.65, fontSize: '0.9rem' }}>{detail}</span>
    </div>
  )
}

