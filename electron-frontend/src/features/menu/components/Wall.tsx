import { useEffect, useRef, useState } from 'react'
import { BADGE_ICONS, BADGE_ICON_FALLBACK, useAchievements } from '../../achievements'
import { flatSeals, sealGroups, sealMark, wallStep } from '../wall'
import { screenHead } from '../chrome'
import { ScreenHead } from './ScreenHead'
import { screenClass, useEntered, useFrameFit } from '../useScreen'
import '../../../styles/stage.css'
import '../menu.css'

export interface WallProps {
  onUp: () => void
}

export function Wall({ onUp }: WallProps) {
  const entered = useEntered()
  const frameRef = useFrameFit()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [at, setAt] = useState(0)
  const { badges, loading } = useAchievements()
  const groups = sealGroups(badges)
  const flat = flatSeals(groups)
  const here = flat[Math.min(at, Math.max(0, flat.length - 1))]


  useEffect(() => { rootRef.current?.focus({ preventScroll: true }) }, [])

  useEffect(() => {
    const node = rootRef.current
    if (!node) return
    const onKey = (event: KeyboardEvent) => {
      const step = (dx: number, dy: number) => {
        event.preventDefault()
        setAt((i) => wallStep(groups, i, dx, dy))
      }
      if (event.key === 'ArrowRight') step(1, 0)
      else if (event.key === 'ArrowLeft') step(-1, 0)
      else if (event.key === 'ArrowDown') step(0, 1)
      else if (event.key === 'ArrowUp') step(0, -1)
    }
    node.addEventListener('keydown', onKey)
    return () => node.removeEventListener('keydown', onKey)
  }, [groups])

  const total = flat.length
  const earned = flat.filter((s) => s.earned).length
  const Icon = here ? (BADGE_ICONS[here.icon] ?? BADGE_ICON_FALLBACK) : BADGE_ICON_FALLBACK
  const bigMark = here ? sealMark(here.descriptor) : null
  /* which of the three groups the selected seal came out of, which the detail bar never said */
  const bigGroup = here
    ? groups.find((g) => g.seals.some((x) => x.descriptor === here.descriptor))?.en ?? ''
    : ''

  return (
    <div className={screenClass(entered)} ref={rootRef} tabIndex={-1}>
      <div className="mn-frame" ref={frameRef}>
        <ScreenHead
          head={screenHead('RECORDS', 'wall')}
          note={loading ? 'READING YOUR BADGES' : `${earned} / ${total} SEALS`}
        />

        <div className="bw-rows">
          {groups.map((g) => (
            <div key={g.key} className="bw-row">
              <span className="bw-lab">
                <b>{g.jp}</b><i>{g.en}</i><u>{g.earned} / {g.seals.length}</u>
              </span>
              <span className="bw-seals">
                {g.seals.map((s) => {
                  const index = flat.indexOf(s)
                  const SealIcon = BADGE_ICONS[s.icon] ?? BADGE_ICON_FALLBACK
                  /* the figure where the badge is one, the pictogram where it is not -- see
                     `sealMark`, and the note at the top of `wall.ts` for why three identical
                     grey rings was the thing worth fixing */
                  const mark = sealMark(s.descriptor)
                  const cls = ['bw-seal']
                  if (mark) cls.push('num')
                  if (s.earned) cls.push('got')
                  if (index === at) cls.push('on')
                  return (
                    <button
                      key={s.descriptor}
                      type="button"
                      className={cls.join(' ')}
                      onFocus={() => setAt(index)}
                      onClick={() => setAt(index)}
                      aria-label={`${s.name} — ${s.earned ? 'earned' : 'not yet'}. ${s.takes}`}
                    >
                      {mark ?? <SealIcon size={19} strokeWidth={2.4} aria-hidden="true" />}
                    </button>
                  )
                })}
              </span>
            </div>
          ))}
        </div>

        {/* THE DESCRIPTION IS THE REQUIREMENT, so an unearned seal has something to say without a
            second field being invented for it. */}
        {here ? (
          <div className="bw-detail">
            <span className={[
              'bw-big', bigMark ? 'num' : '', here.earned ? 'got' : '',
            ].filter(Boolean).join(' ')}>
              {bigMark ?? <Icon size={38} strokeWidth={2} aria-hidden="true" />}
            </span>
            <span className="bw-txt"><b>{here.name}</b><i>{here.takes}</i></span>
            <span className={here.earned ? 'bw-state got' : 'bw-state'}>
              <b>{here.earned ? 'EARNED' : 'NOT YET'}</b>
              {/* WHICH OF THE THREE GROUPS IT BELONGS TO, which the detail bar never said -- so a
                  seal picked out of the middle row had no way of telling you what row that was. */}
              <i>{bigGroup}</i>
            </span>
          </div>
        ) : null}

                <div className="back-tab">
          <button type="button" onClick={onUp}>
            <b className="bt-en">Back</b><em className="bt-jp">戻る</em>
          </button>
        </div>
        <div className="hints">
          <span><b>← →</b>Choose<em>選択</em></span>
          <span><b>ESC</b>Back<em>戻る</em></span>
        </div>
      </div>
    </div>
  )
}
