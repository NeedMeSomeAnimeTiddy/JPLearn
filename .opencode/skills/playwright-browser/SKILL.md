---
name: playwright-browser
description: Persistent browser automation protocol — 3-attempt rule, verified target selectors, and debug checklist.
---

# Playwright Browser Protocol

## THE RULE: 3 ATTEMPTS MINIMUM

Every Playwright action gets **3 attempts** before you can say it's impossible. Each attempt must use a **different approach**.

```
Attempt 1: Straightforward — navigate → wait(2) → snapshot → act → verify(snapshot)
Attempt 2: Diagnosis    — snapshot current state → check console errors → adjust timing/selector → retry
Attempt 3: Workaround   — press_key(Escape/Enter/Tab) → evaluate(JS) → run_code_unsafe(last resort)
```

**Failure to attempt 3 different approaches is a violation of this protocol.**

---

## BEFORE YOU START (First-Run Setup)

The Playwright browser tools are a Node.js MCP server (`@playwright/mcp`) that needs a Chrome/Chromium binary. If you get `"Chromium distribution 'chrome' is not found"`, here's the fix:

**Step 1: Check if Playwright's Chromium is already installed:**
```
ls "%LOCALAPPDATA%/ms-playwright/chromium-*/chrome-win64/chrome.exe"
```
(Playwright for Node.js may have been installed globally by npx and already downloaded browsers.)

**Step 2: If found, copy it to where the MCP server expects it:**
```
cp "%LOCALAPPDATA%/ms-playwright/chromium-*/chrome-win64/chrome.exe" "%LOCALAPPDATA%/Google/Chrome/Application/chrome.exe"
cp -r "%LOCALAPPDATA%/ms-playwright/chromium-*/chrome-win64/"* "%LOCALAPPDATA%/Google/Chrome/Application/"
```

**Step 3: If not found, install Chrome via Playwright:**
```
npx playwright install chrome
```

This is a ONE-TIME setup. The `.venv` (Python venv) is unrelated — the Playwright MCP server is Node.js-based, not Python.

---

## SNAPSHOT FORMAT (Read This Carefully)

The `browser_snapshot()` output is **YAML**. Example:

```yaml
- generic [ref=e2]:
  - heading "Example Domain" [level=1] [ref=e3]
  - paragraph [ref=e4]: This domain is for use in examples.
  - paragraph [ref=e5]:
    - link "Learn more" [ref=e6] [cursor=pointer]:
      - /url: https://iana.org/domains/example
```

Key elements:
- `heading "text"` — section heading
- `link "text"` — clickable link
- `button "text"` — button
- `textbox "label"` — text input field
- `text:` — plain text content
- `[ref=eN]` — internal snapshot reference (NOT usable as a selector)

---

## TARGET SELECTORS (What Actually Works)

These are the **verified working** formats for the `target` parameter:

| Priority | Format | Example | Works? |
|----------|--------|---------|--------|
| 1 | Playwright text selector | `text=Sign in` | ✅ |
| 2 | CSS attribute selector | `input[name='q']` | ✅ |
| 3 | Tag name | `a`, `button` | ✅ |
| 4 | CSS pseudo-selector | `a:has-text('Learn more')` | ✅ |
| 5 | CSS class/ID | `#submit-btn`, `.btn-primary` | ✅ (untested but standard) |

**These do NOT work:**
- ❌ Plain text strings like `"Learn more"` — does not match elements
- ❌ Snapshot refs like `[ref=e6]` — internal identifiers only
- ❌ Role names like `textbox` — not a valid selector

**Strategy:** Always try `text=ButtonText` first, then CSS selectors.

---

## MANDATORY SEQUENCE (Do Not Skip Steps)

```
1. browser_navigate(url)              # Go to page
2. browser_wait_for(time: 2)          # Let JS render (critical!)
3. browser_snapshot()                  # READ the page — find your element
   └── Look at the YAML. Find the element text and its surrounding structure.
4. browser_click(target: "text=...")  # ACT (or type/fill/select)
5. browser_wait_for(time: 1)          # Let action settle
6. browser_snapshot()                  # VERIFY it worked — page should have changed
```

**Step 3 and Step 6 are NOT optional.** If you skip either, you're flying blind.

---

## DEBUG CHECKLIST

When something fails, run this immediately:

```
1. browser_snapshot()                   # What's on the page NOW?
2. browser_console_messages(level: "error")    # JS errors?
3. browser_console_messages(level: "warning")  # Warnings?
```

**Common failures and fixes:**

| Error | Most likely fix |
|---|---|
| "does not match any elements" | Wrong selector format — use `text=VisibleText` or `cssSelector` |
| "Timeout" / slow | Page not loaded — add `wait_for(time: 3)` BEFORE the action |
| Click does nothing | Wrong element — snapshot and re-check; try a different selector |
| Form won't fill | Field behind a modal or multi-step — snapshot first, reveal the field |
| "Multiple matches" | Target too generic — use a more specific CSS selector |
| Navigation fails (DNS) | URL is wrong or site is down — verify URL, try a different page |

---

## SHORT WORKFLOWS (Copy-Paste Ready)

### Navigate and read a page
```
browser_navigate(url: "https://...")
browser_wait_for(time: 2)
browser_snapshot()
```

### Click an element
```
browser_navigate(url)
browser_wait_for(time: 2)
browser_snapshot()
browser_click(target: "text=ClickableText")
browser_wait_for(time: 1)
browser_snapshot()   # Verify
```

### Fill a form and submit
```
browser_navigate(url)
browser_wait_for(time: 2)
browser_snapshot()
browser_fill_form(fields: [
  {target: "input[name='email']", name: "Email", type: "textbox", value: "user@example.com"},
  {target: "input[name='password']", name: "Password", type: "textbox", value: "secret123"}
])
browser_click(target: "text=Sign in")
browser_wait_for(time: 3)
browser_snapshot()   # Did login succeed?
```

### Type into a single input
```
browser_type(target: "input[name='search']", text: "query string")
```

### When clicks fail (keyboard navigation)
```
browser_press_key(key: "Tab")   # Move focus
browser_press_key(key: "Tab")   # Move to next element
browser_press_key(key: "Enter")  # Activate
browser_wait_for(time: 2)
browser_snapshot()
```

### Debug a page
```
browser_snapshot()
browser_console_messages(level: "error")
browser_console_messages(level: "warning")
browser_evaluate(function: "() => document.title")
```

---

## VERIFIED TOOL STATUS

All tools tested and working:
- ✅ `browser_navigate` — Go to URL
- ✅ `browser_navigate_back` — Go back
- ✅ `browser_snapshot` — Read page as YAML
- ✅ `browser_wait_for(time)` / `browser_wait_for(text)` — Wait for condition
- ✅ `browser_click(target)` — Click (CSS, `text=`, `:has-text()`)
- ✅ `browser_type(target, text)` — Type into input
- ✅ `browser_fill_form(fields)` — Fill multiple fields
- ✅ `browser_press_key(key)` — Keyboard input
- ✅ `browser_console_messages(level)` — Read console
- ✅ `browser_evaluate(function)` — Run JS
- ✅ `browser_take_screenshot(type, scale)` — Visual capture

---

## PROHIBITED

- ❌ Do not use `take_screenshot` INSTEAD of `snapshot` — snapshot is for action, screenshot is for visual
- ❌ Do not repeat the same failing call unchanged — change the selector or approach
- ❌ Do not use `run_code_unsafe` before attempts 1-2 fail — it's the nuclear option
- ❌ Do not skip `wait_for(time: 2)` after navigation — the page needs time to render
- ❌ Do not skip the verification `snapshot` after an action — confirm it landed
