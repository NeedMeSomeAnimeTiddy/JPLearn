export function CheckboxOption({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', cursor: 'pointer', padding: '0.65rem 0.75rem', borderRadius: '8px', background: checked ? 'rgba(255,255,255,0.06)' : 'transparent', border: `1px solid ${checked ? 'rgba(255,255,255,0.18)' : 'transparent'}` }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ accentColor: 'var(--accent)', width: '1rem', height: '1rem', flexShrink: 0 }} />
      <span style={{ fontWeight: 500 }}>{label}</span>
    </label>
  )
}

