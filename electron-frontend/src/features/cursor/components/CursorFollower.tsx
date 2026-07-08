import { memo, useMemo } from 'react'
import type { UseCursorReturn } from '../useCursor'

export const CursorFollower = memo(function CursorFollower({
  cursorPos,
  ringPos,
  ringScale,
  cursorSize,
  isHoveringInteractive,
  cursorSizeMap,
  dotColor,
  ringBorderColor,
}: Pick<
  UseCursorReturn,
  'cursorPos' | 'ringPos' | 'ringScale' | 'cursorSize' | 'isHoveringInteractive' | 'cursorSizeMap' | 'dotColor' | 'ringBorderColor'
>) {
  const sizeConfig = cursorSizeMap[cursorSize] ?? cursorSizeMap[2]

  const ringSize = useMemo(
    () => sizeConfig.ring * (isHoveringInteractive ? 1.5 : 1) * ringScale,
    [sizeConfig.ring, ringScale, isHoveringInteractive],
  )
  const ringMargin = useMemo(() => -(ringSize / 2), [ringSize])

  if (cursorPos.x < -50 || cursorPos.y < -50) return null

  return (
    <>
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: ringSize,
          height: ringSize,
          borderRadius: '9999px',
          border: `1.5px solid ${ringBorderColor}`,
          background: 'transparent',
          marginLeft: ringMargin,
          marginTop: ringMargin,
          pointerEvents: 'none',
          zIndex: 9998,
          transform: `translate3d(${ringPos.x}px, ${ringPos.y}px, 0)`,
          willChange: 'transform',
          transition: 'width 160ms ease, height 160ms ease, margin 160ms ease, border-color 160ms ease',
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: sizeConfig.dot,
          height: sizeConfig.dot,
          borderRadius: '9999px',
          background: dotColor,
          marginLeft: -(sizeConfig.dot / 2),
          marginTop: -(sizeConfig.dot / 2),
          pointerEvents: 'none',
          zIndex: 9999,
          transform: `translate3d(${cursorPos.x}px, ${cursorPos.y}px, 0)`,
          willChange: 'transform',
        }}
      />
    </>
  )
})
