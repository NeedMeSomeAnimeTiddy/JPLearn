import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { BADGE_METADATA, useAchievements } from '../../achievements'
import type { StudySummaryPayload } from '../../../types'
import type { XPProgressPayload } from '../../../generated/types'
import {
  LEDGER_DAYS, accColour, buildLedger, ledgerYear, type ActivityDay, type LedgerYear,
} from '../ledger'
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
  const frameRef = useRef<HTMLDivElement | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const { year, loading } = useYear()
  const { badges } = useAchievements()
  const total = Object.keys(BADGE_METADATA).length
  const earned = badges.filter((b) => b.earned).length
  const L = buildLedger(summary, xp, year, { earned, total })

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
      if (event.key === 'Enter') { event.preventDefault(); onOpenAchievements() }
    }
    node.addEventListener('keydown', onKey)
    return () => node.removeEventListener('keydown', onKey)
  }, [onOpenAchievements])

  const maxWeek = Math.max(1, ...L.year.weeks.map((w) => w.n))

  return (
    <div className="mn-open" ref={rootRef} tabIndex={-1}>
      <div className="mn-frame" ref={frameRef}>
        <div className="lg-wrap">

        {/* THE GHOST IS THE WHOLE IDEA OF THIS DRAWING: your best run set in the same face at the
            same weight and fifteen percent ink, so the current number is read against it without a
            second scale, a second axis or a word of explanation. */}
        <div className="lg-f lg-streak lg-plate">
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
        </div>

        <div className="lg-rest">
          <span className="lg-resthead">その他 THE REST OF THE LEDGER</span>
          {L.rows.map((row) => (
            <span key={row.key} className="lg-row">
              <span className="lg-rowlab"><b>{row.en}</b><i>{row.jp}</i></span>
              {row.value === null ? (
                <span className="lg-none">—<em>{row.absent}</em></span>
              ) : (
                <b className="lg-figure">{row.value}<em>{row.unit}</em></b>
              )}
            </span>
          ))}
        </div>

        {/* ONE BAR IS A WEEK. Height is volume and colour is accuracy, so both channels are on the
            screen at once — a contribution grid has one square per day and can carry only one. */}
        <div className="lg-f lg-year lg-plate">
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
          <span className="lg-bars">
            {L.year.weeks.map((w, i) => (
              w.n
                ? (
                  <i
                    key={i}
                    style={{ height: 4 + Math.round(68 * (w.n / maxWeek)), background: accColour(w.acc) }}
                  />
                )
                : <i key={i} className="none" style={{ height: 3 }} />
            ))}
          </span>
        </div>

        {L.level ? (
          <div className="lg-f lg-lv">
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
          </div>
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
