import { useEffect, useLayoutEffect, useRef } from 'react'
import { UNLOCK_LEADS_TO, type UnlockMoment } from '../unlock'
import '../../../styles/stage.css'
import '../menu.css'

export interface UnlockProps {
  moment: UnlockMoment
  /** dismiss, and remember the mark that says this was announced */
  onContinue: (mark: string) => void
}

export function Unlock({ moment, onContinue }: UnlockProps) {
  const frameRef = useRef<HTMLDivElement | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    const fit = () => {
      const u = Math.min(window.innerWidth / 1280, window.innerHeight / 720, 1)
      frameRef.current?.style.setProperty('--lk-u', String(u))
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])

  useEffect(() => { rootRef.current?.focus({ preventScroll: true }) }, [])

  useEffect(() => {
    const node = rootRef.current
    if (!node) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== 'Escape' && event.key !== ' ') return
      event.preventDefault()
      /* AN EVENT HAS ONE WAY OUT. Escape means "up one level" everywhere else in this menu, and
         there is no level above a moment -- so it is stopped here rather than reaching App's
         window listener, which would carry it out of a menu you had not navigated into. */
      event.stopPropagation()
      onContinue(moment.mark)
    }
    node.addEventListener('keydown', onKey)
    return () => node.removeEventListener('keydown', onKey)
  }, [moment.mark, onContinue])

  const count = moment.cards.length

  return (
    <div className="mn-open un-open" ref={rootRef} tabIndex={-1}>
      <div className="mn-frame" ref={frameRef}>
        <div className="pj-cap">
          <b>解放</b><i>SOMETHING OPENED</i>
          <s>{count === 1 ? 'ONE NEW THING' : `${count} NEW THINGS`}</s>
        </div>

        {/* WHAT YOU JUST FINISHED. The moment is named for the MILESTONE that fired it, not for
            what it opened — and where no single milestone is common to all of them, there is no
            stamp rather than a guessed one. */}
        {moment.stamp ? (
          <div className="un-stamp">
            {moment.stamp.jp ? <span className="k" lang="ja">{moment.stamp.jp}</span> : null}
            <span className="r" aria-hidden="true" />
            <span className="n">{moment.stamp.en}</span>
            <span className="s">ON THE PATH</span>
            {/* MASTERED and REACHED are different triggers and the catalog is careful about it */}
            <span className="w">{moment.stamp.word}</span>
          </div>
        ) : (
          <div className="un-stamp un-nostamp">
            <span className="n">{count === 1 ? 'A NEW THING' : 'NEW THINGS'}</span>
            <span className="s">NO ONE STEP OPENED ALL OF THESE</span>
          </div>
        )}

        {/* AND WHAT IT OPENED. Peers: one to three, unordered, all available — a moment that
            invented its own shape would be a moment nobody could read. The cards are a fixed
            height and the band centres them, because the weight of a moment is the NUMBER of
            cards; flexed to share the band, a single unlock renders as one line of type floating
            in a blank sheet, which reads as a load failure rather than as emphasis. */}
        <div className="un-lead">これが開いた · AND THIS IS NOW OPEN TO YOU</div>
        <div className="un-list">
          {moment.cards.map((card) => (
            <div className="un-card" key={card.featureId}>
              <span className="t">
                <b>{card.name}</b>
                <i>{UNLOCK_LEADS_TO[card.featureId] ?? card.category.replace(/_/g, ' ').toUpperCase()}</i>
              </span>
              {/* two of the nine award no badge, and an absent one is drawn as absent */}
              {card.badge ? <span className="b">BADGE EARNED</span> : null}
            </div>
          ))}
        </div>

        <button
          type="button"
          className="un-slab"
          onClick={() => onContinue(moment.mark)}
        >
          <em>NOTHING ELSE IS WAITING</em><b>CONTINUE ▸</b>
        </button>
        <div className="mn-hint">ENTER CONTINUES</div>
      </div>
    </div>
  )
}
