
export function StepDots({ total, current }: { total: number; current: number }) {
  return (
    <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', marginBottom: '1.5rem' }}>
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          style={{
            width: i + 1 === current ? '20px' : '8px',
            height: '8px',
            borderRadius: '4px',
            background: i + 1 === current ? 'var(--accent)' : 'rgba(255,255,255,0.25)',
            transition: 'width 0.25s, background 0.25s',
          }}
        />
      ))}
    </div>
  )
}
