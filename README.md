<p align="center">
  <img src="docs/assets/cover.svg" alt="ProjiSpace — choose a project, make room for progress" width="100%">
</p>

<p align="center">
  <strong>One place for your next project.</strong><br>
  Choose what to work on. Keep the notes, references and plan together.
</p>

<p align="center">
  <strong>English</strong> · <a href="README.ru.md">Русский</a><br>
  Version 1.0.0 · Local storage · English / Русский
</p>

![Project workspace with notes, references and a plan](docs/assets/workspace.png)

## What you can do

| Choose | Organize | Make progress |
| --- | --- | --- |
| Compare project cards or pick one at random. | Keep descriptions, images and links in one workspace. | Add milestones, deadlines and dated notes. |
| Pin projects and search your collection. | Group projects and subprojects; set their status. | Use an optional local assistant and review its proposals. |

Light and dark themes, image markup, resizable panels, and an English/Russian interface are included. Your workspace is stored on your computer; no account is required. This release does not include a browser extension.

## Get started

1. Open this repository’s **Releases** tab and choose an available build for your computer.
2. Start ProjiSpace and create your first project. A new desktop workspace starts empty.
3. Add a description, references and a first milestone. Use the card picker when you need to choose what comes next.

| Platform | Release status |
| --- | --- |
| Windows x64 | Installer prepared and checked on Windows. |
| macOS Intel / Apple Silicon | Build workflow provided; binaries and runtime have not been verified on macOS. |

Local builds are unsigned. Automatic updates are not included; install a newer version to update the app. Internet access is needed for optional component/model downloads and any external links you open.

<details>
<summary><strong>See the project picker</strong></summary>

![Project cards in the picker](docs/assets/picker.png)

</details>

## Your data stays with you

Projects, plans and references live in a local workspace folder. In the workspace, open **? → Local storage → Change folder** to select a new location. The move is applied on the next launch, and the old folder remains a snapshot backup.

**Close ProjiSpace before copying the whole workspace folder for backup.** Deleting a project also removes its subprojects, plans and references; there is no recycle bin.

[Usage and backup](docs/usage.md) · [Local AI and dictation](docs/usage.md#local-ai-and-dictation) · [Privacy and security](SECURITY.md)

## Run from source

Install **Node.js 24.14 or newer** and npm, then run:

```sh
npm ci
npm run desktop
```

For local web development, use `npm run dev`. See [Build and development](docs/development.md) for checks, build targets and platform limitations.

## Project information

[Changelog](CHANGELOG.md) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md)

**Version 1.0.0 is free for personal and internal business use.** The source is available for inspection and private builds under the [ProjiSpace license](LICENSE); it is not an open-source license. Future versions or additional features may have different terms. Bundled dependencies retain their own licenses. See [third-party notices](public/THIRD_PARTY_NOTICES.txt), the [Inter font license](public/fonts/OFL.txt), and [speech runtime notices](desktop/voice/NOTICE.txt).
