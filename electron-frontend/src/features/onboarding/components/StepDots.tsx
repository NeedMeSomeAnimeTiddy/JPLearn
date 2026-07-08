export function StepDots({ total, current }: { total: number; current: number }) {
  return (
    <div className="obn-dots">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`obn-dot${i + 1 === current ? ' is-active' : ''}`}
        />
      ))}
    </div>
  )
}
