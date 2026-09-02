import type { ScreenHead as Head } from '../chrome'

export interface ScreenHeadProps {
  head: Head | null
  /** the live line this screen wants to say about itself, if any */
  note?: string
}

/* THE HEADING SLAB, AND IT IS THE MENU ROW ONE SIZE DOWN — see `chrome.ts` for why that is the
   shape rather than a title. The accent block carries the section's mark on the section's own
   colour; the kicker says where you came from; the title is English-led with the Japanese beside it.
   `--pj-accent` is the one thing the component has to write, because the colour belongs to the
   section rather than to the stylesheet. */
export function ScreenHead({ head, note }: ScreenHeadProps) {
  if (!head) return null
  return (
    <div className="pj-cap" style={{ '--pj-accent': head.accent } as React.CSSProperties}>
      <span className="pj-mark" aria-hidden="true">{head.mark}</span>
      <span className="pj-text">
        {head.kick ? <span className="pj-kick">{head.kick}</span> : null}
        <span className="pj-title"><b>{head.en}</b><i>{head.jp}</i></span>
      </span>
      {note ? <span className="pj-note">{note}</span> : null}
    </div>
  )
}
