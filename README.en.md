# Farm Assistant

[简体中文](README.md) | **English**

A browser automation research project for Farming Season, covering farm planning, page interactions, battle inputs, and settlement data observation. Current version: **1.25.2**.

> **For learning, research, and discussion only.** This is an independent personal project and is not affiliated with Farming Season. If it infringes any rights or causes harm or disruption to the game, its players, or other parties, please contact the maintainer through [GitHub Issues](https://github.com/Gintma/Farm-assistant/issues). Verified concerns will be addressed by modifying, taking down, or removing the affected content as appropriate.

## Features

| Module | Functions |
| --- | --- |
| Fields | Harvesting and replanting, crop selection, energy reserves, and planting based on the daily allowance |
| Animals | Feeding, collecting products, and managing feed and material reserves |
| Workshops | Order-based production, preparation for the next day's orders, and comparisons of purchasing and processing costs |
| Daily tasks | Enabled tasks such as village income, mining, oil collection, and fishing |
| Earnings | Daily progress and allowance details for harvests, battles, and workshop orders |
| Battle | Target selection, movement, dodging, storm skills, upgrade choices, optional gold-target retreat, and latest-settlement export |

The panel supports dragging, collapsing, and execution status displays. The helper's interface is currently in Chinese. For detailed behavior, requirements, and configuration, see the [installation guide (Chinese)](extension/安装说明.md).

## Installation

Supports desktop Chrome and Brave with unpacked extensions enabled. Built files are included in this repository; Python and Node.js are not required to use the extension.

1. Get the code. Cloning with Git into a permanent directory is recommended:

   ```sh
   git clone https://github.com/Gintma/Farm-assistant.git
   ```

2. Open the extensions page: `chrome://extensions` in Chrome or `brave://extensions` in Brave.
3. Enable **Developer mode**, click **Load unpacked**, and select the repository's **`extension` folder**.
4. Open the game, start the helper from its extension popup, follow the panel's game-version check, and enable the features you need.

You can also download and extract a GitHub ZIP. However, ZIP downloads cannot use the Git update methods below. Keep the installation directory in place rather than repeatedly removing and reinstalling the extension.

## Updating

On macOS, double-click **`更新助手.command`** in the repository root. If it does not run directly, execute this from the repository directory:

```sh
sh 更新助手.command
```

On other systems, run this from the repository directory:

```sh
git pull --ff-only origin main
```

After pulling, wait until the current battle and pending farm operations finish. Click **Reload** on the extension's card in the browser's extensions page, then refresh the game and check the helper version. If an unfamiliar game update is detected, review the changes before confirming compatibility in the panel.

Git updates the code; it does not reload the extension or synchronize settings between computers. Update each computer separately. The update script only allows fast-forward updates on `main`; it stops when it finds local changes or diverging history to avoid overwriting work.

## Usage notes

- **Enable tasks as needed.** Review the relevant configuration and purchasing rules before enabling features that spend coins.
- **Start battles manually.** The helper does not repeatedly start new battles. Automatic battle control must be enabled again after a page refresh.
- **Gold-target retreat has its own switch.** The default target is the account's daily battle allowance minus the amount already earned before the current run starts. It stays fixed during the run. Entering a valid nonnegative integer updates the target immediately; reaching it only triggers retreat when its switch is on. The switch is off by default.
- **Press Esc to stop automation.** Features pause according to their rules when the page is hidden, a verification dialog appears, or the user takes over.
- **Farm settings are stored locally in the browser.** Updates usually preserve settings when you keep the same installation directory and browser profile. Note down your settings before migrating from an older extension or a different directory.

## Implementation and data

Farm features read the current game state and use the page's existing action flows. Battle movement and skills use keyboard inputs sent through Chrome's debugging interface, preserving the game's damage, cooldown, and settlement logic. Automated input remains automation: this project does not guarantee earnings, continued compatibility, or account safety. Confirm the applicable permissions and platform rules before use. Human verification must be handled by the user.

The extension requests `activeTab`, `debugger`, and `storage` permissions for operations on the current game page and local settings. The browser displays a debugging banner during automated battle input or test recording.

**Export latest settlement** (`导出最新结算`) keeps only the latest sanitized settlement submission in the current tab. A new submission replaces the previous one, and the latest record remains available after refreshing the tab. It includes the request body and selected response fields, without request headers or cookies; sensitive fields such as run identifiers are redacted. Network failures and server rejections are also recorded, so a submission does not prove that settlement succeeded. This feature does not modify or replay requests.

Optional test recording is also available in the extension. A manual-baseline recording turns automation off; an assistant-test recording preserves the existing switches. See [test recording in the installation guide (Chinese)](extension/安装说明.md#测试记录) for the data scope and limitations.

## Development and maintenance

```text
src/                 Feature source code
extension/           Browser installation directory, including built files
scripts/build.py     Build script and version configuration
tests/               Regression tests
更新助手.command      macOS update script
AGENTS.md            Repository maintenance rules
```

Development requires Python 3 and Node.js 20 or later. After modifying `src/`, run:

```sh
python3 scripts/build.py
python3 -m unittest discover -s tests -v
```

Checks that require Node.js are skipped if it is unavailable. The build updates `extension/launcher.js` and the extension version, and generates local artifacts under `dist/`. Do not edit the generated launcher directly.

When releasing feature updates, keep the versions in the build script, both README files, and the installation guide in sync. Commit the source, tests, and corresponding extension build. Do not commit account snapshots, network recordings, wallet or login information, original game assets, research downloads, or browser profiles. See [AGENTS.md (Chinese)](AGENTS.md) for more maintenance rules.

## Feedback and contact

For bugs, compatibility problems, or concerns about infringement or harm, please open an [Issue](https://github.com/Gintma/Farm-assistant/issues). Include the helper version, browser version, steps to reproduce the issue, and sanitized screenshots where relevant.
