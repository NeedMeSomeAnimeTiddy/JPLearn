import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import axe from 'axe-core'
import type { KanjiDetailPayload } from '../../generated/types'
import { LookupOverlay } from './components/LookupOverlay'
import type { LookupAssistant, LookupChat, LookupOcr, LookupRouteKey } from './types'
import { useLookup } from './useLookup'
import { LOOKUP_GATE_COPY } from './constants'
import { chatGate, ocrGate, pageReply } from './utils'

/* The overlay is driven entirely by the controller, so the harness mounts the real hook and drives
   the pair -- the sequencing lives in the hook and the absence-drawing lives in the component, and
   either one alone would pass while the two together failed.

   Real timers throughout: the hook debounces by 180ms and `waitFor` polls on real timers, so fake
   ones make the two deadlock rather than making the test faster. */
const onOpenKanjiDetail = vi.fn()
const onOpenDictionary = vi.fn()

function Harness({ seed = '', route, assistant }: {
  seed?: string; route?: LookupRouteKey; assistant?: LookupAssistant
}) {
  const controller = useLookup()
  return (
    <>
      <button type="button" onClick={() => controller.open(seed, route)}>open lookup</button>
      <LookupOverlay
        controller={controller}
        onOpenKanjiDetail={onOpenKanjiDetail}
        onOpenDictionary={onOpenDictionary}
        assistant={assistant}
      />
    </>
  )
}

function chatSlice(overrides: Partial<LookupChat> = {}): LookupChat {
  return {
    enabled: true, disabledReason: LOOKUP_GATE_COPY.chatOff.reason, disabledHelp: LOOKUP_GATE_COPY.chatOff.help,
    turns: [], loading: false,
    error: null, send: vi.fn(), clear: vi.fn(), speakingKey: null, replay: vi.fn(), stopSpeaking: vi.fn(),
    audioEnabled: true, toggleAudio: vi.fn(), romajiEnabled: false, toggleRomaji: vi.fn(), charLimit: 600,
    ...overrides,
  }
}

function ocrSlice(overrides: Partial<LookupOcr> = {}): LookupOcr {
  return {
    enabled: true, disabledReason: LOOKUP_GATE_COPY.ocrNotInstalled.reason,
    disabledHelp: LOOKUP_GATE_COPY.ocrNotInstalled.help, busy: false, error: null,
    result: null, submit: vi.fn(), clear: vi.fn(), maxMb: 30,
    ...overrides,
  }
}

function withModel(chat: Partial<LookupChat> = {}, ocr: Partial<LookupOcr> = {}): LookupAssistant {
  return { chat: chatSlice(chat), ocr: ocrSlice(ocr) }
}

function withoutModel(): LookupAssistant {
  return withModel({ enabled: false }, { enabled: false })
}

function kanjiDetail(overrides: Partial<KanjiDetailPayload> = {}): KanjiDetailPayload {
  return {
    character: '語',
    meanings: [],
    on_readings: [],
    kun_readings: [],
    radicals: [],
    components: ['言', '口', '五'],
    jlpt_level: 'N5',
    jlpt_level_source: 'deck',
    stroke_count: null,
    classical_radical_number: null,
    tags: [],
    categories: ['Kanji N5'],
    compounds: [],
    has_more_compounds: false,
    source: 'committed',
    ...overrides,
  } as KanjiDetailPayload
}

function installApi(overrides: Record<string, unknown> = {}) {
  window.jplearnDesktop = {
    getKanjiDetail: vi.fn(async () => kanjiDetail()),
    searchDictionary: vi.fn(async (query: string) => ({
      query, source: 'loaded_cards' as const, results: [],
    })),
    lookupSentence: vi.fn(async () => ({ jp: null, en: null, romaji: null })),
    ...overrides,
  } as unknown as Window['jplearnDesktop']
}

function open(seed: string) {
  render(<Harness seed={seed} />)
  fireEvent.click(screen.getByText('open lookup'))
}

const field = () => screen.getByLabelText('What to look up')

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  vi.restoreAllMocks()
  onOpenKanjiDetail.mockReset()
  onOpenDictionary.mockReset()
})

describe('LookupOverlay', () => {
  it('is closed until it is opened, and closes again on Escape', async () => {
    installApi()
    render(<Harness />)
    expect(document.querySelector('.lk-open')).toBeNull()

    fireEvent.click(screen.getByText('open lookup'))
    await waitFor(() => expect(document.querySelector('.lk-open')).not.toBeNull())

    fireEvent.keyDown(field(), { key: 'Escape' })
    await waitFor(() => expect(document.querySelector('.lk-open')).toBeNull())
  })

  it('asks kanji-detail for a single kanji and shows what it got', async () => {
    installApi()
    open('語')

    await waitFor(() => expect(window.jplearnDesktop.getKanjiDetail).toHaveBeenCalledWith('語'))
    await waitFor(() => expect(screen.getByText(/N5/)).toBeTruthy())
    expect(screen.getByText('言')).toBeTruthy()
    expect(screen.getByText('五')).toBeTruthy()
  })

  it('draws a missing download as an absence, not as an empty row', async () => {
    installApi()
    open('語')

    const readings = await screen.findByText(/on and kun readings need the offline dictionary/i)
    /* the absent styling IS the fact: an empty value drawn like a real one would be a lie */
    expect(readings.closest('.lk-line')?.className).toContain('none')
    expect(screen.getByText(/THE OFFLINE DICTIONARY IS NOT INSTALLED/i)).toBeTruthy()
  })

  it('does not ask kanji-detail for something that is not one kanji', async () => {
    installApi()
    open('学校')

    await waitFor(() => expect(window.jplearnDesktop.searchDictionary).toHaveBeenCalledWith('学校'))
    expect(window.jplearnDesktop.getKanjiDetail).not.toHaveBeenCalled()
  })

  it('says when a word came from the decks rather than the dictionary', async () => {
    installApi({
      searchDictionary: vi.fn(async (query: string) => ({
        query,
        source: 'loaded_cards' as const,
        results: [{
          id: 1, source_id: null, note_key: 'n1', character: '学校', romaji: 'gakkou',
          meaning: 'school', tags: [], example_sentence: null, pitch_accents: [],
        }],
      })),
    })
    open('学校')

    expect(await screen.findByText(/FROM YOUR OWN DECKS/i)).toBeTruthy()
  })

  it('asks the bridge one command at a time, because it is serial', async () => {
    const order: string[] = []
    let inFlight = 0
    let overlapped = false
    const track = <T,>(name: string, value: T) => async () => {
      order.push(name)
      inFlight += 1
      if (inFlight > 1) overlapped = true
      await new Promise((resolve) => setTimeout(resolve, 10))
      inFlight -= 1
      return value
    }
    installApi({
      getKanjiDetail: vi.fn(track('kanji', kanjiDetail())),
      searchDictionary: vi.fn(track('word', { query: '語', source: 'loaded_cards', results: [] })),
      lookupSentence: vi.fn(track('phrase', { jp: null, en: null, romaji: null })),
    })

    open('語')
    await waitFor(() => expect(order.length).toBe(3))

    expect(overlapped).toBe(false)
    /* and the route the query asked for goes first, so the answer that matters arrives first */
    expect(order[0]).toBe('kanji')
  })

  it('hands a kanji off to the panel that already draws it properly', async () => {
    installApi()
    open('語')
    await waitFor(() => expect(window.jplearnDesktop.getKanjiDetail).toHaveBeenCalled())
    await screen.findByText(/N5/)

    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(onOpenKanjiDetail).toHaveBeenCalledWith('語', expect.anything())
    await waitFor(() => expect(document.querySelector('.lk-open')).toBeNull())
  })

  it('names the two model-backed routes without pretending to answer them', async () => {
    installApi()
    open('語')
    await waitFor(() => expect(document.querySelector('.lk-open')).not.toBeNull())

    const tutor = screen.getByTitle(/^assistant-chat: /) as HTMLButtonElement
    const ocr = screen.getByTitle(/^assistant-chat-ocr: /) as HTMLButtonElement
    expect(tutor.disabled).toBe(true)
    expect(ocr.disabled).toBe(true)
  })

  it('keeps the two model routes dimmed and says why when no model is installed', async () => {
    installApi()
    render(<Harness route="tutor" assistant={withoutModel()} />)
    fireEvent.click(screen.getByText('open lookup'))

    expect(await screen.findByText('This route needs the tutor model.')).toBeTruthy()
    expect(screen.getByText(LOOKUP_GATE_COPY.chatOff.reason)).toBeTruthy()
    expect(screen.getByText(LOOKUP_GATE_COPY.chatOff.help)).toBeTruthy()
    /* the foot says what the gate checks, not something stricter or looser */
    expect(screen.getByText('A QUESTION IS DIMMED UNTIL A TUTOR MODEL IS INSTALLED AND CHAT WITH TUTOR IS ON')).toBeTruthy()
    expect((screen.getByTitle(`assistant-chat: ${LOOKUP_GATE_COPY.chatOff.reason}`) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByTitle(`assistant-chat-ocr: ${LOOKUP_GATE_COPY.ocrNotInstalled.reason}`) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/CTRL\+, OPENS SETTINGS/)).toBeTruthy()
  })

  it('gives A SCREENSHOT one instruction, at the settings location that has it', async () => {
    installApi()
    render(<Harness route="ocr" assistant={withoutModel()} />)
    fireEvent.click(screen.getByText('open lookup'))

    const state = await screen.findByRole('status')
    expect(state.textContent).toContain('Image Translation is not installed.')
    expect(state.textContent).toContain('Install it in Settings › Assistant › Image Translation.')
    /* one place named, once -- not one sentence per place that ever held it */
    expect(state.textContent?.match(/Settings/g)).toHaveLength(1)
    expect(state.textContent).not.toContain('Tutor › Image')
    expect(screen.getByText('A SCREENSHOT IS DIMMED UNTIL IMAGE TRANSLATION IS INSTALLED')).toBeTruthy()
  })

  it('asks A SCREENSHOT for an image in its field, not for a word', async () => {
    installApi()
    render(<Harness route="ocr" assistant={withModel()} />)
    fireEvent.click(screen.getByText('open lookup'))
    await waitFor(() => expect(document.querySelector('.lk-open')).not.toBeNull())
    const placeholder = field().getAttribute('placeholder') ?? ''
    expect(placeholder).toMatch(/pick/i)
    expect(placeholder).toMatch(/paste/i)
    expect(placeholder).toMatch(/drop/i)
    expect(placeholder).not.toMatch(/kanji|word|phrase/)
  })

  it('gates A QUESTION on a model actually installed, and A SCREENSHOT on image translation', () => {
    const none = { llamaCppInstalled: true, models: [{ installed: false }], ocrInstalled: false }
    const some = { llamaCppInstalled: true, models: [{ installed: false }, { installed: true }], ocrInstalled: true }
    /* the setting alone is not enough: this is what showed an ask field with nothing to answer it */
    expect(chatGate(true, true, none)).toMatchObject({ enabled: false, reason: LOOKUP_GATE_COPY.chatNoModel.reason })
    expect(chatGate(true, true, { ...some, llamaCppInstalled: false }).enabled).toBe(false)
    expect(chatGate(true, true, null).enabled).toBe(false)
    expect(chatGate(true, false, some)).toMatchObject({ enabled: false, reason: LOOKUP_GATE_COPY.chatOff.reason })
    expect(chatGate(false, true, some)).toMatchObject({ enabled: false, reason: LOOKUP_GATE_COPY.chatNoRuntime.reason })
    expect(chatGate(true, true, some).enabled).toBe(true)
    expect(ocrGate(true, none)).toMatchObject({ enabled: false, reason: LOOKUP_GATE_COPY.ocrNotInstalled.reason })
    expect(ocrGate(false, some).enabled).toBe(false)
    expect(ocrGate(true, some).enabled).toBe(true)
  })

  it('leaves ENTER and ESC to an input method that is still composing', async () => {
    installApi()
    const assistant = withModel()
    render(<Harness assistant={assistant} />)
    fireEvent.click(screen.getByText('open lookup'))
    await waitFor(() => expect(document.querySelector('.lk-open')).not.toBeNull())

    /* a word mid-conversion: ENTER picks the candidate, it does not hand off to the dictionary */
    fireEvent.change(field(), { target: { value: 'がっこう' } })
    fireEvent.keyDown(field(), { key: 'Enter', isComposing: true })
    fireEvent.keyDown(field(), { key: 'Enter', keyCode: 229 })
    expect(onOpenDictionary).not.toHaveBeenCalled()
    /* and ESC drops the candidate, it does not close the sheet */
    fireEvent.keyDown(field(), { key: 'Escape', isComposing: true })
    expect(document.querySelector('.lk-open')).not.toBeNull()

    /* the same on A QUESTION: nothing is sent until the composition is committed */
    fireEvent.change(field(), { target: { value: 'なぜですか?' } })
    fireEvent.keyDown(field(), { key: 'Enter', isComposing: true })
    expect(assistant.chat.send).not.toHaveBeenCalled()
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(assistant.chat.send).toHaveBeenCalledWith('なぜですか?')
  })

  it('makes A QUESTION and A SCREENSHOT answerable when the model is running', async () => {
    installApi()
    const assistant = withModel()
    render(<Harness assistant={assistant} />)
    fireEvent.click(screen.getByText('open lookup'))
    await waitFor(() => expect(document.querySelector('.lk-open')).not.toBeNull())

    const tutor = screen.getByRole('button', { name: /A QUESTION/ }) as HTMLButtonElement
    const ocr = screen.getByRole('button', { name: /A SCREENSHOT/ }) as HTMLButtonElement
    expect(tutor.disabled).toBe(false)
    expect(ocr.disabled).toBe(false)
    expect(screen.getByText(/FIVE ANSWERS/)).toBeTruthy()

    /* a question mark is a question, and ENTER is what sends it -- typing never calls the model */
    fireEvent.change(field(), { target: { value: 'why is it は here?' } })
    expect(tutor.getAttribute('aria-pressed')).toBe('true')
    expect(assistant.chat.send).not.toHaveBeenCalled()
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(assistant.chat.send).toHaveBeenCalledWith('why is it は here?')
    expect(onOpenDictionary).not.toHaveBeenCalled()

    fireEvent.click(ocr)
    expect(await screen.findByRole('button', { name: /PICK A FILE/ })).toBeTruthy()
  })

  it('pages a long reply instead of scrolling it, and the arrows turn the pages', async () => {
    installApi()
    const reply = Array.from({ length: 60 }, (_, i) => `Sentence number ${i} about small kana.`).join(' ')
    const pages = pageReply(reply, 460)
    expect(pages.length).toBeGreaterThan(2)
    render(<Harness route="tutor" assistant={withModel({
      turns: [
        { role: 'user', content: 'why?', created_at_utc: '2026-10-26T00:00:00Z' },
        { role: 'assistant', content: reply, created_at_utc: '2026-10-26T00:00:01Z' },
      ],
    })} />)
    fireEvent.click(screen.getByText('open lookup'))

    expect(await screen.findByText(`1 OF ${pages.length} ↓`)).toBeTruthy()
    expect(screen.getByText(pages[0])).toBeTruthy()
    fireEvent.keyDown(field(), { key: 'ArrowDown' })
    expect(screen.getByText(`2 OF ${pages.length} ↓`)).toBeTruthy()
    expect(screen.getByText(pages[1])).toBeTruthy()
    fireEvent.keyDown(field(), { key: 'ArrowUp' })
    expect(screen.getByText(`1 OF ${pages.length} ↓`)).toBeTruthy()
    /* the route keeps its page count on the strip */
    expect(screen.getByRole('button', { name: /A QUESTION/ }).querySelector('u')?.textContent).toBe(String(pages.length))
  })

  it('takes a pasted image to A SCREENSHOT and reads it', async () => {
    installApi()
    const assistant = withModel()
    render(<Harness assistant={assistant} />)
    fireEvent.click(screen.getByText('open lookup'))
    await waitFor(() => expect(document.querySelector('.lk-open')).not.toBeNull())

    const image = new File(['png'], 'shop-sign.png', { type: 'image/png' })
    fireEvent.paste(field(), { clipboardData: { files: [image], items: [], types: ['Files'] } })
    expect(assistant.ocr.submit).toHaveBeenCalledWith(image)
    expect(screen.getByRole('button', { name: /A SCREENSHOT/ }).getAttribute('aria-pressed')).toBe('true')
  })

  it('takes a dropped image the same way, and leaves a text paste alone', async () => {
    installApi()
    const assistant = withModel()
    render(<Harness assistant={assistant} />)
    fireEvent.click(screen.getByText('open lookup'))
    await waitFor(() => expect(document.querySelector('.lk-open')).not.toBeNull())

    fireEvent.paste(field(), { clipboardData: { files: [], items: [], types: ['text/plain'] } })
    expect(assistant.ocr.submit).not.toHaveBeenCalled()

    const image = new File(['jpg'], 'menu.jpg', { type: 'image/jpeg' })
    fireEvent.drop(document.querySelector('.lk-open') as Element, { dataTransfer: { files: [image], items: [], types: ['Files'] } })
    expect(assistant.ocr.submit).toHaveBeenCalledWith(image)
  })

  it('cancels a dropped file that is not an image before anything reads it, and says why', async () => {
    const extract = vi.fn()
    installApi({ extractAssistantChatImageText: extract })
    const assistant = withModel()
    render(<Harness assistant={assistant} />)
    fireEvent.click(screen.getByText('open lookup'))
    await waitFor(() => expect(document.querySelector('.lk-open')).not.toBeNull())

    /* left to the browser, a dropped HTML file is a navigation away from the app */
    const page = new File(['<h1>x</h1>'], 'notes.html', { type: 'text/html' })
    const allowed = fireEvent.drop(document.querySelector('.lk-open') as Element, {
      dataTransfer: { files: [page], items: [], types: ['Files'] },
    })
    expect(allowed).toBe(false)
    expect(assistant.ocr.submit).not.toHaveBeenCalled()
    expect(extract).not.toHaveBeenCalled()
    expect((await screen.findByRole('alert')).textContent).toContain('“notes.html” is not an image')
    expect(screen.getByRole('button', { name: /A SCREENSHOT/ }).getAttribute('aria-pressed')).toBe('true')

    /* the next image clears it */
    fireEvent.drop(document.querySelector('.lk-open') as Element, {
      dataTransfer: { files: [new File(['p'], 'a.png', { type: 'image/png' })], items: [], types: ['Files'] },
    })
    expect(screen.queryByText(/is not an image/)).toBeNull()
  })

  it('cancels a non-image drop with no model installed too, and says why there', async () => {
    installApi()
    const assistant = withoutModel()
    render(<Harness assistant={assistant} />)
    fireEvent.click(screen.getByText('open lookup'))
    await waitFor(() => expect(document.querySelector('.lk-open')).not.toBeNull())
    const allowed = fireEvent.drop(document.querySelector('.lk-open') as Element, {
      dataTransfer: { files: [new File(['t'], 'list.txt', { type: 'text/plain' })], items: [], types: ['Files'] },
    })
    expect(allowed).toBe(false)
    expect(assistant.ocr.submit).not.toHaveBeenCalled()
    expect((await screen.findByRole('alert')).textContent).toContain('“list.txt” is not an image')
  })

  it('lands a pasted image on the no-model sentence when image translation is not installed', async () => {
    installApi()
    const assistant = withoutModel()
    render(<Harness assistant={assistant} />)
    fireEvent.click(screen.getByText('open lookup'))
    await waitFor(() => expect(document.querySelector('.lk-open')).not.toBeNull())

    fireEvent.paste(field(), { clipboardData: { files: [new File(['x'], 'a.png', { type: 'image/png' })], items: [], types: ['Files'] } })
    expect(assistant.ocr.submit).not.toHaveBeenCalled()
    expect(await screen.findByText('This route needs image translation.')).toBeTruthy()
  })

  it('draws the image beside its lines, each with its confidence, and one English for the whole', async () => {
    installApi()
    render(<Harness route="ocr" assistant={withModel({}, {
      result: {
        fileName: 'shop-sign.png', lineCount: 3, japaneseText: '本日休業\n明日は10時から営業します\nご迷惑をおかけします',
        englishText: 'Closed today. We open from 10 tomorrow. We apologize for the inconvenience.',
        imageUrl: 'data:image/png;base64,AAAA', minConfidence: 0.3,
        lines: [
          { text: '本日休業', confidence: 0.98 },
          { text: '明日は10時から営業します', confidence: 0.91 },
          { text: 'ご迷惑をおかけします', confidence: 0.22 },
        ],
      },
    })} />)
    fireEvent.click(screen.getByText('open lookup'))

    expect(await screen.findByText('3 LINES')).toBeTruthy()
    expect(screen.getByText('98%')).toBeTruthy()
    expect(screen.getByText('22% · KEPT, IT IS JAPANESE').closest('.lk-ocr-l')?.className).toContain('low')
    expect(screen.getByText(/We apologize for the inconvenience/)).toBeTruthy()
    expect(screen.getByAltText(/shop-sign\.png/)).toBeTruthy()
  })

  it('has no accessibility violations on either model route', async () => {
    installApi()
    render(<Harness route="tutor" assistant={withModel({
      turns: [{ role: 'assistant', content: 'Both are し plus a small kana.', created_at_utc: 'x' }],
    })} />)
    fireEvent.click(screen.getByText('open lookup'))
    await screen.findByText('Both are し plus a small kana.')
    const run = (axe as { run: (element: Element) => Promise<{ violations: Array<{ id: string }> }> }).run
    expect((await run(document.querySelector('.lk-open') as Element)).violations).toEqual([])
    fireEvent.click(screen.getByRole('button', { name: /A SCREENSHOT/ }))
    await screen.findByRole('button', { name: /PICK A FILE/ })
    expect((await run(document.querySelector('.lk-open') as Element)).violations).toEqual([])
  })

  /* WHAT THE TUTOR POP-UP'S SHELL PROMISED, now that its two activities live here: a modal with its
     focus on the field, Tab kept inside it, the scrim and ESC both closing it, and focus handed back
     to whatever opened it. */
  it('is a modal that keeps Tab inside, closes on the scrim, and gives focus back', async () => {
    installApi()
    render(<Harness assistant={withModel()} />)
    const opener = screen.getByText('open lookup')
    opener.focus()
    fireEvent.click(opener)
    const dialog = await screen.findByRole('dialog', { name: 'Look it up' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    await waitFor(() => expect(document.activeElement).toBe(field()))

    const routes = Array.from(dialog.querySelectorAll<HTMLButtonElement>('.lk-r:not(:disabled)'))
    const last = routes[routes.length - 1]
    last.focus()
    fireEvent.keyDown(last, { key: 'Tab' })
    expect(document.activeElement).toBe(field())
    fireEvent.keyDown(field(), { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)

    fireEvent.click(screen.getByRole('button', { name: 'Close lookup' }))
    await waitFor(() => expect(document.querySelector('.lk-open')).toBeNull())
    expect(document.activeElement).toBe(opener)
  })

  it('with the chat turned off, dims A QUESTION but keeps A SCREENSHOT answerable', async () => {
    installApi()
    render(<Harness assistant={withModel({ enabled: false })} />)
    fireEvent.click(screen.getByText('open lookup'))
    await waitFor(() => expect(document.querySelector('.lk-open')).not.toBeNull())
    expect((screen.getByRole('button', { name: /A QUESTION/ }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: /A SCREENSHOT/ }) as HTMLButtonElement).disabled).toBe(false)
    expect(screen.getByText(/FOUR ANSWERS/)).toBeTruthy()
  })

  it('survives the desktop bridge being absent entirely', async () => {
    window.jplearnDesktop = undefined as unknown as Window['jplearnDesktop']
    open('語')

    expect(await screen.findByText(/desktop bridge is not available/i)).toBeTruthy()
  })

  it('has no accessibility violations', async () => {
    installApi()
    open('語')
    await waitFor(() => expect(document.querySelector('.lk-open')).not.toBeNull())
    await screen.findByText(/N5/)

    const results = await (axe as {
      run: (element: Element) => Promise<{ violations: Array<{ id: string }> }>
    }).run(document.querySelector('.lk-open') as Element)
    expect(results.violations).toEqual([])
  })
})
