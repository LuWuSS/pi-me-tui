# Security policy

## Supported versions

Only the latest release receives fixes.

## Reporting a vulnerability

Please do not open a public issue. Email the maintainer at the address listed on the GitHub profile linked from `package.json`, or use GitHub's private "Report a vulnerability" form on the repository's Security tab.

Include the version, your OS, and the smallest config/command that reproduces the problem.

## Scope

pi-me-tui runs entirely locally. The most relevant risks are:

- `custom-command` widgets, which execute a shell command from the config file on every refresh
- importing a config JSON that contains `custom-command` entries

The editor shows new shell commands in full and requires explicit confirmation before importing them, but a config file placed in `~/.pi/agent/me-tui.json` by other means is trusted as-is. Only install configs you understand.
