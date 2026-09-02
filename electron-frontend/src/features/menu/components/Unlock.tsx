import { useEffect, useLayoutEffect, useRef } from 'react'
import { UNLOCK_GOES_TO, UNLOCK_LEADS_TO, type UnlockMoment } from '../unlock'
import type { MenuSectionKey } from '../types'
import { screenClass, useEntered } from '../useScreen'
import { ScreenHead } from './ScreenHead'
import '../../../styles/stage.css'
import '../menu.css'

export interface UnlockProps {
  moment: UnlockMoment
  /** dismiss, and remember the mark that says this was announced */
  onContinue: (mark: string) => void
  /* WHERE A CARD LEADS, if the caller can take you there. Optional so the moment can still be
     rendered on its own -- in a test, or anywhere the menu's navigation is not mounted -- in which
     case every card stays a plain card rather than a door that goes nowhere. */
  onGo?: (section: MenuSectionKey, screen?: string) => void
}

export function Unlock({ moment, onContinue, onGo }: UnlockProps) {
  const entered = useEntered()
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
    <div className={screenClass(entered, 'un-open')} ref={rootRef} tabIndex={-1}>
      <div className="mn-frame" ref={frameRef}>
        {/* THE ONE HEADING THAT BELONGS TO NO SECTION, because the moment belongs to none: it can
            fire off the path, off a drill or off a streak. The mark is 解 on the menu's own gold
            rather than a section's colour, which is the whole of what says "this is not a place you
            navigated to". */}
        <ScreenHead
          head={{ mark: '解', accent: '#cfa45c', kick: null, en: 'SOMETHING OPENED', jp: '解放' }}
          note={count === 1 ? 'ONE NEW THING' : `${count} NEW THINGS`}
        />

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
          {moment.cards.map((card) => {
            const where = UNLOCK_LEADS_TO[card.featureId]
              ?? card.category.replace(/_/g, ' ').toUpperCase()
            const route = onGo ? UNLOCK_GOES_TO[card.featureId] : undefined
            const body = (
              <>
                <span className="t">
                  <b>{card.name}</b>
                  <i>{where}</i>
                </span>
                {/* two of the nine award no badge, and an absent one is drawn as absent */}
                {card.badge ? <span className="b">BADGE EARNED</span> : null}
                {route ? <span className="go">GO ▸</span> : null}
              </>
            )
            /* A CARD WITH A ROUTE IS A DOOR; ONE WITHOUT IS STILL A CARD. Every one of these has
               named its destination since the screen landed and none of them could reach it -- the
               only way out was CONTINUE, back to the front door, and then navigating by hand to the
               place the card had just told you about. `themes` lives in Settings, which this menu
               has no route into, so it keeps its label and stays a card: saying the true thing you
               have beats inventing the one you do not. */
            if (!route) return <div className="un-card" key={card.featureId}>{body}</div>
            return (
              <button
                type="button"
                className="un-card is-door"
                key={card.featureId}
                aria-label={`${card.name} — open ${where}`}
                onClick={() => {
                  /* THE MOMENT IS DISMISSED FIRST. It is an event rather than a place, and
                     `menuLevel` goes to a level nothing matches while it is up -- so navigating
                     without marking it seen would put the section behind a moment that is still
                     on screen and never comes down. */
                  onContinue(moment.mark)
                  onGo?.(route.section, route.screen)
                }}
              >
                {body}
              </button>
            )
          })}
        </div>

        <button
          type="button"
          className="un-slab"
          onClick={() => onContinue(moment.mark)}
        >
          <em>NOTHING ELSE IS WAITING</em><b>CONTINUE ▸</b>
        </button>
        <div className="hints">
          <span><b>ENTER</b>Open<em>決定</em></span>
          <span><b>ESC</b>Back<em>戻る</em></span>
        </div>
      </div>
    </div>
  )
}
