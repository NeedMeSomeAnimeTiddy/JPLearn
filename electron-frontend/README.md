# JPLearn Electron Frontend

This folder contains an Electron desktop shell running a React + TypeScript UI.

## Development

```bash
npm run dev
```

This starts:

- Vite dev server for the React UI
- Electron desktop window pointed at the local Vite URL

## Build Web Assets

```bash
npm run build
```

## Start Electron With Built Assets

```bash
npm run start
```

Before `npm run start`, run `npm run build` at least once so `dist/index.html` exists.
