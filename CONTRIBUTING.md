# Contributing

[English](CONTRIBUTING.md) · [Русский](CONTRIBUTING.ru.md)

Bug reports and focused suggestions are welcome. Check existing issues first and describe the problem you want to solve. This is a source-available project under the [ProjiSpace license](LICENSE), with possible proprietary features in future versions. Discuss a proposed code contribution before opening a pull request so its scope and licensing can be agreed. No additional contributor license agreement is established here.

## Report a problem

Include the app version, operating system, reproducible steps, and expected versus actual behavior. Use fictional project data in screenshots. Never attach your workspace database, recordings, credentials, or personal file paths. Security reports follow [SECURITY.md](SECURITY.md).

## Work on a change

1. Use Node.js 24.14 or newer and install dependencies with `npm ci`.
2. Keep the change limited to one problem and preserve existing data compatibility.
3. Add a meaningful regression check for a behavior change. Use temporary workspaces, not real project data.
4. Run `npm test` and `npm run build`. For desktop changes, also run `npm run desktop:test` on a supported host.
5. If dependencies change, run `npm run notices` and commit the updated third-party notices.

Build instructions are in [docs/development.md](docs/development.md). Keep documentation concise and update both English and Russian versions. Do not commit `node_modules`, workspace data, models, logs, signing material, or build output.
