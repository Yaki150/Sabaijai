# Sabaijai Music — Electron App

This folder contains a small Electron wrapper for the Sabaijai Music web player.

Quick start (Windows):

1. Open a terminal in this project folder (d:\code\Sabaijai).
2. Install dependencies:

```bash
npm install
```

3. Run the app:

```bash
npm start
```

Build (create installer)

1. Put application icons into `build/` folder. For Windows provide `icon.ico` (recommended sizes: 256x256). Example path: `build/icon.ico`.
2. Install dev dependencies and builder then run:

```bash
npm install
npm run dist
```

The installer / packaged app will be placed in `dist/`.

Notes
- `package.json` includes Electron as a devDependency. If you prefer a global Electron, you can install it globally.
- To build distributables consider using `electron-packager` or `electron-builder` (not included here).

Security
- The app uses `contextIsolation: true` and a `preload.js` stub — if you add IPC, expose only minimal safe APIs.

If you want, I can help generate icon files from the logo and finalize the installer settings.
