<p align="center">
  <img src="docs/assets/cover.svg" alt="ProjiSpace" width="100%">
</p>

<div lang="en">

<p id="readme-english" align="center">
  <strong>One place for your next project.</strong><br>
  Choose what to work on. Keep the notes, references and plan together.
</p>

<p align="center">
  <a href="#user-content-readme-english"><img src="https://img.shields.io/badge/English-1554C5?style=for-the-badge" alt="English"></a>
  <a href="#user-content-readme-russian"><img src="https://img.shields.io/badge/%D0%A0%D1%83%D1%81%D1%81%D0%BA%D0%B8%D0%B9-293547?style=for-the-badge" alt="Русский"></a><br>
  Local storage · English / Русский
</p>

## Download ProjiSpace

[![Download for Mac with Apple Silicon](https://img.shields.io/badge/Download-macOS_Apple_Silicon-1554C5?style=for-the-badge&labelColor=293547)](https://github.com/plworkshop/ProjiSpace/releases/download/v1.1.0/ProjiSpace-1.1.0-macOS-arm64.dmg)
[![Download for Mac with Intel](https://img.shields.io/badge/Download-macOS_Intel-1554C5?style=for-the-badge&labelColor=293547)](https://github.com/plworkshop/ProjiSpace/releases/download/v1.1.0/ProjiSpace-1.1.0-macOS-x64.dmg)
[![Download for Windows x64](https://img.shields.io/badge/Download-Windows_x64-1554C5?style=for-the-badge&labelColor=293547)](https://github.com/plworkshop/ProjiSpace/releases/download/v1.0.0/ProjiSpace-Installer-1.0.0-x64.exe)

**Mac v1.1.0** requires macOS 13 or later. Open ** → About This Mac** to check whether your Mac has an Apple chip or an Intel processor. The Windows installer is **v1.0.0**.

![Project workspace with notes, references and a plan](docs/assets/workspace.png)

## What you can do

| Choose | Organize | Make progress |
| --- | --- | --- |
| Compare project cards or pick one at random. | Keep descriptions, images and links in one workspace. | Add milestones, deadlines and dated notes. |
| Pin projects and search your collection. | Group projects and subprojects; set their status. | Use an optional local assistant and review its proposals. |

Light and dark themes, image markup, resizable panels, and an English/Russian interface are included. Your workspace is stored on your computer; no account is required. This release does not include a browser extension.

## Get started

1. Install ProjiSpace using the download above, then start the app and create your first project. A new desktop workspace starts empty.
2. Add a description, references and a first milestone. Use the card picker when you need to choose what comes next.

| Platform | Release status |
| --- | --- |
| Windows x64 | Installer prepared and checked on Windows. |
| macOS Intel / Apple Silicon | DMGs available. Offline Whisper dictation was verified on Apple Silicon. |

Local macOS builds are signed ad hoc. To update the app, install a newer version. Internet access is needed for optional component/model downloads and any external links you open.

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

**ProjiSpace is free and open-source under [GNU GPL 3.0](LICENSE) (`GPL-3.0-only`).** You may use, modify and redistribute it under that license. Distributed builds must be accompanied by the corresponding source as required by GPL 3.0. See [copyright and licensing notices](NOTICE). Bundled dependencies retain their own licenses: [dependency notices](public/THIRD_PARTY_NOTICES.txt), [Inter font license](public/fonts/OFL.txt), and [speech runtime notices](desktop/voice/NOTICE.txt).

</div>

---

<div lang="ru">

<p id="readme-russian" align="center">
  <strong>Всё для следующего проекта — в одном месте.</strong><br>
  Выберите, чем заняться. Соберите описание, референсы и план рядом.
</p>

<p align="center">
  <a href="#user-content-readme-english"><img src="https://img.shields.io/badge/English-293547?style=for-the-badge" alt="English"></a>
  <a href="#user-content-readme-russian"><img src="https://img.shields.io/badge/%D0%A0%D1%83%D1%81%D1%81%D0%BA%D0%B8%D0%B9-1554C5?style=for-the-badge" alt="Русский"></a><br>
  Локальное хранение · English / Русский
</p>

## Скачать ProjiSpace

[![Скачать для Mac с чипом Apple](https://img.shields.io/badge/%D0%A1%D0%BA%D0%B0%D1%87%D0%B0%D1%82%D1%8C-macOS_Apple_Silicon-1554C5?style=for-the-badge&labelColor=293547)](https://github.com/plworkshop/ProjiSpace/releases/download/v1.1.0/ProjiSpace-1.1.0-macOS-arm64.dmg)
[![Скачать для Mac с процессором Intel](https://img.shields.io/badge/%D0%A1%D0%BA%D0%B0%D1%87%D0%B0%D1%82%D1%8C-macOS_Intel-1554C5?style=for-the-badge&labelColor=293547)](https://github.com/plworkshop/ProjiSpace/releases/download/v1.1.0/ProjiSpace-1.1.0-macOS-x64.dmg)
[![Скачать для Windows x64](https://img.shields.io/badge/%D0%A1%D0%BA%D0%B0%D1%87%D0%B0%D1%82%D1%8C-Windows_x64-1554C5?style=for-the-badge&labelColor=293547)](https://github.com/plworkshop/ProjiSpace/releases/download/v1.0.0/ProjiSpace-Installer-1.0.0-x64.exe)

**Версия v1.1.0 для Mac** требует macOS 13 или новее. Откройте ** → Об этом Mac**, чтобы узнать, какой у вас чип — Apple или Intel. Для Windows доступна **v1.0.0**.

![Рабочее пространство с описанием, референсами и планом](docs/assets/workspace.png)

## Что умеет ProjiSpace

| Выбрать | Организовать | Продвинуться |
| --- | --- | --- |
| Сравнивать карточки проектов или выбирать случайный. | Хранить описание, изображения и ссылки вместе. | Добавлять этапы, сроки и заметки по датам. |
| Закреплять проекты и искать в коллекции. | Создавать подпроекты и менять статус работы. | Обращаться к локальному помощнику и проверять его предложения. |

Есть светлая и тёмная темы, разметка изображений, панели с изменяемой шириной и интерфейс на русском и английском. Данные хранятся на компьютере, учётная запись не нужна. Расширение браузера в эту версию не входит.

## Начало работы

1. Установите ProjiSpace по ссылке выше, запустите приложение и создайте первый проект. Новое настольное хранилище изначально пустое.
2. Добавьте описание, референсы и первый этап. Откройте карточки, когда понадобится выбрать, чем заняться дальше.

| Платформа | Статус выпуска |
| --- | --- |
| Windows x64 | Установщик подготовлен и проверен в Windows. |
| macOS Intel / Apple Silicon | Доступны образы DMG. Диктовка Whisper без интернета проверена на Apple Silicon. |

Локальные сборки macOS подписываются ad hoc. Для обновления установите новую версию. Интернет нужен для необязательной загрузки компонентов и моделей и открытия внешних ссылок.

<details>
<summary><strong>Посмотреть выбор проекта</strong></summary>

![Карточки в окне выбора проекта](docs/assets/picker.png)

</details>

## Ваши данные остаются у вас

Проекты, планы и референсы находятся в локальной папке. Чтобы выбрать другое место, откройте рабочее пространство и нажмите **? → Локальное хранение → Изменить папку**. Перенос выполняется при следующем запуске. Прежняя папка остаётся резервной копией на момент переноса.

**Перед резервным копированием закройте ProjiSpace и скопируйте всю папку хранения.** Удаление проекта также удаляет его подпроекты, планы и референсы. Корзины нет.

[Использование и резервные копии](docs/usage.ru.md) · [Локальный ИИ и диктовка](docs/usage.ru.md#локальный-ии-и-диктовка) · [Конфиденциальность и безопасность](SECURITY.ru.md)

## Запуск из исходников

Установите **Node.js 24.14 или новее** и npm, затем выполните:

```sh
npm ci
npm run desktop
```

Для локальной веб-разработки используйте `npm run dev`. Проверки, варианты сборки и ограничения платформ описаны в [инструкции для разработки](docs/development.ru.md).

## О проекте

[История изменений](CHANGELOG.ru.md) · [Участие в разработке](CONTRIBUTING.ru.md) · [Безопасность](SECURITY.ru.md)

**ProjiSpace — бесплатное приложение с открытым кодом под [GNU GPL 3.0](LICENSE.ru.md) (`GPL-3.0-only`).** Программу можно использовать, изменять и распространять на условиях лицензии. При распространении сборок предоставляйте соответствующие исходники согласно GPL 3.0. См. [уведомление об авторских правах](NOTICE). Сторонние компоненты сохраняют свои лицензии: [уведомления о зависимостях](public/THIRD_PARTY_NOTICES.txt), [лицензия Inter](public/fonts/OFL.txt) и [уведомления о распознавании речи](desktop/voice/NOTICE.txt).

</div>
