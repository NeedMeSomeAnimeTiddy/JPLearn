import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

/* No em or en dashes in anything the app shows (Robbie, 2026-10-29). Copy is reworded with a comma,
   colon, full stop or brackets; ranges take a hyphen; an empty value is the Japanese dash ― (U+2015).
   This walks every string literal, template piece and JSX text in the renderer and the main process
   and fails on U+2013 or U+2014, written as the character or as an escape ('\u2014', '&mdash;').
   Comments are not literals, so they are never read; tests are not walked. The root CLAUDE.md
   "Key conventions" carries the rule; tests/test_no_long_dashes.py is the Python half. */

const LONG_DASH = /[–—]/
// JSX text and attribute strings keep their HTML entities undecoded, and JSX decodes them
const LONG_DASH_ENTITY = /&(?:mdash|ndash);|&#(?:8211|8212|x201[34]);/i
// cheap test before a file is parsed: the character, an escape of it, or an entity
const MAY_HOLD_LONG_DASH = /[–—]|\\u\{?0*201[34]|&(?:mdash|ndash);|&#(?:8211|8212|x201[34]);/i
const FRONTEND = join(__dirname, '..', '..')

/* Each entry is a literal that matches dashes rather than showing them. `text` is a piece of the
   literal's source, so an entry follows its line when the file moves around it. */
const ALLOWED: ReadonlyArray<{ file: string; text: string; reason: string }> = [
  { file: 'src/features/scenario-tutor/utils.ts', text: "'–'",
    reason: 'DASH_VARIANTS: folds a typed en dash to the long vowel mark before an answer is matched' },
  { file: 'src/features/scenario-tutor/utils.ts', text: "'—'",
    reason: 'DASH_VARIANTS: folds a typed em dash to the long vowel mark before an answer is matched' },
  { file: 'src/valley/crowd.ts', text: 'same rotation as the position — a figure whose geometry turns',
    reason: 'a comment inside GLSL shader source; it is compiled by WebGL, never drawn' },
]

interface DashHit { file: string; line: number; text: string }

function isConsoleCall(node: ts.Node): boolean {
  return ts.isCallExpression(node)
    && ts.isPropertyAccessExpression(node.expression)
    && ts.isIdentifier(node.expression.expression)
    && node.expression.expression.text === 'console'
}

/** Every literal in `source` that holds an em or en dash. Arguments to `console.*` are log lines
 *  for a developer, not copy, so they are skipped. */
function findLongDashes(file: string, source: string): DashHit[] {
  if (!MAY_HOLD_LONG_DASH.test(source)) return []
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : file.endsWith('.cjs') ? ts.ScriptKind.JS : ts.ScriptKind.TS
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind)
  const hits: DashHit[] = []
  const visit = (node: ts.Node): void => {
    if (isConsoleCall(node)) return
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node)
      || ts.isTemplateMiddle(node) || ts.isTemplateTail(node) || ts.isJsxText(node)) {
      // tested decoded ('\u2014' is a dash) and reported as written, which is what the allowlist matches
      const text = node.getText(sf)
      const shown = node.text
      const jsx = ts.isJsxText(node) || ts.isJsxAttribute(node.parent)
      if (LONG_DASH.test(shown) || (jsx && LONG_DASH_ENTITY.test(shown))) {
        hits.push({ file, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, text })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return hits
}

function walk(dir: string, keep: (name: string) => boolean): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules') return []
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return walk(path, keep)
    return keep(entry.name) ? [path] : []
  })
}

const isTest = (name: string): boolean => /\.test\./.test(name)

function shippedFiles(): string[] {
  return [
    ...walk(join(FRONTEND, 'src'), (name) => /\.tsx?$/.test(name) && !isTest(name)),
    ...walk(join(FRONTEND, 'electron'), (name) => name.endsWith('.cjs') && !isTest(name)),
  ]
}

describe('no em or en dashes in shown text', () => {
  it('catches a planted dash in a literal, a template and JSX text, and leaves comments and logs alone', () => {
    const planted = [
      "const a = 'Hello — world'",
      '// a comment — is not shown',
      'const b = `${a} – ${a}`',
      "console.warn('a log line — for a developer')",
      'const c = <p>Range 1–5</p>',
      "const d = '\\u2014'",
      'const e = <p>A &mdash; B</p>',
      "const f = '\\u2015'",
      'const g = <p title="A &ndash; B">x</p>',
    ].join('\n')
    expect(findLongDashes('planted.tsx', planted).map((hit) => hit.line)).toEqual([1, 3, 5, 6, 7, 9])
    expect(findLongDashes('planted.tsx', planted.replace(/[–—]|\\u2014|&[mn]dash;/g, '―'))).toEqual([])
  })

  it('finds none outside the allowlist', () => {
    const used = new Set<(typeof ALLOWED)[number]>()
    const offenders: string[] = []
    for (const path of shippedFiles()) {
      const file = relative(FRONTEND, path).replace(/\\/g, '/')
      for (const hit of findLongDashes(file, readFileSync(path, 'utf8'))) {
        const allowed = ALLOWED.find((entry) => entry.file === file && hit.text.includes(entry.text))
        if (allowed) used.add(allowed)
        else offenders.push(`${file}:${hit.line}  ${hit.text.replace(/\s+/g, ' ').slice(0, 120)}`)
      }
    }
    expect(offenders).toEqual([])
    /* an entry nothing matches any more is stale and would quietly let a new dash through */
    expect(ALLOWED.filter((entry) => !used.has(entry)).map((entry) => `${entry.file}: ${entry.text}`)).toEqual([])
  })
})
