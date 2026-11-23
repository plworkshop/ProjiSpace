# Build and development

[English](development.md) · [Русский](development.ru.md) · [Overview](../README.md)

## Requirements

Use Node.js **24.14 or newer**, npm and Git. Install the locked dependencies with `npm ci`. Build installers on their native operating system.

| Target | Current status |
| --- | --- |
| Windows x64 | Local build and isolated Electron checks are available. |
| macOS Intel / Apple Silicon | The manual GitHub Actions workflow builds both architectures. Offline Whisper dictation was verified on Apple Silicon. |
| Linux | No release target is provided. |

Build DMG and ZIP files on macOS with Xcode Command Line Tools and CMake. Packaging downloads and verifies the pinned whisper.cpp source archive, compiles the CLI for the target architecture, and signs the app ad hoc. Developer ID signing and notarization require separate credentials.

## Commands

```sh
npm ci
npm run desktop
npm test
npm run build
npm run desktop:test
```

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start local web development. Open `http://127.0.0.1:5173`. |
| `npm run build` | Check notices and TypeScript, then build the frontend. |
| `npm start` | Serve the built web app at `http://127.0.0.1:4317`. |
| `npm run desktop` | Build and launch the Electron app from source. |
| `npm run desktop:build:win` | Build the Windows x64 installer on Windows. |
| `npm run desktop:build:mac` | Build macOS targets on macOS. |
| `npm run desktop:test` | Check the app in an isolated temporary Electron profile. |
| `npm run notices` | Regenerate bundled dependency notices. |

Do not run the development and built web servers together; they use the same API port. Local web mode is for one user and must not be exposed as a hosted service. A new web workspace creates demonstration projects once; a new desktop workspace starts empty.

## Platform features

Core project, image, planning and local storage features share the same source. The optional AI assistant talks to local Ollama. Runtime installation/startup is implemented for Windows; macOS needs an already-running Ollama installation. Dictation uses the same Whisper model on Windows x64 and in packaged macOS builds.

## Data and compatibility

Source web mode uses `data/` in the repository. Electron uses the operating system’s application-data directory and the `Projector` profile unless a different storage folder was selected. `sidequest.sqlite` and `app.sidequest.desktop` are retained compatibility identifiers; renaming them can disconnect existing workspaces or updates.

Automated tests create temporary workspaces. Never point tests at a real database. The `qa/`, `data/`, `release/` and dependency folders are excluded from Git.

## Release checks

Run the tests, frontend build and desktop check on each target platform. Inspect the packaged app and generate checksums for distributed files. Keep installers in GitHub Releases, not in the source tree. The workflows are build/check tools; preparing them does not publish a release.

When dependencies change, run `npm run notices` and commit `public/THIRD_PARTY_NOTICES.txt`. Keep the [font](../public/fonts/OFL.txt), [speech runtime](../desktop/voice/NOTICE.txt), and Electron distribution notices with the relevant artifacts.

## Troubleshooting

- **A storage disk is unavailable:** reconnect it and restart. The app does not silently create a replacement workspace.
- **The assistant is unavailable:** start local Ollama, reopen Model settings and choose an installed supported model.
- **Dictation is unavailable on macOS:** use a packaged build and check Microphone under System Settings → Privacy & Security.
- **A local unsigned build cannot be produced:** verify signing-related environment settings and use the documented workflow on the target OS. Do not disable operating-system protection to make an unverified download run.

## Brand assets

The original interface SVGs are in `public/brand/icon.svg` and `public/brand/wordmark.svg`. The application icon uses `public/brand/app-icon.png`. Run `npm run brand:build` after replacing that PNG to regenerate the desktop PNG and multi-size Windows ICO. The conversion preserves the artwork’s proportions and transparency.
