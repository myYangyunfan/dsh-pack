# DSH Pack

> A plugin pack for the **official DeepSeek Harness desktop client**.
> 34 plugins across 6 stackable tiers.

**This repository is no longer a desktop client.** It used to be one
(`dsh-tauri/` Rust shell + `dsh-desktop/` kernel-side machinery) wrapping the upstream
kernel `@deepseek-ai/dsh`. Upstream has shipped its own official client, so the shell is
retired. Everything we built is now redistributed as ordinary plugins that install *into*
the official client through its own plugin mechanism.

No executables. No installer. No tray. No auto-update feed. The deliverable is npm packages.

## If you are still on the old 0.6.x client

It won't break, but **it will never update again**. Uninstall
`%LOCALAPPDATA%\Programs\DSH Desktop` when convenient.

Your sessions, credentials and settings live under `~/.dsh` and **are not lost** — the
official client reads the same `~/.dsh`. Migrate in three steps: install the official
DeepSeek Harness, sign in / configure models, then install the tiers below from
**Settings → Plugins**. Details in [`docs/recovery.md`](docs/recovery.md)
(the doc is Chinese; the steps are the shape).

## Installing

Open **Settings → Plugins** in the official client and install by package name — or just ask
the in-app agent to `install_bundle` it for you.

> **The CLI cannot do this for you.** `dsh plugin --profile desktop …` is hard-blocked by
> upstream (`profile "desktop" is managed exclusively by the Electron application`).
> That profile belongs to the desktop app. `dsh plugin` only works on *custom* profiles,
> which is the development/CI path, not the user path.

### Tiers

| Tier | Contents | Size | Notes |
| --- | --- | --- | --- |
| **`@dsh-pack/core`** | 18 everyday plugins | small | Recommended. No native modules, works immediately |
| **`@dsh-pack/plus`** | 11 heavier UI / host-route plugins | medium | Additive to `core`. `harness-pet` and `dsh-super-injector` ship disabled |
| `@dsh-pack/knowledge` | `dsh-cardian` + `graph-memory` | ~85 MB | Knowledge base + cross-session graph memory. **Needs a one-time build-script approval** |
| `@dsh-pack/pocket` | phone QR mirroring | ~45 MB | Upstream package, GPL-2.0 — we depend on it, we do not fork it |
| `@dsh-pack/bridge` | WeChat / Feishu channel bridge | ~15 MB | |
| `@dsh-pack/compaction` | ACP-driven context compaction backend | ~35 MB | Installing this tier *is* the opt-in |

Tiers are additive and deliberately **not nested**.

## Two things you must know

**1. Enabling or disabling a plugin requires an app restart, not a page reload.**
The host captures the page-injection list once at startup; after that it is a snapshot.
Pressing F5 will show nothing.

**2. The `knowledge` tier asks you to approve a build script once.**
pnpm 11 blocks dependency install scripts by default, and `@photostructure/sqlite` has
`"install": "node-gyp-build"`, so the first install fails and lists a pending build.
Click **“Allow these scripts and retry”** in Settings → Plugins. It persists by package name.

This is *not* “you need a C++ toolchain”: prebuilt binaries for all six platforms
(including `win32-x64` / `win32-arm64`) ship inside the package, and `node-gyp-build`
loads from `prebuilds/<platform>-<arch>/` at runtime. The click just silences the installer.

## What we deliberately gave up

Honest list of what a plugin cannot do, so nobody re-requests it:

| Old shell feature | Now |
| --- | --- |
| Tray, close-to-tray, one-click restart | **gone** (the official client has no tray concept at all) |
| **OS-level** turn-complete notifications, taskbar flash | degraded to in-page |
| `harness-pet` native floating window | in-page pet only |
| WSL backend (kernel running in a distro) | **gone** — see `docs/wsl.md` |
| Custom app icon (incl. rewriting `.lnk` shortcuts) | **gone** |
| Our 36px glass titlebar + overflow menu | the official client uses native window chrome |

Conversely, three capabilities that used to live in the shell **have been moved into the
plugins themselves** and keep working: balance fetching, clipboard-image saving to disk,
and one-click file revert — all now plain `ctx.webServer` routes in a plugin's host half.

## What's inside

`core`: balance dock (the official client has **no** balance feature at all), session file
changes + diff + revert, image paste, drag-and-drop attach, input history / folding,
auto-`/compact`, AI self-review of changes, peak/off-peak price guard, seamless message
re-edit, conversation tweaks, quest UI, subagent lens, settings nav/grouping, custom system
prompt, workspace anchor.

`plus`: VSCode-like right sidebar, MCP/skills/rules panel, peak price guard, synapse canvas,
side session, reasoning-effort picker, `view_image` for text-only models, prompt optimizer,
community plugin market, zcode history migration, super injector, pet.

Full per-plugin list and live toggles: Settings → Plugins, once installed.

## Development

```bash
pnpm install
node tools/audit/index.js                       # 6 static gates; P0 among them
node tools/build-meta-patches.mjs               # regenerate tier meta patch layers
node --test "packages/*/test/*.test.js"
node tools/itest/boot-desktop-profile.mjs --job=j1   # real install + real composition
```

Conventions, boundaries and the traps that already bit us: [`AGENTS.md`](AGENTS.md).
Contributing: [`CONTRIBUTING.md`](CONTRIBUTING.md).

The load-bearing facts were measured against the actually-installed official client and a
pristine npm-installed `@deepseek-ai/dsh@0.1.7-rc.1`, and are recorded in
[`docs/spike-official-client.md`](docs/spike-official-client.md). Three matter most:

- A plugin only mounts if it **declares its own patch layer**. Pulling it in as a meta
  package's dependency is **inert** — no error, nothing mounts.
- `@deepseek-ai/*` may appear **only** in `peerDependencies`. Putting it in `dependencies`
  installs a second physical copy into the profile and makes the **entire official client
  refuse to start**.
- One malformed package can brick the app the same way — and if the user then hits the
  recovery dialog, `sanitizeProfile` **wipes the whole pack** from the profile.
  Hence `tools/audit/publish-readiness.js` is a P0 gate, not a suggestion.

## Bugs filed upstream

We dropped our kernel-patch layer. Two clusters are genuine upstream defects that no plugin
can express — write-ups with repro evidence in `docs/upstream/`:

- [`session-log-durability.md`](docs/upstream/session-log-durability.md) — fail-closed reads
  destroy user history; measured **19 of 54 sessions permanently unreadable on one machine**.
  The write path is extensible but the read path is frozen, so any plugin that adds a field
  permanently bricks history for every older or stricter reader.
- [`pi-ai-error-taxonomy.md`](docs/upstream/pi-ai-error-taxonomy.md) — four provider-error
  misclassifications; in three of them the user's resulting corrective action
  (re-enter the key, delete the session, wait for retry) is actively wrong.
- [`retirement-precedents.md`](docs/upstream/retirement-precedents.md) — the record of this
  repo retiring its own code cleanly when upstream absorbs it.

## License

MIT. Third-party attributions in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md);
`dsh-pocket` is GPL-2.0 and is consumed as an unmodified upstream dependency.
