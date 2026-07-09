export function StepDots({ total, current }: { total: number; current: number }) {
  return (
    <div className="wiz-dots">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`wiz-dot${i + 1 === current ? ' is-active' : ''}`}
        />
      ))}
    </div>
  )
}
