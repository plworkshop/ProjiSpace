# Security and privacy

[English](SECURITY.md) · [Русский](SECURITY.ru.md)

ProjiSpace is a local, single-user application. Use the latest release. No security-response SLA, automatic updater, or signed release pipeline is promised.

## Security boundaries

- The desktop renderer is sandboxed and has no Node.js integration. Its loopback API uses a session created for each app launch.
- Development/web servers are local tools, not a hosted service. Do not expose their ports through public interfaces, tunnels or reverse proxies.
- Project descriptions are sanitized before display. Image uploads have size/type limits and generated storage names.
- Optional assistant requests go to local Ollama. Proposed project changes require review and explicit application; the assistant has no shell, arbitrary-file or project-deletion tool.
- Whisper dictation on Windows and macOS runs locally after the model download. Temporary audio is removed when recognition finishes or is cancelled. A crash may leave temporary audio on disk.

The workspace is not encrypted by ProjiSpace. Other software running as the same operating-system user can access it. Use operating-system account and disk protection for sensitive data. An independently installed Ollama runtime is part of the trusted local environment.

## Report a vulnerability

Use **Security → Report a vulnerability** in this repository when GitHub private vulnerability reporting is enabled. If that form is unavailable, request a private reporting channel without posting technical details publicly. No public contact address is provided.

Include the affected version, platform, startup mode, reproduction steps, expected boundary and potential impact. Remove private projects, recordings, credentials and personal paths from evidence. Do not post exploit details or sensitive data in a public issue.

## Scope of checks

Automated tests and dependency checks reduce risk; they do not guarantee the absence of vulnerabilities. Build and runtime verification are platform-specific. See [development notes](docs/development.md) for the current platform status.
