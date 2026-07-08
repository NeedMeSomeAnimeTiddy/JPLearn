import type { CursorTheme } from './types'
import { CURSOR_HOTSPOTS } from './constants'

function makeSvgUri(rawSvg: string): string {
  const encoded = encodeURIComponent(rawSvg.replace(/\n/g, '').replace(/\s{2,}/g, ' ').trim())
  return `data:image/svg+xml,${encoded}`
}

function svgBody(body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">${body}</svg>`
}

const CLASSIC_SVG_BODY = `<polygon points="4,2 24,14 14,14 12,24 4,2" fill="{color}" stroke="#fff" stroke-width="0.8"/>`
const SAKURA_SVG_BODY = `<g transform="translate(14,14)">{petals}</g>`

function sakuraPetal(i: number): string {
  const angle = (i * 72 - 90) * (Math.PI / 180)
  const cx = Math.cos(angle) * 5.2
  const cy = Math.sin(angle) * 5.2
  return `<ellipse cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" rx="4.8" ry="8" fill="{color}" opacity="0.88" transform="rotate(${i * 72},${cx.toFixed(2)},${cy.toFixed(2)})"/>`
}

function buildSakuraBody(): string {
  let petals = ''
  for (let i = 0; i < 5; i++) {
    petals += sakuraPetal(i)
  }
  petals += `<circle cx="0" cy="0" r="2.2" fill="#fff" opacity="0.7"/>`
  return SAKURA_SVG_BODY.replace('{petals}', petals)
}

const INK_SVG_BODY = `<path d="M6,2 Q4,10 8,16 L12,18 Q10,10 14,2 Z" fill="{color}" stroke="#fff" stroke-width="0.5" opacity="0.9"/>`

const NEON_SVG_BODY = `<circle cx="14" cy="14" r="10" fill="none" stroke="{color}" stroke-width="1.4" opacity="0.45"/><circle cx="14" cy="14" r="4.5" fill="{color}" opacity="0.88"/>`

const THEME_SVG_BUILDERS: Record<CursorTheme, () => string> = {
  classic: () => CLASSIC_SVG_BODY,
  sakura: () => buildSakuraBody(),
  ink_brush: () => INK_SVG_BODY,
  neon_dot: () => NEON_SVG_BODY,
}

export function generateCursorSvg(theme: CursorTheme, accentColor: string): string {
  const builder = THEME_SVG_BUILDERS[theme]
  const raw = builder().replace(/\{color\}/g, accentColor)
  return svgBody(raw)
}

export function generateCursorDataUri(theme: CursorTheme, accentColor: string): string {
  return makeSvgUri(generateCursorSvg(theme, accentColor))
}

export function getCursorAccentColor(): string {
  if (typeof document === 'undefined') return '#b07a5c'
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
  return accent || '#b07a5c'
}

export function isPointerFine(): boolean {
  if (typeof window === 'undefined') return true
  return window.matchMedia('(pointer: fine)').matches
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function getCursorHotspot(theme: CursorTheme): { x: number; y: number } {
  return CURSOR_HOTSPOTS[theme]
}

export function isInteractiveElement(element: Element | null): boolean {
  if (!element) return false
  const tag = element.tagName.toLowerCase()
  if (tag === 'button' || tag === 'a' || tag === 'input' || tag === 'select' || tag === 'textarea') return true
  const role = element.getAttribute('role')
  if (role === 'button' || role === 'link' || role === 'menuitem' || role === 'option' || role === 'tab') return true
  if (element.hasAttribute('tabindex') && (element.getAttribute('tabindex') === '0' || Number(element.getAttribute('tabindex')) >= 0)) return true
  return false
}

const SVG_CACHE = new Map<string, string>()

export function getCachedCursorUri(theme: CursorTheme, accent: string): string {
  const cacheKey = `${theme}:${accent}`
  const cached = SVG_CACHE.get(cacheKey)
  if (cached) return cached
  const uri = generateCursorDataUri(theme, accent)
  SVG_CACHE.set(cacheKey, uri)
  return uri
}
