export function CheckboxOption({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', cursor: 'pointer', padding: '0.65rem 0.75rem', borderRadius: '0', background: checked ? 'color-mix(in oklab, var(--panel-bg) 80%, white)' : 'transparent', border: `1px solid ${checked ? 'var(--panel-border)' : 'transparent'}` }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ accentColor: 'var(--accent)', width: '1rem', height: '1rem', flexShrink: 0 }} />
      <span style={{ fontWeight: 500 }}>{label}</span>
    </label>
  )
}

