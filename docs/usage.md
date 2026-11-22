# Using ProjiSpace

[English](usage.md) · [Русский](usage.ru.md) · [Overview](../README.md)

## Install on Windows

Close ProjiSpace and run the installer. Choose English or Russian, continue through the license and select **Only for me** or **Anyone who uses this computer**. On **Choose Install Location**, keep the suggested folder or click **Browse**. Installing for all users requires administrator permission.

This folder contains the app. Choose the project data folder separately in ProjiSpace settings. Uninstalling keeps project data.

## Choose and organize

Create a project, then open its workspace. Use search, pinning and manual ordering to keep the project list useful. A project can contain one level of subprojects.

The card picker helps you choose a project. Keep a card or skip it to narrow the next round, or use random selection. Change the card theme and interface language from the picker’s settings.

Use the status badge at the right of a project heading to choose **Planned**, **In progress**, **On hold** or **Completed**. It changes the project status without changing its content.

## Notes, references and plans

- Edit the project description with the formatting toolbar; open focus view for more room.
- Add links or upload JPG, PNG, WebP or GIF reference images. Image markup is a separate layer and does not rewrite the original image.
- Add milestones, a deadline or notes for particular dates. Resize the workspace panels to fit your screen.

Changes in an editor may need an explicit save. Follow the visible save controls before closing the app. Deleting a project also deletes its subprojects, plan entries and references. There is no recycle bin.

## Storage and backup

Open **? → Local storage** in the workspace to see the active data folder. **Change folder** accepts a separate empty folder. Close and reopen the app to apply the move; until then, it can be canceled. The previous location remains a snapshot backup. Later edits go only to the new location.

For a backup, close ProjiSpace and copy the entire active data folder, including its database, images and other contents. To restore, close the app and replace that folder with a complete backup. Keep another backup before replacing anything. If the storage disk is disconnected, reconnect it before starting the app.

The default desktop data folder is `Projector/data` inside the operating system’s application-data directory. The in-app path is authoritative. Source web mode uses a separate `data/` folder in the repository; web and desktop data are not synchronized.

## Local AI and dictation

Both features are optional. Normal project work does not require a model.

**Assistant:** open the assistant and choose **Model settings**. Use a running local Ollama installation and a supported local model. Windows also offers installation/startup of the Ollama runtime; on macOS, install and start Ollama separately. Model downloads need Internet access and several GB of storage. Availability and speed depend on hardware.

The assistant receives bounded workspace context, including project text, plans, links and recent conversation. It prepares a proposal; inspect it and choose **Apply changes** only when it is correct. It has no project-deletion or shell tool.

**Dictation:** the bundled speech runtime is available on Windows x64 only. Download the speech model when prompted, allow microphone access, record up to two minutes and review the recognized text before insertion. Model downloads require Internet access; transcription runs locally. Temporary recordings are removed after normal completion.

For troubleshooting, see [Build and development](development.md). For data boundaries and security reporting, see [SECURITY.md](../SECURITY.md).
