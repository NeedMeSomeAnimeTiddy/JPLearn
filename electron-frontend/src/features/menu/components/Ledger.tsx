import { useEffect, useRef, useState } from 'react'
import { BADGE_METADATA, useAchievements } from '../../achievements'
import type { StudySummaryPayload } from '../../../types'
import type { XPProgressPayload } from '../../../generated/types'
import {
  LEDGER_DAYS, accColour, buildLedger, ledgerSheet, ledgerYear,
  type ActivityDay, type LedgerYear, type SheetKey,
} from '../ledger'
import { screenHead } from '../chrome'
import { ScreenHead } from './ScreenHead'
import { screenClass, useEntered, useFrameFit } from '../useScreen'
import '../../../styles/stage.css'
import '../menu.css'

const EMPTY_YEAR: LedgerYear = ledgerYear([], new Date(0))

/* THE TWO CALLS THIS SCREEN NEEDS ARE MADE FROM INSIDE IT, which is different from the other L2s
   and better. They take an `enabled` flag from `App` because their hooks live there; this one is
   only ever mounted when the ledger is up, so being mounted IS the flag. And `useAchievements` is
   the app's own hook, which already folds three sources into one earned set — feature badges,
   milestone badges and node mastery — so re-deriving that here would be a second answer to a
   question the app has already answered. */
function useYear(): { year: LedgerYear; loading: boolean } {
  const [year, setYear] = useState<LedgerYear>(EMPTY_YEAR)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const getDailyActivity = window.jplearnDesktop?.getDailyActivity
    if (!getDailyActivity) { setLoading(false); return }
    let alive = true
    void getDailyActivity(LEDGER_DAYS)
      .then((payload) => {
        if (!alive) return
        setYear(ledgerYear((payload?.days ?? []) as ActivityDay[], new Date()))
      })
      .catch(() => { /* the band draws empty, which on a new account is also the true answer */ })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  return { year, loading }
}

export interface LedgerProps {
  summary: StudySummaryPayload | null
  xp: XPProgressPayload | null
  onOpenAchievements: () => void
  onUp: () => void
}

export function Ledger({ summary, xp, onOpenAchievements, onUp }: LedgerProps) {
  const entered = useEntered()
  const frameRef = useFrameFit()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const { year, loading } = useYear()
  const { badges } = useAchievements()
  const total = Object.keys(BADGE_METADATA).length
  const earned = badges.filter((b) => b.earned).length
  const L = buildLedger(summary, xp, year, { earned, total })


  useEffect(() => { rootRef.current?.focus({ preventScroll: true }) }, [])

  useEffect(() => {
    const node = rootRef.current
    if (!node) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Enter') { event.preventDefault(); onOpenAchievements() }
    }
    node.addEventListener('keydown', onKey)
    return () => node.removeEventListener('keydown', onKey)
  }, [onOpenAchievements])

  const maxWeek = Math.max(1, ...L.year.weeks.map((w) => w.n))

  /* ==================================================================================================
     WHICH FIGURE IS OPEN, AND WHY THIS SCREEN NEEDED ONE AT ALL.

     Every plate here was a dead end: a number to read and nothing to press, on the one screen whose
     whole subject is what you have actually done. See `ledgerSheet` for what is behind each and why
     the caveat is the part that matters.

     ESCAPE IS CAPTURED, the same way the stat chips capture it: the key is already spoken for by the
     level above, so an open sheet has to eat it or closing a sheet leaves the screen. */
  const [sheetKey, setSheetKey] = useState<SheetKey | null>(null)
  const sheet = sheetKey ? ledgerSheet(sheetKey, L) : null
  useEffect(() => {
    if (!sheetKey) return
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setSheetKey(null); e.stopPropagation() }
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [sheetKey])

  /* a plate with nothing behind it stays a plate rather than opening onto four dashes */
  const plate = (key: SheetKey) => (ledgerSheet(key, L) ? () => setSheetKey(key) : undefined)

  return (
    <div className={screenClass(entered)} ref={rootRef} tabIndex={-1}>
      <div className="mn-frame" ref={frameRef}>
        <ScreenHead head={screenHead('RECORDS', null)} />
        <div className="lg-wrap">

        {/* THE GHOST IS THE WHOLE IDEA OF THIS DRAWING: your best run set in the same face at the
            same weight and fifteen percent ink, so the current number is read against it without a
            second scale, a second axis or a word of explanation. */}
        <button type="button" className="lg-f lg-streak lg-plate" onClick={plate('streak')}>
          <span className="lg-cap">
            <b>連続 STREAK</b><i>A DAY COUNTS WHEN YOU REVIEW</i>
          </span>
          <span className="lg-run">
            <b className="lg-now">{L.streak.now}</b>
            <span className="lg-nowlab">
              <b>DAY{L.streak.now === 1 ? '' : 'S'}</b><i>RUNNING NOW</i>
            </span>
            <span className="lg-ghost">
              <b>{L.streak.best}</b><i>YOUR BEST RUN</i>
            </span>
          </span>
          <span className="lg-frz">
            <s aria-hidden="true">
              {Array.from({ length: L.streak.freezes }, (_, i) => <i key={i}>凍</i>)}
            </s>
            <em>
              {L.streak.freezes} FREEZE{L.streak.freezes === 1 ? '' : 'S'} LEFT
              {' · ONE COVERS A MISSED DAY'}
            </em>
          </span>
        </button>

        <div className="lg-rest">
          <span className="lg-resthead">その他 THE REST OF THE LEDGER</span>
          {L.rows.map((row) => (
            <button
              key={row.key}
              type="button"
              className="lg-row"
              onClick={plate(row.key as SheetKey)}
              aria-label={`${row.en} — see what it is made of`}
            >
              <span className="lg-rowlab"><b>{row.en}</b><i>{row.jp}</i></span>
              {row.value === null ? (
                <span className="lg-none">—<em>{row.absent}</em></span>
              ) : (
                <b className="lg-figure">{row.value}<em>{row.unit}</em></b>
              )}
            </button>
          ))}
        </div>

        {/* ONE BAR IS A WEEK. Height is volume and colour is accuracy, so both channels are on the
            screen at once — a contribution grid has one square per day and can carry only one. */}
        <button type="button" className="lg-f lg-year lg-plate" onClick={plate('year')}>
          <span className="lg-cap">
            {/* the caption is where "still counting" belongs now that the screen has no heading
                of its own: a year drawn as 0 of 365 while the window is still open is a lie the
                plate itself tells, so the plate is what corrects it */}
            <b>
              {loading
                ? '一年 THE YEAR · STILL COUNTING'
                : `一年 THE YEAR · ${L.year.active} OF ${L.year.total} DAYS`
                  + (L.year.reviews ? ` · ${L.year.reviews.toLocaleString()} REVIEWS` : '')}
            </b>
            <i>ONE BAR IS A WEEK · HEIGHT IS VOLUME, COLOUR IS ACCURACY</i>
          </span>
          {/* EVERY WEEK IS A SLOT, filled or not -- see the note over `.lg-bars i`. A week with
              nothing in it drawn as nothing at all is indistinguishable from the end of the year,
              which is exactly the reading a records screen must not give. */}
          <span className="lg-bars">
            {L.year.weeks.map((w, i) => (
              <i key={i} className={i === L.year.weeks.length - 1 ? 'now' : undefined}>
                {w.n ? (
                  <u style={{
                    height: `${Math.min(100, 6 + Math.round(94 * (w.n / maxWeek)))}%`,
                    background: accColour(w.acc),
                  }} />
                ) : null}
              </i>
            ))}
          </span>
        </button>

        {L.level ? (
          <button type="button" className="lg-f lg-lv" onClick={plate('level')}>
            <span className="lg-lvn"><span>LEVEL 等級</span><b>{L.level.level}</b></span>
            <span className="lg-xp">
              <span className="lg-xprow">
                <b>{L.level.xpIn} / {L.level.xpOf} XP THIS LEVEL</b>
                <i>{Math.max(0, L.level.xpOf - L.level.xpIn)} XP TO LEVEL {L.level.level + 1}</i>
              </span>
              <span className="lg-xpbar">
                <i style={{ width: `${Math.round((L.level.xpIn / Math.max(1, L.level.xpOf)) * 100)}%` }} />
              </span>
            </span>
          </button>
        ) : null}

        {/* THE ONE THING HERE THAT IS A PLACE rather than a figure, which is why it is a door and
            sits at the end. Its own screen is the wall (phase 5); until then it opens the panel
            that shows them today. */}
        <button
          type="button"
          className="lg-f lg-ach"
          onClick={onOpenAchievements}
          aria-label={`Achievements — ${earned} of ${total} earned`}
        >
          <span className="lg-pips" aria-hidden="true">
            {Object.keys(BADGE_METADATA).map((d) => (
              <i key={d} className={badges.some((b) => b.descriptor === d && b.earned) ? 'got' : ''} />
            ))}
          </span>
          <em>{earned} / {total} EARNED · SEE THEM ▸</em>
        </button>

        </div>

        {sheet ? (
          <>
            {/* THE SCRIM IS A BUTTON, not a div with a handler: it is the primary way out of this
                sheet and a click target that no keyboard can reach is not a way out at all. */}
            <button
              type="button"
              className="lg-scrim"
              aria-label="Close"
              onClick={() => setSheetKey(null)}
            />
            <div className="lg-sheet" role="dialog" aria-label={`${sheet.en} — the whole of it`}>
              <span className="lg-cap"><b>{sheet.jp} {sheet.en}</b><i>THE WHOLE OF IT</i></span>
              {sheet.strip ? (
                <>
                  <span className="lg-strip">
                    {L.year.weeks.map((w, i) => (
                      w.n
                        ? (
                          <i
                            key={i}
                            style={{
                              height: 4 + Math.round(36 * (w.n / maxWeek)),
                              background: sheet.acc ? accColour(w.acc) : 'var(--gold)',
                            }}
                          />
                        )
                        : <i key={i} className="none" style={{ height: 3 }} />
                    ))}
                  </span>
                  <span className="lg-stripcap"><b>52 WEEKS AGO</b><b>THIS WEEK</b></span>
                </>
              ) : null}
              {sheet.lines.map((l) => (
                <span key={l.k} className={l.off ? 'lg-line off' : 'lg-line'}>
                  <b>{l.k}</b><i>{l.v}</i>
                </span>
              ))}
              <span className="lg-note">{sheet.note}</span>
            </div>
          </>
        ) : null}

        <div className="back-tab">
          <button type="button" onClick={onUp}>
            <b className="bt-en">Back</b><em className="bt-jp">戻る</em>
          </button>
        </div>
        <div className="hints">
          <span><b>ENTER</b>Badges<em>賞</em></span>
          <span><b>ESC</b>Back<em>戻る</em></span>
        </div>
      </div>
    </div>
  )
}
