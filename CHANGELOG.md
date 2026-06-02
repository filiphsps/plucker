# Changelog

## [0.20.0](https://github.com/filiphsps/plucker/compare/plucker-v0.19.0...plucker-v0.20.0) (2026-06-02)


### Features

* **analyze-key-bpm:** detect key & BPM with Essentia (WASM), TS fallback ([13a3c67](https://github.com/filiphsps/plucker/commit/13a3c672be796c9194d8965a67f65df17d5f7380))
* app menu navigation with Settings/History shortcuts ([46d09ef](https://github.com/filiphsps/plucker/commit/46d09ef1f29d6647f77616073a90dd7a2d3f0308))
* **app:** wire per-track pause state, context actions, and staged redownload ([4d7868a](https://github.com/filiphsps/plucker/commit/4d7868a828eccda1ffe5f52c26aa28711f459d73))
* **audio:** add configurable output sample rate ([19a8bd6](https://github.com/filiphsps/plucker/commit/19a8bd623a2f5978931b769c5bf59ee6063f300f))
* **audio:** add ffmpeg PCM decode helper ([f72e074](https://github.com/filiphsps/plucker/commit/f72e074352188e1fa21f3433b02def129606da64))
* **audio:** configurable libmp3lame encoding effort (default 7) ([5640e24](https://github.com/filiphsps/plucker/commit/5640e240c9bb7ed96c854aaaf99625e98f567b47))
* **auto-tag:** expose parsing/fusion/verification settings ([dcdc331](https://github.com/filiphsps/plucker/commit/dcdc3310b2bd62b41834c782d440b6e8c6f2bd15))
* **auto-tag:** orchestrate source-aware extraction with verified matching ([a6f0bc6](https://github.com/filiphsps/plucker/commit/a6f0bc6921f410da734c642661cd57e51ba1b1af))
* binary resolver + fetch script ([b8907cd](https://github.com/filiphsps/plucker/commit/b8907cd458d8876d8b459fd92ce15f4ed82c10fb))
* **console:** add gated developer console overlay with file logging ([41676b2](https://github.com/filiphsps/plucker/commit/41676b2d2d78d2370549ae921d735dcb423272f5))
* **console:** floating console window root component ([7ce6c18](https://github.com/filiphsps/plucker/commit/7ce6c1803e9f437cfebc8d345fd00dc8505eeb1a))
* **console:** mount floating console root on #console route ([0d9fa75](https://github.com/filiphsps/plucker/commit/0d9fa75d5e3843877c877d0ec687dd79f1f00658))
* **console:** styled tooltips on console toolbar buttons ([f578748](https://github.com/filiphsps/plucker/commit/f57874894c4ec3be269bffa11e2055e6ca9074eb))
* **console:** title the floating console window "Console — Plucker" ([e85c0a8](https://github.com/filiphsps/plucker/commit/e85c0a87ad1a00eed065519a77629c3b18fd5d3f))
* **console:** undock/redock wiring and mode-aware toggle in App ([9fd2967](https://github.com/filiphsps/plucker/commit/9fd29672cfe46387af359fe6c3be5fd8111a6cb9))
* **cookies:** escalate to root for browser cookies on permission error ([e6e112b](https://github.com/filiphsps/plucker/commit/e6e112b3a399d0b660ee0f3b16b4e5d6d311cedb))
* custom window frame with native traffic lights ([5652400](https://github.com/filiphsps/plucker/commit/56524004a1df8108f3246371207b5bdc470b658b))
* **deck:** slimmer transport deck, drop now-plucking block, left-align progress ([e106c83](https://github.com/filiphsps/plucker/commit/e106c833895057d9294dc14606371ece4e1ba6dd))
* download view UI ([c3c35c9](https://github.com/filiphsps/plucker/commit/c3c35c9b515800ec3b5f050637f05dab87848a05))
* download/tag/rename pipeline ([c4075b3](https://github.com/filiphsps/plucker/commit/c4075b34814bf8f92f340346d7582c0988fac0be))
* **download:** add pause/resume for the active job ([b2847d8](https://github.com/filiphsps/plucker/commit/b2847d83a757b931423409ac8859fda212c5d811))
* **download:** add resolve-phase loading state with live yt-dlp output ([5faf19b](https://github.com/filiphsps/plucker/commit/5faf19b648d485fa8c1a6685ad2a7c3a140cee58))
* **download:** autofocus url input on mount and window focus ([0f09b39](https://github.com/filiphsps/plucker/commit/0f09b395653654296ffa118210722684c93c3506))
* **download:** count failed tracks in the progress counter ([48ddd44](https://github.com/filiphsps/plucker/commit/48ddd44959aa532623e0e9eb38549e87043d6139))
* **download:** resolve-then-stage flow with editable, reorderable track list ([3e08adb](https://github.com/filiphsps/plucker/commit/3e08adb9ac0d3b8c94511273be4e0936b9cffdce))
* **download:** stream per-track stage, speed and elapsed time ([a5a3db9](https://github.com/filiphsps/plucker/commit/a5a3db909673cced4dd2c0169c19af0f4c096095))
* **download:** surface why a track failed to download ([d5484a1](https://github.com/filiphsps/plucker/commit/d5484a1d5a9ca605c7c7a7f1449367c004e29f67))
* **download:** url history, suggestions, input lock and clear action ([75e0651](https://github.com/filiphsps/plucker/commit/75e0651e6716cf30f85d20a21274463014097265))
* **dsp:** add chroma-based musical key estimation ([f7a04c9](https://github.com/filiphsps/plucker/commit/f7a04c904bf029eb4d27e398686769d1b13361c8))
* **dsp:** add musical-key to Camelot mapping ([c3f3ffb](https://github.com/filiphsps/plucker/commit/c3f3ffb585057085dca876a17c927178961e2035))
* **dsp:** add onset-autocorrelation BPM estimation ([e7130d9](https://github.com/filiphsps/plucker/commit/e7130d951d9a71d2a8049d103f3f0840c2dfdd9f))
* **dsp:** add radix-2 FFT utility ([28bdc5c](https://github.com/filiphsps/plucker/commit/28bdc5c4630647a35c9563d0778917ee2f0b0827))
* filename template + sanitization ([9501c28](https://github.com/filiphsps/plucker/commit/9501c2870ca7dfe3ca48be3ca56f12f664ee3af4))
* generate app icon from React, add update-notification card ([953c91f](https://github.com/filiphsps/plucker/commit/953c91f6ae8067d1e68eb928129149458efb8fa7))
* **header:** implement HeaderIconButton for console and settings controls ([0c84d4f](https://github.com/filiphsps/plucker/commit/0c84d4f5f758376e4ff85a641449d7890c1bf311))
* **history:** add opt-in selection to TrackRow ([9ae193d](https://github.com/filiphsps/plucker/commit/9ae193d848aa40fadbc503212daee66c8cbb9ffd))
* **history:** add track selection util ([74f7db6](https://github.com/filiphsps/plucker/commit/74f7db61167d046e0d1eb0d939075a7eda42cce2))
* **history:** add updateTrack for in-place track patches ([cc8270a](https://github.com/filiphsps/plucker/commit/cc8270a12df863d06a90d4655a3bb9173b5551c7))
* **history:** collapse/expand playlists, collapsed by default outside latest 3 ([2369b40](https://github.com/filiphsps/plucker/commit/2369b401eb0b3ee5a2785146da94c10d1e45dc78))
* **history:** job:retransform handler + preload API ([60b668e](https://github.com/filiphsps/plucker/commit/60b668e2ed332193617fc9c5061e2552e1b7e61b))
* **history:** multi-select tracks with bulk actions, clear button, tooltips ([49a4ea3](https://github.com/filiphsps/plucker/commit/49a4ea39ffc4b6666c8fef8ae1bf4954be48d86d))
* **history:** re-run transforms on selection from the context menu ([07f942d](https://github.com/filiphsps/plucker/commit/07f942d7c2f0cc793c6ccf481f75f43a91546295))
* **history:** record failed and cancelled downloads with clear status ([52c2578](https://github.com/filiphsps/plucker/commit/52c257889bcc210a3470bf9cc5cecf1e8c829fad))
* **history:** replace playlist cover placeholder with outcome ring ([3f557f0](https://github.com/filiphsps/plucker/commit/3f557f0fec6c949fb4555def2806bd4052b92805))
* i18n (en/de) with OS auto-detect + settings override ([9b7187a](https://github.com/filiphsps/plucker/commit/9b7187ae375dc61ce028dc7bb6fd3f298dc9d979))
* **i18n:** add analyze-key-bpm transform strings ([5084dba](https://github.com/filiphsps/plucker/commit/5084dbaf7494fa54eb7e97f5a7682688ac8d298f))
* **i18n:** console undock/dock/pin strings ([e90a190](https://github.com/filiphsps/plucker/commit/e90a1901b0dded521f492fac9e32479dad0f3674))
* **icon:** mask app icon for macOS 13–26 (squircle + Icon Composer) ([0a67aaa](https://github.com/filiphsps/plucker/commit/0a67aaacb2c82170fa3831ae7178498223fa1fd4))
* IPC + preload bridge ([b217600](https://github.com/filiphsps/plucker/commit/b217600564f271b9fe9cafadbcbc55dc4b17a482))
* **ipc:** console undock/redock/pin/getState bridge ([ccd7b4d](https://github.com/filiphsps/plucker/commit/ccd7b4dd2264dd7ada0870db957361e34859bea4))
* **ipc:** job:resolve, staged job:start, and per-track skip/pause/resume ([a719edd](https://github.com/filiphsps/plucker/commit/a719edd6f929d86dc83a0ccbaa0b7ad4b4ccf236))
* **main:** add durable per-job checkpoint store ([9fe471c](https://github.com/filiphsps/plucker/commit/9fe471c2a24ca3525cc5a6fb64e4aa9921cb9a3b))
* **main:** add job pool scheduler with budget distribution and queue ([198d2c1](https://github.com/filiphsps/plucker/commit/198d2c18c2d0ef51d90122abce4522fe1288619f))
* **main:** add resume partition/merge/synthesize helpers ([08b5062](https://github.com/filiphsps/plucker/commit/08b5062f4cbca2b557a6b1ac914b09c3f98f7292))
* **main:** floating console window lifecycle and log broadcast ([7218663](https://github.com/filiphsps/plucker/commit/7218663f3baa32b4be2cb6e93c7a9c3ac855998d))
* **main:** resume, retry-failed, and crash-recovery orchestration ([42b5b48](https://github.com/filiphsps/plucker/commit/42b5b4819b7d9fa354d0de6e02362ae40933d84a))
* **main:** route all jobs through the worker pool, keyed by jobId ([ea5caee](https://github.com/filiphsps/plucker/commit/ea5caee4e6a0fc747f643468e792f26b8ce59dc2))
* **menu:** add accelerators for new download, open url, retransform ([d8333ba](https://github.com/filiphsps/plucker/commit/d8333bafe8df9f9c00ebbec44c3e6bcfca14d4ce))
* **menu:** add cache nav target and new-download/open-url IPC bridges ([86dde87](https://github.com/filiphsps/plucker/commit/86dde872ccb24ffe3273a5d7e7acd594db046dfb))
* **menu:** add native context menus across the app ([41a4076](https://github.com/filiphsps/plucker/commit/41a4076da4ccffc738c3c7662336ce8cf8f9f607))
* **menu:** full i18n catalog for custom app menu, drop Go key ([1d7ade9](https://github.com/filiphsps/plucker/commit/1d7ade9df8d6915a4e465491ad24a10e6cc8871a))
* **menu:** per-track skip/pause/resume context-menu items ([2dea6bd](https://github.com/filiphsps/plucker/commit/2dea6bda3a3aab8d670924f629be63b09a789b23))
* **menu:** re-run transforms on the history selection from the app menu ([1d603b5](https://github.com/filiphsps/plucker/commit/1d603b53d4cc455e878f43e3b0488c2af891c8e0))
* **menu:** render context menus via the native SwiftUI panel ([6091b99](https://github.com/filiphsps/plucker/commit/6091b997e99e53ceddc649ef3c75f984ff5db00d))
* **menu:** replace built-in Electron menu with custom i18n template ([98533cd](https://github.com/filiphsps/plucker/commit/98533cd503f22cbdca7cd580b53e7b5a29e27f80))
* **menu:** SF Symbol icons on every menu item via native addon ([7633643](https://github.com/filiphsps/plucker/commit/7633643f68c04c43a89cc9c6b0eaab1f493b7f71))
* **menu:** wire cache nav, New Download and Open URL into the renderer ([a9e59f3](https://github.com/filiphsps/plucker/commit/a9e59f363a627cd12aca9a9d133fc05bb997e02a))
* **metadata:** add token-set string similarity util ([1e7d557](https://github.com/filiphsps/plucker/commit/1e7d557ad3c28a515abccedff336d054b3be1203))
* **metadata:** cache manager IPC ([359cba2](https://github.com/filiphsps/plucker/commit/359cba28c5e39dce4bb00993f8b29663b543b57d))
* **metadata:** capture full info.json into SourceMetadata ([9b6afc3](https://github.com/filiphsps/plucker/commit/9b6afc3d2076dd47e3531b123b4e2bf24988af84))
* **metadata:** classify video source by channel/uploader ([fb7bd1e](https://github.com/filiphsps/plucker/commit/fb7bd1e0c2630d4cbd94d1507b0509f9504a880a))
* **metadata:** content-addressed audio metadata extraction and cache ([d1dc02f](https://github.com/filiphsps/plucker/commit/d1dc02f963de54c3b86822c95a02a1399e27d40b))
* **metadata:** expose track metadata, openExternal and filesExist over IPC ([d41f05d](https://github.com/filiphsps/plucker/commit/d41f05d65d1b2d74ae39d37f405d1c249ce5970c))
* **metadata:** fuse source + parsed signals with per-field confidence ([43f4c79](https://github.com/filiphsps/plucker/commit/43f4c799fcb8f34a1eba12558a71690451f56759))
* **metadata:** pass full info.json source metadata into transform chain ([898976c](https://github.com/filiphsps/plucker/commit/898976cf62c384db74c2e8b279cba531d31a52c3))
* **metadata:** reuse cache to skip redundant work on redownload ([6ba598a](https://github.com/filiphsps/plucker/commit/6ba598a72a12d1bf3d244b9e758d4b383f4864a3))
* **metadata:** self-describing cache entries with list/update/remove/clear ([c845420](https://github.com/filiphsps/plucker/commit/c8454208e442bc757be3c1bfff253be659690441))
* **metadata:** source-aware title parser with feat/version extraction ([d784283](https://github.com/filiphsps/plucker/commit/d7842838203e43ff2a9d386829633c2e88012eb2))
* **metadata:** verified MusicBrainz selection via duration + name gate ([0d76761](https://github.com/filiphsps/plucker/commit/0d7676172a24d0ae8c63bcd56a40588dcf57d9bf))
* **meta:** render key, Camelot & BPM tags dynamically in the detail panel ([7e789e3](https://github.com/filiphsps/plucker/commit/7e789e310a68628b7aee5ce777b62ceea149228b))
* **meta:** show full file path on hover over size cell ([b004988](https://github.com/filiphsps/plucker/commit/b004988b222edc914039974e5e28aa902945ef67))
* musicbrainz client with throttle + cache ([12bfc69](https://github.com/filiphsps/plucker/commit/12bfc69b13a492f7e4939b1fee703a18e60dfc73))
* musicbrainz match selection ([8faf4aa](https://github.com/filiphsps/plucker/commit/8faf4aa07bba817408ffec9fff25b114a1162735))
* **native:** keyboard nav, submenu safe-triangle, scrolling, polish ([e2bd398](https://github.com/filiphsps/plucker/commit/e2bd398f79acb0d6e2dfecb03fdf0d38c4240df8))
* **native:** node-swift SwiftUI context-menu addon ([f88a1ef](https://github.com/filiphsps/plucker/commit/f88a1ef9ed8f382d52c67adc0c2c5d029e83aade))
* node-id3 tagger ([b569b95](https://github.com/filiphsps/plucker/commit/b569b95eff4264e7ede766690505fbb849f7b223))
* notify-only update checks via electron-updater ([b58e084](https://github.com/filiphsps/plucker/commit/b58e0840a928a4ac22f70b63047dc547566147b8))
* **perf:** virtualize downloads, history, and cache lists ([a7560f3](https://github.com/filiphsps/plucker/commit/a7560f3d917ef80445f6a44df0b0c667e819a4c6))
* pipeline emits paths/metadata/videoId; history model + nav/cover/history IPC ([a3a9b60](https://github.com/filiphsps/plucker/commit/a3a9b60771549fc2693552118c00500903a42850))
* **pipeline:** add RetransformSource for already-downloaded files ([3793b4a](https://github.com/filiphsps/plucker/commit/3793b4ab021280c752027962f717e1f7ac6eaf09))
* **pipeline:** benchmark and log the download pipeline ([63fd839](https://github.com/filiphsps/plucker/commit/63fd8392f975aacea205da69657ab9c8410976dd))
* **pipeline:** mark track downloading before yt-dlp spawns ([b8041dc](https://github.com/filiphsps/plucker/commit/b8041dcdbfa46be0df41834e204c3cbe40b7d712))
* **pipeline:** per-track skip, temp-dir cleanup, and job controls ([3cffaa9](https://github.com/filiphsps/plucker/commit/3cffaa93d99005e5c93b410f7947b7d635947465))
* **pipeline:** persist per-track resume checkpoint during a job ([7734f0f](https://github.com/filiphsps/plucker/commit/7734f0f7ca9cb566a7c3cc95cdd37c1b3c72bf70))
* **pipeline:** resolveJob and pre-resolved staged download source ([9bf849f](https://github.com/filiphsps/plucker/commit/9bf849fb58769e0ce79f800143916ad7af1ea7b0))
* **pipeline:** take track budget from deps and rebalance via controls.setLimit ([ebc13dd](https://github.com/filiphsps/plucker/commit/ebc13dd74904075a370cd4566da293aae3b58a9c))
* **pool:** allow resizing the concurrency limit at runtime ([f5f811b](https://github.com/filiphsps/plucker/commit/f5f811b7339ad7b8a876566da38f87f2c04f01b2))
* **preload:** expose resume / retry / interrupted-jobs IPC ([fe9144e](https://github.com/filiphsps/plucker/commit/fe9144e77963fe03b1724cc0fec20b8edf384a2e))
* **preload:** thread jobId through job controls and events ([93e7cf9](https://github.com/filiphsps/plucker/commit/93e7cf990d4a065740a299958d89f29b511c5759))
* redesign UI with DAW-inspired studio theme ([89146fa](https://github.com/filiphsps/plucker/commit/89146fa53acfa1e9d818395a644c1cf0f3f0eec0))
* **renderer:** keep job rail visible while any finished job remains ([5552999](https://github.com/filiphsps/plucker/commit/555299919d9ee65e9db16eafc37b515d877eb26d))
* **renderer:** master-detail multi-job download UI with job rail ([0da7849](https://github.com/filiphsps/plucker/commit/0da78494dce31ca77c4bf5f846bc5350f0104044))
* **renderer:** resizable job rail, keep finished jobs, hide rail when empty ([a041e2e](https://github.com/filiphsps/plucker/commit/a041e2e1ab71074effaa749ce5aeeee4f5fcc68e))
* **renderer:** resume banner + history resume/retry affordances ([f786b88](https://github.com/filiphsps/plucker/commit/f786b8879f14dff0bd0b34c818a4e92d1aef080c))
* **renderer:** show job rail for a single multi-track playlist ([2451fed](https://github.com/filiphsps/plucker/commit/2451fedf70f16d82316241fb20e18a81ee80d3f4))
* set application window title to app name ([e8f4898](https://github.com/filiphsps/plucker/commit/e8f4898595b0c5ec8095441962b8b26c7ef559e1))
* settings load/validate/merge ([5e58bba](https://github.com/filiphsps/plucker/commit/5e58bba719dbd81d435a2f916554d4d079fe69ce))
* settings panel UI ([aabca0b](https://github.com/filiphsps/plucker/commit/aabca0b2c343036ddec1b7993654a3b1a4c1769d))
* **settings:** add reset-settings action with confirm and relaunch ([f2983ab](https://github.com/filiphsps/plucker/commit/f2983ab4249bf7aa6a67b9cac6afb6615543e728))
* **settings:** live-preview language, revert if closed unsaved ([2ff6cdb](https://github.com/filiphsps/plucker/commit/2ff6cdb85b0640abad1bf4f403d0ffbcaf273974))
* **settings:** persist console dock mode and always-on-top ([91e5236](https://github.com/filiphsps/plucker/commit/91e52363d4ab337f8060b84e1084f0681dac0cf9))
* **settings:** show the console toggle shortcut in its description ([208a62b](https://github.com/filiphsps/plucker/commit/208a62b965835ab9e4eedd08f4733f4876e25b6b))
* shared types ([39b5382](https://github.com/filiphsps/plucker/commit/39b53824d662519eac7f4e5f2cda2bad651b9e6d))
* **shared:** add distribute util for splitting a concurrency budget ([80803ea](https://github.com/filiphsps/plucker/commit/80803ea2e728c7ac769790199e0f6397ec68f94d))
* **spawn:** keyed process groups with per-group pause/resume/kill ([f9a17e7](https://github.com/filiphsps/plucker/commit/f9a17e75e835e2bf58c639cb81b5f167dcb31958))
* **staging:** pure remove/move reducer for the staging list ([b24ddec](https://github.com/filiphsps/plucker/commit/b24ddecfa2c5b7d98c73c03c336de88507183bd0))
* **tagger:** write key, BPM, and Camelot ID3 frames ([b981209](https://github.com/filiphsps/plucker/commit/b981209f2e1802508e649c2e82a016698a087859))
* TrackRow w/ cover, history view, download view nav+clear, header tabs ([2e976e7](https://github.com/filiphsps/plucker/commit/2e976e7b23f19e5ea3f6e43792cc3efe52f66973))
* **track:** surface error details on failed tracks ([a269519](https://github.com/filiphsps/plucker/commit/a2695196b2090e9b842a9e5b0113867c469786cc))
* transform pipeline (per-track concurrent transforms) ([557b5e5](https://github.com/filiphsps/plucker/commit/557b5e5c76df420c15c80540b468d8f1db6f3bd4))
* **transforms:** add analyze-key-bpm transform ([8b58c58](https://github.com/filiphsps/plucker/commit/8b58c580c3be155441fff1a406adcc563a4755b9))
* **transforms:** add square cover-art transform ([7b5d1b8](https://github.com/filiphsps/plucker/commit/7b5d1b82b1b3b17c5b8ba54c84dc4ae9394534d1))
* **transforms:** add trim-silence transform ([4fb3d87](https://github.com/filiphsps/plucker/commit/4fb3d8706a322542fc8a88aca32f05db30231ef5))
* **transforms:** leveled, structured per-step logging with timing ([04902de](https://github.com/filiphsps/plucker/commit/04902dee8f614f21d1b79d0ce5244d7f4ce81df2))
* **transforms:** register analyze-key-bpm in the catalog ([01403d1](https://github.com/filiphsps/plucker/commit/01403d1eab36f16c68f69189eba36a28e8d61459))
* **transforms:** thread per-track process group key into ffmpeg spawns ([78ee16a](https://github.com/filiphsps/plucker/commit/78ee16ac297aa64291f3e68178ac036ce8f135c6))
* **types:** add job checkpoint types and interrupted outcome ([0d3b110](https://github.com/filiphsps/plucker/commit/0d3b11048e30888f7bb6fdcd0b234b38ee0d8527))
* **ui:** add dynamic status bar with online/offline indicator ([54a3eb0](https://github.com/filiphsps/plucker/commit/54a3eb03a20bd4e6e469696c9f38f2ecb741fd8f))
* **ui:** add Page wrapper freezing all routes via React Activity ([6fab2a5](https://github.com/filiphsps/plucker/commit/6fab2a5151b4f078e7db99896cbc4e677ca6caf0))
* **ui:** cache manager page linked from Settings ([55e9630](https://github.com/filiphsps/plucker/commit/55e96304664018f1ade0d9ef513ebf0b639766f4))
* **ui:** reusable Tooltip, download speed, live stage and done timing ([30ac510](https://github.com/filiphsps/plucker/commit/30ac510de566a4678619fa465c779eb43c051986))
* **ui:** reusable track-metadata visualizer components ([b5a1f19](https://github.com/filiphsps/plucker/commit/b5a1f1954f7f551649bbf04d26467278b20b3ab3))
* **ui:** show metadata on track expand and flag missing files ([47c7aef](https://github.com/filiphsps/plucker/commit/47c7aef2d72fefd29316d5330c5484f354fabb4b))
* **ui:** size download status column to widest localized label ([e426c67](https://github.com/filiphsps/plucker/commit/e426c67588e96cdafeeae83eb89ce18e4aba25d8))
* **ui:** TrackRow cache variant and tag edit mode ([2180166](https://github.com/filiphsps/plucker/commit/2180166da8cae6745b308aed15bdf2d4b1e80cc3))
* **updater:** background auto-update with throttling and install-on-quit ([845d785](https://github.com/filiphsps/plucker/commit/845d7856d701144acbd6e873e0ffb3bf4f40cab7))
* **updater:** differential macOS updates via blockmaps ([9a2943d](https://github.com/filiphsps/plucker/commit/9a2943d7bf708c70e95cab303e06e42758e556fb))
* **updater:** self-install unsigned macOS updates via bundle swap ([6c94cf5](https://github.com/filiphsps/plucker/commit/6c94cf5f658e0b7c85a7103a9e60ef5b947ce53b))
* **waveform:** add real waveform to the expanded track panel ([e4dece0](https://github.com/filiphsps/plucker/commit/e4dece01a7b25594e1ad22c35286a73af6e5bd61))
* **workers:** add job-client main-side worker handle ([df8d02c](https://github.com/filiphsps/plucker/commit/df8d02c442a7e0913e3096a47b73d1a08cd02c5c))
* **workers:** add job-worker wire protocol types ([c204ed2](https://github.com/filiphsps/plucker/commit/c204ed29d3e5391526952d9506dca85339a337da))
* **workers:** add self-contained job worker entry ([dbe8435](https://github.com/filiphsps/plucker/commit/dbe8435f165d21b6ee54469b038780ad28f3ba22))
* **workers:** wire production job-worker factory ([7f20d4f](https://github.com/filiphsps/plucker/commit/7f20d4f0de3f8397b4b3f75231d7458ce5d8197a))
* youtube title parser ([6bd521d](https://github.com/filiphsps/plucker/commit/6bd521de6fc3a8116a2d796707f30218c0edfc7c))
* yt-dlp args + progress + skip parsing ([d71a9e7](https://github.com/filiphsps/plucker/commit/d71a9e754e3ca90ca488be7a490bc2e92d79ba1b))
* **ytdlp:** per-track temp-dir redirect and process group key ([4d9a6da](https://github.com/filiphsps/plucker/commit/4d9a6dafdcf5871c4e95a46c0fab8c9ff89500f5))


### Bug Fixes

* align traffic lights to toolbar and highlight only the active row ([fb7aba5](https://github.com/filiphsps/plucker/commit/fb7aba5a239270de9dbdab2310eb41b75af6ec3b))
* **analyze-key-bpm:** tempo prior + comb for BPM, tuning-corrected Temperley chroma for key ([3b28d31](https://github.com/filiphsps/plucker/commit/3b28d316cb01c198a2c6dd1ad0dd08b62ab61104))
* auto-setup yt-dlp + ffmpeg via postinstall (fixes 'yt-dlp failed to start') ([2812b95](https://github.com/filiphsps/plucker/commit/2812b95bf5234435d078df79b2c669cc60573053))
* **auto-tag:** album cover always overrides YouTube thumbnail, with release-group fallback ([560172c](https://github.com/filiphsps/plucker/commit/560172cb462b97f1cada3c376fd437cb83fd1a42))
* **build:** rename macOS helper CFBundleName to product name ([3e178d3](https://github.com/filiphsps/plucker/commit/3e178d363c4ca0904bb2e70fab0b621459ec6393))
* **cache:** refresh waveform and audio after a transform re-encode ([e0b05de](https://github.com/filiphsps/plucker/commit/e0b05dea36d8f5e046bd0209f5982c8f12dc67e0))
* **cache:** stop nav tab from highlighting while cache overlay is open ([3e8b43a](https://github.com/filiphsps/plucker/commit/3e8b43a3b2704c06846a5c134952351730e4faef))
* **ci:** allow screenshot steps to fail without failing the release ([685eeb0](https://github.com/filiphsps/plucker/commit/685eeb05ba530425e64baac5e3f852d39d1064d9))
* **ci:** Delete temp uploads + caching ([27de6ed](https://github.com/filiphsps/plucker/commit/27de6edff4d3b6d7573f7899a0e1834c80301f7e))
* **ci:** run build-macos in parallel, depending only on release-please ([4ee423b](https://github.com/filiphsps/plucker/commit/4ee423b5f5d461633c89f55478019653081d93c7))
* **context-menu:** improve mouse event handling for context menu interactions ([b32e958](https://github.com/filiphsps/plucker/commit/b32e95877b305c898ee09642d28df084a33ec1d3))
* **deck:** keep inline failed tally and update tests for slim layout ([53ff088](https://github.com/filiphsps/plucker/commit/53ff08842a5d120cc31b0ba37cf070d3f125ba95))
* **dev:** keep window placement and focus across HMR restarts ([426f194](https://github.com/filiphsps/plucker/commit/426f194150c106e882758a635faf40478325570d))
* **download:** hide URL suggestions until input has a character ([cb9d763](https://github.com/filiphsps/plucker/commit/cb9d763646e4639845ffa3031cbe9703ce9fb7f6))
* **download:** run yt-dlp and ffmpeg off the main-process event loop ([be8352b](https://github.com/filiphsps/plucker/commit/be8352bd032ce4c85880935b9435dc8d6269cf67))
* **eslint:** add resources/** to ignored paths in ESLint configuration ([5be1bbc](https://github.com/filiphsps/plucker/commit/5be1bbcc0b14cd4d61463a37cf0e5b5aaffaefb6))
* **fetch-binaries:** update yt-dlp source and versioning for arm64 and x64 architectures ([a59d323](https://github.com/filiphsps/plucker/commit/a59d323eae1cb4932a102a1bb7b407cebfff7d18))
* **history:** delete only an entry's own files, not the shared folder ([3f80ccc](https://github.com/filiphsps/plucker/commit/3f80ccc8b61644832373ca33f2224eb626000e3f))
* **history:** skip delete confirmation for tracks with no file to lose ([8e33f99](https://github.com/filiphsps/plucker/commit/8e33f99a81d3a01b1884ff11a090e266e76290c3))
* **history:** update original entry on redownload instead of duplicating ([dcaf8a6](https://github.com/filiphsps/plucker/commit/dcaf8a640c516bbf27720098b5995c77f2ff6a80))
* ignore native addons' Swift build output in prettier and eslint ([8a9d9d7](https://github.com/filiphsps/plucker/commit/8a9d9d775729e22d906b87703262a60cf7c4fc33))
* **logo:** correct accent color span in Logo component ([7ed302e](https://github.com/filiphsps/plucker/commit/7ed302e7a2a9f94eb444248d96ec6e6aa6195eef))
* **logo:** update test assertions for accent "L" in Logo component ([0c84d4f](https://github.com/filiphsps/plucker/commit/0c84d4f5f758376e4ff85a641449d7890c1bf311))
* **native:** build a universal self-contained addon (arm64 + x86_64) ([5436d10](https://github.com/filiphsps/plucker/commit/5436d107871d28abede5a2b112868e9f1bc0c6c1))
* pipeline single-video progress, failed-track accounting, resolveJob hardening ([5ac28bf](https://github.com/filiphsps/plucker/commit/5ac28bfcd3d38193bd97637a4b179b96d599d737))
* **pipeline:** download and transform tracks concurrently ([e865223](https://github.com/filiphsps/plucker/commit/e865223086274b09f2f17bbf3426a67a4fe010d6))
* **pipeline:** force-kill yt-dlp/ffmpeg process tree on cancel and quit ([84896a8](https://github.com/filiphsps/plucker/commit/84896a8e8a5133c072b07269e0cc4e784242cf7b))
* **pipeline:** settle job to idle when a track fails mid-transform ([703f0f7](https://github.com/filiphsps/plucker/commit/703f0f7ae10e29d724f236d8bac34feb0086315a))
* **pipeline:** stop mislabeling extraction failures as "below minimum quality" ([6ccddaf](https://github.com/filiphsps/plucker/commit/6ccddaf3d7e50f15e3353a4ff99d76c8e89e1a26))
* **resume:** persist resume-banner dismissals across restarts ([20ce164](https://github.com/filiphsps/plucker/commit/20ce1647367e16de3f4660cb279bb078d701cb41))
* set macOS app name + About panel (Plucker, v0.1.0, author) ([ed0af04](https://github.com/filiphsps/plucker/commit/ed0af04b72ed93db1885d7bad0f9c3d710adffe9))
* **settings:** disable footer until there are unsaved changes ([e4bf3af](https://github.com/filiphsps/plucker/commit/e4bf3afe600ef3c2a1b23a1b40afd23513795271))
* **settings:** keep Cancel always clickable, only gate Save on changes ([c2e4526](https://github.com/filiphsps/plucker/commit/c2e4526bded9ca865b0f89715d2ef142eb22019b))
* tidy toolbar alignment and remove command-bar background band ([0349a01](https://github.com/filiphsps/plucker/commit/0349a01697f3c4789bd762707aa7f7cf9885fa1e))
* **transform:** run key/BPM analysis off the main thread ([a59b84b](https://github.com/filiphsps/plucker/commit/a59b84b78a11fb12572bf9993511a1c8933f03d5))
* **transforms:** enable drag-to-reorder in settings ([6a55804](https://github.com/filiphsps/plucker/commit/6a55804a7cb21fbcf5b13b7fb8e80f0c27e321c3))
* **transforms:** log what each transform actually did ([d64edc1](https://github.com/filiphsps/plucker/commit/d64edc15d5107a3262b733e385f3c7d1f66b67ea))
* **transforms:** only trim silence anchored to the stream edge ([d416188](https://github.com/filiphsps/plucker/commit/d416188e8e4769947bfc4fb068ecfaf2f735e22e))
* **transforms:** render config and distinguish reorder/expand icons ([0659223](https://github.com/filiphsps/plucker/commit/0659223984ad83f1ccaf4c200c52bf5eeded77dc))
* **ui:** align audio metadata strip to the standard panel margins ([4cacb9f](https://github.com/filiphsps/plucker/commit/4cacb9f3bb5c565a0defce48e3dd269ef21294cf))
* **ui:** clamp tooltip into window and enforce one visible at a time ([f13e038](https://github.com/filiphsps/plucker/commit/f13e038bfa80692c40aa48c9cfa8b96bf8bbf824))
* **ui:** keep the transport deck visible for History re-downloads ([64bbe1d](https://github.com/filiphsps/plucker/commit/64bbe1d03fbaea9f9cb10d1f9eb54593eb3fd1e6))
* **ui:** prevent track metadata panel from overflowing horizontally ([3c1d96a](https://github.com/filiphsps/plucker/commit/3c1d96a1a8e50d8aae614e061f3c6437dae0d816))
* **updater:** download macOS updates directly from GitHub, bypassing Squirrel ([6fdd1d9](https://github.com/filiphsps/plucker/commit/6fdd1d9bbd73f8dd0922f369ad197c129b139622))
* **updater:** offer manual download fallback when self-install fails ([4d12255](https://github.com/filiphsps/plucker/commit/4d12255720d6265ea60f31541b02e70dbfb6811b))


### Performance Improvements

* **history:** memoize track rows and stabilize list keys ([ab38ebd](https://github.com/filiphsps/plucker/commit/ab38ebde0c8288da450ddb98f07b90037147cb59))
* **metadata:** read MP3 audio specs in-process instead of spawning ffmpeg ([7e62efb](https://github.com/filiphsps/plucker/commit/7e62efb308f56f7370d1754856c7979bfa680952))
* **pipeline:** decouple download and transform into independent stages ([79cd143](https://github.com/filiphsps/plucker/commit/79cd143a860808aa8b4b0d64e6fa4ef3405b87b0))
* **transform:** run ID3 tag I/O and audio hashing off the main thread ([fc9d9c4](https://github.com/filiphsps/plucker/commit/fc9d9c4fa6e6a9ed0372f2705110e969d81d3408))

## [0.19.0](https://github.com/filiphsps/plucker/compare/plucker-v0.18.0...plucker-v0.19.0) (2026-06-02)


### Features

* **main:** add job pool scheduler with budget distribution and queue ([198d2c1](https://github.com/filiphsps/plucker/commit/198d2c18c2d0ef51d90122abce4522fe1288619f))
* **main:** route all jobs through the worker pool, keyed by jobId ([ea5caee](https://github.com/filiphsps/plucker/commit/ea5caee4e6a0fc747f643468e792f26b8ce59dc2))
* **preload:** thread jobId through job controls and events ([93e7cf9](https://github.com/filiphsps/plucker/commit/93e7cf990d4a065740a299958d89f29b511c5759))
* **renderer:** keep job rail visible while any finished job remains ([5552999](https://github.com/filiphsps/plucker/commit/555299919d9ee65e9db16eafc37b515d877eb26d))
* **renderer:** master-detail multi-job download UI with job rail ([0da7849](https://github.com/filiphsps/plucker/commit/0da78494dce31ca77c4bf5f846bc5350f0104044))
* **renderer:** resizable job rail, keep finished jobs, hide rail when empty ([a041e2e](https://github.com/filiphsps/plucker/commit/a041e2e1ab71074effaa749ce5aeeee4f5fcc68e))
* **renderer:** show job rail for a single multi-track playlist ([2451fed](https://github.com/filiphsps/plucker/commit/2451fedf70f16d82316241fb20e18a81ee80d3f4))
* **ui:** add dynamic status bar with online/offline indicator ([54a3eb0](https://github.com/filiphsps/plucker/commit/54a3eb03a20bd4e6e469696c9f38f2ecb741fd8f))
* **workers:** add job-client main-side worker handle ([df8d02c](https://github.com/filiphsps/plucker/commit/df8d02c442a7e0913e3096a47b73d1a08cd02c5c))
* **workers:** add job-worker wire protocol types ([c204ed2](https://github.com/filiphsps/plucker/commit/c204ed29d3e5391526952d9506dca85339a337da))
* **workers:** add self-contained job worker entry ([dbe8435](https://github.com/filiphsps/plucker/commit/dbe8435f165d21b6ee54469b038780ad28f3ba22))
* **workers:** wire production job-worker factory ([7f20d4f](https://github.com/filiphsps/plucker/commit/7f20d4f0de3f8397b4b3f75231d7458ce5d8197a))

## [0.18.0](https://github.com/filiphsps/plucker/compare/plucker-v0.17.0...plucker-v0.18.0) (2026-06-02)


### Features

* **native:** keyboard nav, submenu safe-triangle, scrolling, polish ([e2bd398](https://github.com/filiphsps/plucker/commit/e2bd398f79acb0d6e2dfecb03fdf0d38c4240df8))
* **perf:** virtualize downloads, history, and cache lists ([a7560f3](https://github.com/filiphsps/plucker/commit/a7560f3d917ef80445f6a44df0b0c667e819a4c6))
* **settings:** live-preview language, revert if closed unsaved ([2ff6cdb](https://github.com/filiphsps/plucker/commit/2ff6cdb85b0640abad1bf4f403d0ffbcaf273974))
* **shared:** add distribute util for splitting a concurrency budget ([80803ea](https://github.com/filiphsps/plucker/commit/80803ea2e728c7ac769790199e0f6397ec68f94d))


### Bug Fixes

* **cache:** refresh waveform and audio after a transform re-encode ([e0b05de](https://github.com/filiphsps/plucker/commit/e0b05dea36d8f5e046bd0209f5982c8f12dc67e0))
* **context-menu:** improve mouse event handling for context menu interactions ([b32e958](https://github.com/filiphsps/plucker/commit/b32e95877b305c898ee09642d28df084a33ec1d3))
* **native:** build a universal self-contained addon (arm64 + x86_64) ([5436d10](https://github.com/filiphsps/plucker/commit/5436d107871d28abede5a2b112868e9f1bc0c6c1))
* **resume:** persist resume-banner dismissals across restarts ([20ce164](https://github.com/filiphsps/plucker/commit/20ce1647367e16de3f4660cb279bb078d701cb41))
* **transforms:** enable drag-to-reorder in settings ([6a55804](https://github.com/filiphsps/plucker/commit/6a55804a7cb21fbcf5b13b7fb8e80f0c27e321c3))
* **transforms:** only trim silence anchored to the stream edge ([d416188](https://github.com/filiphsps/plucker/commit/d416188e8e4769947bfc4fb068ecfaf2f735e22e))

## [0.17.0](https://github.com/filiphsps/plucker/compare/plucker-v0.16.0...plucker-v0.17.0) (2026-06-02)


### Features

* **app:** wire per-track pause state, context actions, and staged redownload ([4d7868a](https://github.com/filiphsps/plucker/commit/4d7868a828eccda1ffe5f52c26aa28711f459d73))
* **console:** floating console window root component ([7ce6c18](https://github.com/filiphsps/plucker/commit/7ce6c1803e9f437cfebc8d345fd00dc8505eeb1a))
* **console:** mount floating console root on #console route ([0d9fa75](https://github.com/filiphsps/plucker/commit/0d9fa75d5e3843877c877d0ec687dd79f1f00658))
* **console:** styled tooltips on console toolbar buttons ([f578748](https://github.com/filiphsps/plucker/commit/f57874894c4ec3be269bffa11e2055e6ca9074eb))
* **console:** title the floating console window "Console — Plucker" ([e85c0a8](https://github.com/filiphsps/plucker/commit/e85c0a87ad1a00eed065519a77629c3b18fd5d3f))
* **console:** undock/redock wiring and mode-aware toggle in App ([9fd2967](https://github.com/filiphsps/plucker/commit/9fd29672cfe46387af359fe6c3be5fd8111a6cb9))
* **deck:** slimmer transport deck, drop now-plucking block, left-align progress ([e106c83](https://github.com/filiphsps/plucker/commit/e106c833895057d9294dc14606371ece4e1ba6dd))
* **download:** resolve-then-stage flow with editable, reorderable track list ([3e08adb](https://github.com/filiphsps/plucker/commit/3e08adb9ac0d3b8c94511273be4e0936b9cffdce))
* **i18n:** console undock/dock/pin strings ([e90a190](https://github.com/filiphsps/plucker/commit/e90a1901b0dded521f492fac9e32479dad0f3674))
* **ipc:** console undock/redock/pin/getState bridge ([ccd7b4d](https://github.com/filiphsps/plucker/commit/ccd7b4dd2264dd7ada0870db957361e34859bea4))
* **ipc:** job:resolve, staged job:start, and per-track skip/pause/resume ([a719edd](https://github.com/filiphsps/plucker/commit/a719edd6f929d86dc83a0ccbaa0b7ad4b4ccf236))
* **main:** add durable per-job checkpoint store ([9fe471c](https://github.com/filiphsps/plucker/commit/9fe471c2a24ca3525cc5a6fb64e4aa9921cb9a3b))
* **main:** add resume partition/merge/synthesize helpers ([08b5062](https://github.com/filiphsps/plucker/commit/08b5062f4cbca2b557a6b1ac914b09c3f98f7292))
* **main:** floating console window lifecycle and log broadcast ([7218663](https://github.com/filiphsps/plucker/commit/7218663f3baa32b4be2cb6e93c7a9c3ac855998d))
* **main:** resume, retry-failed, and crash-recovery orchestration ([42b5b48](https://github.com/filiphsps/plucker/commit/42b5b4819b7d9fa354d0de6e02362ae40933d84a))
* **menu:** add accelerators for new download, open url, retransform ([d8333ba](https://github.com/filiphsps/plucker/commit/d8333bafe8df9f9c00ebbec44c3e6bcfca14d4ce))
* **menu:** add cache nav target and new-download/open-url IPC bridges ([86dde87](https://github.com/filiphsps/plucker/commit/86dde872ccb24ffe3273a5d7e7acd594db046dfb))
* **menu:** full i18n catalog for custom app menu, drop Go key ([1d7ade9](https://github.com/filiphsps/plucker/commit/1d7ade9df8d6915a4e465491ad24a10e6cc8871a))
* **menu:** per-track skip/pause/resume context-menu items ([2dea6bd](https://github.com/filiphsps/plucker/commit/2dea6bda3a3aab8d670924f629be63b09a789b23))
* **menu:** render context menus via the native SwiftUI panel ([6091b99](https://github.com/filiphsps/plucker/commit/6091b997e99e53ceddc649ef3c75f984ff5db00d))
* **menu:** replace built-in Electron menu with custom i18n template ([98533cd](https://github.com/filiphsps/plucker/commit/98533cd503f22cbdca7cd580b53e7b5a29e27f80))
* **menu:** SF Symbol icons on every menu item via native addon ([7633643](https://github.com/filiphsps/plucker/commit/7633643f68c04c43a89cc9c6b0eaab1f493b7f71))
* **menu:** wire cache nav, New Download and Open URL into the renderer ([a9e59f3](https://github.com/filiphsps/plucker/commit/a9e59f363a627cd12aca9a9d133fc05bb997e02a))
* **native:** node-swift SwiftUI context-menu addon ([f88a1ef](https://github.com/filiphsps/plucker/commit/f88a1ef9ed8f382d52c67adc0c2c5d029e83aade))
* **pipeline:** per-track skip, temp-dir cleanup, and job controls ([3cffaa9](https://github.com/filiphsps/plucker/commit/3cffaa93d99005e5c93b410f7947b7d635947465))
* **pipeline:** persist per-track resume checkpoint during a job ([7734f0f](https://github.com/filiphsps/plucker/commit/7734f0f7ca9cb566a7c3cc95cdd37c1b3c72bf70))
* **pipeline:** resolveJob and pre-resolved staged download source ([9bf849f](https://github.com/filiphsps/plucker/commit/9bf849fb58769e0ce79f800143916ad7af1ea7b0))
* **preload:** expose resume / retry / interrupted-jobs IPC ([fe9144e](https://github.com/filiphsps/plucker/commit/fe9144e77963fe03b1724cc0fec20b8edf384a2e))
* **renderer:** resume banner + history resume/retry affordances ([f786b88](https://github.com/filiphsps/plucker/commit/f786b8879f14dff0bd0b34c818a4e92d1aef080c))
* **settings:** persist console dock mode and always-on-top ([91e5236](https://github.com/filiphsps/plucker/commit/91e52363d4ab337f8060b84e1084f0681dac0cf9))
* **spawn:** keyed process groups with per-group pause/resume/kill ([f9a17e7](https://github.com/filiphsps/plucker/commit/f9a17e75e835e2bf58c639cb81b5f167dcb31958))
* **staging:** pure remove/move reducer for the staging list ([b24ddec](https://github.com/filiphsps/plucker/commit/b24ddecfa2c5b7d98c73c03c336de88507183bd0))
* **transforms:** thread per-track process group key into ffmpeg spawns ([78ee16a](https://github.com/filiphsps/plucker/commit/78ee16ac297aa64291f3e68178ac036ce8f135c6))
* **types:** add job checkpoint types and interrupted outcome ([0d3b110](https://github.com/filiphsps/plucker/commit/0d3b11048e30888f7bb6fdcd0b234b38ee0d8527))
* **ytdlp:** per-track temp-dir redirect and process group key ([4d9a6da](https://github.com/filiphsps/plucker/commit/4d9a6dafdcf5871c4e95a46c0fab8c9ff89500f5))


### Bug Fixes

* **build:** rename macOS helper CFBundleName to product name ([3e178d3](https://github.com/filiphsps/plucker/commit/3e178d363c4ca0904bb2e70fab0b621459ec6393))
* **deck:** keep inline failed tally and update tests for slim layout ([53ff088](https://github.com/filiphsps/plucker/commit/53ff08842a5d120cc31b0ba37cf070d3f125ba95))
* ignore native addons' Swift build output in prettier and eslint ([8a9d9d7](https://github.com/filiphsps/plucker/commit/8a9d9d775729e22d906b87703262a60cf7c4fc33))

## [0.16.0](https://github.com/filiphsps/plucker/compare/plucker-v0.15.1...plucker-v0.16.0) (2026-06-02)


### Features

* **history:** replace playlist cover placeholder with outcome ring ([3f557f0](https://github.com/filiphsps/plucker/commit/3f557f0fec6c949fb4555def2806bd4052b92805))
* **settings:** show the console toggle shortcut in its description ([208a62b](https://github.com/filiphsps/plucker/commit/208a62b965835ab9e4eedd08f4733f4876e25b6b))


### Bug Fixes

* **dev:** keep window placement and focus across HMR restarts ([426f194](https://github.com/filiphsps/plucker/commit/426f194150c106e882758a635faf40478325570d))


### Performance Improvements

* **pipeline:** decouple download and transform into independent stages ([79cd143](https://github.com/filiphsps/plucker/commit/79cd143a860808aa8b4b0d64e6fa4ef3405b87b0))
* **transform:** run ID3 tag I/O and audio hashing off the main thread ([fc9d9c4](https://github.com/filiphsps/plucker/commit/fc9d9c4fa6e6a9ed0372f2705110e969d81d3408))

## [0.15.1](https://github.com/filiphsps/plucker/compare/plucker-v0.15.0...plucker-v0.15.1) (2026-06-02)


### Bug Fixes

* **transform:** run key/BPM analysis off the main thread ([a59b84b](https://github.com/filiphsps/plucker/commit/a59b84b78a11fb12572bf9993511a1c8933f03d5))

## [0.15.0](https://github.com/filiphsps/plucker/compare/plucker-v0.14.1...plucker-v0.15.0) (2026-06-02)


### Features

* **analyze-key-bpm:** detect key & BPM with Essentia (WASM), TS fallback ([13a3c67](https://github.com/filiphsps/plucker/commit/13a3c672be796c9194d8965a67f65df17d5f7380))
* **auto-tag:** expose parsing/fusion/verification settings ([dcdc331](https://github.com/filiphsps/plucker/commit/dcdc3310b2bd62b41834c782d440b6e8c6f2bd15))
* **auto-tag:** orchestrate source-aware extraction with verified matching ([a6f0bc6](https://github.com/filiphsps/plucker/commit/a6f0bc6921f410da734c642661cd57e51ba1b1af))
* **history:** add updateTrack for in-place track patches ([cc8270a](https://github.com/filiphsps/plucker/commit/cc8270a12df863d06a90d4655a3bb9173b5551c7))
* **history:** collapse/expand playlists, collapsed by default outside latest 3 ([2369b40](https://github.com/filiphsps/plucker/commit/2369b401eb0b3ee5a2785146da94c10d1e45dc78))
* **history:** job:retransform handler + preload API ([60b668e](https://github.com/filiphsps/plucker/commit/60b668e2ed332193617fc9c5061e2552e1b7e61b))
* **history:** re-run transforms on selection from the context menu ([07f942d](https://github.com/filiphsps/plucker/commit/07f942d7c2f0cc793c6ccf481f75f43a91546295))
* **menu:** re-run transforms on the history selection from the app menu ([1d603b5](https://github.com/filiphsps/plucker/commit/1d603b53d4cc455e878f43e3b0488c2af891c8e0))
* **metadata:** add token-set string similarity util ([1e7d557](https://github.com/filiphsps/plucker/commit/1e7d557ad3c28a515abccedff336d054b3be1203))
* **metadata:** capture full info.json into SourceMetadata ([9b6afc3](https://github.com/filiphsps/plucker/commit/9b6afc3d2076dd47e3531b123b4e2bf24988af84))
* **metadata:** classify video source by channel/uploader ([fb7bd1e](https://github.com/filiphsps/plucker/commit/fb7bd1e0c2630d4cbd94d1507b0509f9504a880a))
* **metadata:** fuse source + parsed signals with per-field confidence ([43f4c79](https://github.com/filiphsps/plucker/commit/43f4c799fcb8f34a1eba12558a71690451f56759))
* **metadata:** pass full info.json source metadata into transform chain ([898976c](https://github.com/filiphsps/plucker/commit/898976cf62c384db74c2e8b279cba531d31a52c3))
* **metadata:** source-aware title parser with feat/version extraction ([d784283](https://github.com/filiphsps/plucker/commit/d7842838203e43ff2a9d386829633c2e88012eb2))
* **metadata:** verified MusicBrainz selection via duration + name gate ([0d76761](https://github.com/filiphsps/plucker/commit/0d7676172a24d0ae8c63bcd56a40588dcf57d9bf))
* **pipeline:** add RetransformSource for already-downloaded files ([3793b4a](https://github.com/filiphsps/plucker/commit/3793b4ab021280c752027962f717e1f7ac6eaf09))


### Performance Improvements

* **history:** memoize track rows and stabilize list keys ([ab38ebd](https://github.com/filiphsps/plucker/commit/ab38ebde0c8288da450ddb98f07b90037147cb59))

## [0.14.1](https://github.com/filiphsps/plucker/compare/plucker-v0.14.0...plucker-v0.14.1) (2026-06-02)


### Bug Fixes

* **analyze-key-bpm:** tempo prior + comb for BPM, tuning-corrected Temperley chroma for key ([3b28d31](https://github.com/filiphsps/plucker/commit/3b28d316cb01c198a2c6dd1ad0dd08b62ab61104))
* **auto-tag:** album cover always overrides YouTube thumbnail, with release-group fallback ([560172c](https://github.com/filiphsps/plucker/commit/560172cb462b97f1cada3c376fd437cb83fd1a42))
* **transforms:** log what each transform actually did ([d64edc1](https://github.com/filiphsps/plucker/commit/d64edc15d5107a3262b733e385f3c7d1f66b67ea))

## [0.14.0](https://github.com/filiphsps/plucker/compare/plucker-v0.13.0...plucker-v0.14.0) (2026-06-02)


### Features

* **audio:** add ffmpeg PCM decode helper ([f72e074](https://github.com/filiphsps/plucker/commit/f72e074352188e1fa21f3433b02def129606da64))
* **dsp:** add chroma-based musical key estimation ([f7a04c9](https://github.com/filiphsps/plucker/commit/f7a04c904bf029eb4d27e398686769d1b13361c8))
* **dsp:** add musical-key to Camelot mapping ([c3f3ffb](https://github.com/filiphsps/plucker/commit/c3f3ffb585057085dca876a17c927178961e2035))
* **dsp:** add onset-autocorrelation BPM estimation ([e7130d9](https://github.com/filiphsps/plucker/commit/e7130d951d9a71d2a8049d103f3f0840c2dfdd9f))
* **dsp:** add radix-2 FFT utility ([28bdc5c](https://github.com/filiphsps/plucker/commit/28bdc5c4630647a35c9563d0778917ee2f0b0827))
* **i18n:** add analyze-key-bpm transform strings ([5084dba](https://github.com/filiphsps/plucker/commit/5084dbaf7494fa54eb7e97f5a7682688ac8d298f))
* **meta:** render key, Camelot & BPM tags dynamically in the detail panel ([7e789e3](https://github.com/filiphsps/plucker/commit/7e789e310a68628b7aee5ce777b62ceea149228b))
* **tagger:** write key, BPM, and Camelot ID3 frames ([b981209](https://github.com/filiphsps/plucker/commit/b981209f2e1802508e649c2e82a016698a087859))
* **transforms:** add analyze-key-bpm transform ([8b58c58](https://github.com/filiphsps/plucker/commit/8b58c580c3be155441fff1a406adcc563a4755b9))
* **transforms:** leveled, structured per-step logging with timing ([04902de](https://github.com/filiphsps/plucker/commit/04902dee8f614f21d1b79d0ce5244d7f4ce81df2))
* **transforms:** register analyze-key-bpm in the catalog ([01403d1](https://github.com/filiphsps/plucker/commit/01403d1eab36f16c68f69189eba36a28e8d61459))


### Bug Fixes

* **download:** hide URL suggestions until input has a character ([cb9d763](https://github.com/filiphsps/plucker/commit/cb9d763646e4639845ffa3031cbe9703ce9fb7f6))

## [0.13.0](https://github.com/filiphsps/plucker/compare/plucker-v0.12.0...plucker-v0.13.0) (2026-06-02)


### Features

* **download:** add pause/resume for the active job ([b2847d8](https://github.com/filiphsps/plucker/commit/b2847d83a757b931423409ac8859fda212c5d811))
* **history:** add opt-in selection to TrackRow ([9ae193d](https://github.com/filiphsps/plucker/commit/9ae193d848aa40fadbc503212daee66c8cbb9ffd))
* **history:** add track selection util ([74f7db6](https://github.com/filiphsps/plucker/commit/74f7db61167d046e0d1eb0d939075a7eda42cce2))
* **history:** multi-select tracks with bulk actions, clear button, tooltips ([49a4ea3](https://github.com/filiphsps/plucker/commit/49a4ea39ffc4b6666c8fef8ae1bf4954be48d86d))
* **icon:** mask app icon for macOS 13–26 (squircle + Icon Composer) ([0a67aaa](https://github.com/filiphsps/plucker/commit/0a67aaacb2c82170fa3831ae7178498223fa1fd4))


### Bug Fixes

* **history:** skip delete confirmation for tracks with no file to lose ([8e33f99](https://github.com/filiphsps/plucker/commit/8e33f99a81d3a01b1884ff11a090e266e76290c3))

## [0.12.0](https://github.com/filiphsps/plucker/compare/plucker-v0.11.0...plucker-v0.12.0) (2026-06-02)


### Features

* **download:** autofocus url input on mount and window focus ([0f09b39](https://github.com/filiphsps/plucker/commit/0f09b395653654296ffa118210722684c93c3506))
* **settings:** add reset-settings action with confirm and relaunch ([f2983ab](https://github.com/filiphsps/plucker/commit/f2983ab4249bf7aa6a67b9cac6afb6615543e728))


### Bug Fixes

* **history:** delete only an entry's own files, not the shared folder ([3f80ccc](https://github.com/filiphsps/plucker/commit/3f80ccc8b61644832373ca33f2224eb626000e3f))

## [0.11.0](https://github.com/filiphsps/plucker/compare/plucker-v0.10.1...plucker-v0.11.0) (2026-06-02)


### Features

* **download:** url history, suggestions, input lock and clear action ([75e0651](https://github.com/filiphsps/plucker/commit/75e0651e6716cf30f85d20a21274463014097265))
* **waveform:** add real waveform to the expanded track panel ([e4dece0](https://github.com/filiphsps/plucker/commit/e4dece01a7b25594e1ad22c35286a73af6e5bd61))


### Bug Fixes

* **cache:** stop nav tab from highlighting while cache overlay is open ([3e8b43a](https://github.com/filiphsps/plucker/commit/3e8b43a3b2704c06846a5c134952351730e4faef))

## [0.10.1](https://github.com/filiphsps/plucker/compare/plucker-v0.10.0...plucker-v0.10.1) (2026-06-02)


### Bug Fixes

* **ci:** Delete temp uploads + caching ([27de6ed](https://github.com/filiphsps/plucker/commit/27de6edff4d3b6d7573f7899a0e1834c80301f7e))

## [0.10.0](https://github.com/filiphsps/plucker/compare/plucker-v0.9.1...plucker-v0.10.0) (2026-06-02)


### Features

* **transforms:** add trim-silence transform ([4fb3d87](https://github.com/filiphsps/plucker/commit/4fb3d8706a322542fc8a88aca32f05db30231ef5))

## [0.9.1](https://github.com/filiphsps/plucker/compare/plucker-v0.9.0...plucker-v0.9.1) (2026-06-02)


### Bug Fixes

* **ci:** allow screenshot steps to fail without failing the release ([685eeb0](https://github.com/filiphsps/plucker/commit/685eeb05ba530425e64baac5e3f852d39d1064d9))
* **ci:** run build-macos in parallel, depending only on release-please ([4ee423b](https://github.com/filiphsps/plucker/commit/4ee423b5f5d461633c89f55478019653081d93c7))

## [0.9.0](https://github.com/filiphsps/plucker/compare/plucker-v0.8.0...plucker-v0.9.0) (2026-06-02)


### Features

* **menu:** add native context menus across the app ([41a4076](https://github.com/filiphsps/plucker/commit/41a4076da4ccffc738c3c7662336ce8cf8f9f607))
* **transforms:** add square cover-art transform ([7b5d1b8](https://github.com/filiphsps/plucker/commit/7b5d1b82b1b3b17c5b8ba54c84dc4ae9394534d1))
* **updater:** background auto-update with throttling and install-on-quit ([845d785](https://github.com/filiphsps/plucker/commit/845d7856d701144acbd6e873e0ffb3bf4f40cab7))
* **updater:** differential macOS updates via blockmaps ([9a2943d](https://github.com/filiphsps/plucker/commit/9a2943d7bf708c70e95cab303e06e42758e556fb))

## [0.8.0](https://github.com/filiphsps/plucker/compare/plucker-v0.7.1...plucker-v0.8.0) (2026-06-01)


### Features

* **cookies:** escalate to root for browser cookies on permission error ([e6e112b](https://github.com/filiphsps/plucker/commit/e6e112b3a399d0b660ee0f3b16b4e5d6d311cedb))


### Bug Fixes

* **updater:** offer manual download fallback when self-install fails ([4d12255](https://github.com/filiphsps/plucker/commit/4d12255720d6265ea60f31541b02e70dbfb6811b))

## [0.7.1](https://github.com/filiphsps/plucker/compare/plucker-v0.7.0...plucker-v0.7.1) (2026-06-01)


### Bug Fixes

* **fetch-binaries:** update yt-dlp source and versioning for arm64 and x64 architectures ([a59d323](https://github.com/filiphsps/plucker/commit/a59d323eae1cb4932a102a1bb7b407cebfff7d18))
* **pipeline:** stop mislabeling extraction failures as "below minimum quality" ([6ccddaf](https://github.com/filiphsps/plucker/commit/6ccddaf3d7e50f15e3353a4ff99d76c8e89e1a26))
* **updater:** download macOS updates directly from GitHub, bypassing Squirrel ([6fdd1d9](https://github.com/filiphsps/plucker/commit/6fdd1d9bbd73f8dd0922f369ad197c129b139622))

## [0.7.0](https://github.com/filiphsps/plucker/compare/plucker-v0.6.0...plucker-v0.7.0) (2026-06-01)


### Features

* **log:** structured, variadic developer-console logging ([f530288](https://github.com/filiphsps/plucker/commit/f530288d3beed8ac6fcfc81aca730790a8cf338d))

## [0.6.0](https://github.com/filiphsps/plucker/compare/plucker-v0.5.0...plucker-v0.6.0) (2026-06-01)

### Features

- **console:** add gated developer console overlay with file logging ([41676b2](https://github.com/filiphsps/plucker/commit/41676b2d2d78d2370549ae921d735dcb423272f5))
- generate app icon from React, add update-notification card ([953c91f](https://github.com/filiphsps/plucker/commit/953c91f6ae8067d1e68eb928129149458efb8fa7))
- **header:** implement HeaderIconButton for console and settings controls ([0c84d4f](https://github.com/filiphsps/plucker/commit/0c84d4f5f758376e4ff85a641449d7890c1bf311))
- **track:** surface error details on failed tracks ([a269519](https://github.com/filiphsps/plucker/commit/a2695196b2090e9b842a9e5b0113867c469786cc))
- **updater:** self-install unsigned macOS updates via bundle swap ([6c94cf5](https://github.com/filiphsps/plucker/commit/6c94cf5f658e0b7c85a7103a9e60ef5b947ce53b))

### Bug Fixes

- **eslint:** add resources/\*\* to ignored paths in ESLint configuration ([5be1bbc](https://github.com/filiphsps/plucker/commit/5be1bbcc0b14cd4d61463a37cf0e5b5aaffaefb6))
- **logo:** correct accent color span in Logo component ([7ed302e](https://github.com/filiphsps/plucker/commit/7ed302e7a2a9f94eb444248d96ec6e6aa6195eef))
- **logo:** update test assertions for accent "L" in Logo component ([0c84d4f](https://github.com/filiphsps/plucker/commit/0c84d4f5f758376e4ff85a641449d7890c1bf311))

## [0.5.0](https://github.com/filiphsps/plucker/compare/plucker-v0.4.0...plucker-v0.5.0) (2026-06-01)

### Features

- **audio:** add configurable output sample rate ([19a8bd6](https://github.com/filiphsps/plucker/commit/19a8bd623a2f5978931b769c5bf59ee6063f300f))
- **download:** add resolve-phase loading state with live yt-dlp output ([5faf19b](https://github.com/filiphsps/plucker/commit/5faf19b648d485fa8c1a6685ad2a7c3a140cee58))
- **history:** record failed and cancelled downloads with clear status ([52c2578](https://github.com/filiphsps/plucker/commit/52c257889bcc210a3470bf9cc5cecf1e8c829fad))
- **meta:** show full file path on hover over size cell ([b004988](https://github.com/filiphsps/plucker/commit/b004988b222edc914039974e5e28aa902945ef67))
- **pipeline:** mark track downloading before yt-dlp spawns ([b8041dc](https://github.com/filiphsps/plucker/commit/b8041dcdbfa46be0df41834e204c3cbe40b7d712))
- **ui:** add Page wrapper freezing all routes via React Activity ([6fab2a5](https://github.com/filiphsps/plucker/commit/6fab2a5151b4f078e7db99896cbc4e677ca6caf0))
- **ui:** size download status column to widest localized label ([e426c67](https://github.com/filiphsps/plucker/commit/e426c67588e96cdafeeae83eb89ce18e4aba25d8))

### Bug Fixes

- **pipeline:** force-kill yt-dlp/ffmpeg process tree on cancel and quit ([84896a8](https://github.com/filiphsps/plucker/commit/84896a8e8a5133c072b07269e0cc4e784242cf7b))
- **pipeline:** settle job to idle when a track fails mid-transform ([703f0f7](https://github.com/filiphsps/plucker/commit/703f0f7ae10e29d724f236d8bac34feb0086315a))
- **settings:** disable footer until there are unsaved changes ([e4bf3af](https://github.com/filiphsps/plucker/commit/e4bf3afe600ef3c2a1b23a1b40afd23513795271))
- **settings:** keep Cancel always clickable, only gate Save on changes ([c2e4526](https://github.com/filiphsps/plucker/commit/c2e4526bded9ca865b0f89715d2ef142eb22019b))
- **ui:** clamp tooltip into window and enforce one visible at a time ([f13e038](https://github.com/filiphsps/plucker/commit/f13e038bfa80692c40aa48c9cfa8b96bf8bbf824))

## [0.4.0](https://github.com/filiphsps/plucker/compare/plucker-v0.3.0...plucker-v0.4.0) (2026-06-01)

### Features

- **audio:** configurable libmp3lame encoding effort (default 7) ([5640e24](https://github.com/filiphsps/plucker/commit/5640e240c9bb7ed96c854aaaf99625e98f567b47))
- **download:** count failed tracks in the progress counter ([48ddd44](https://github.com/filiphsps/plucker/commit/48ddd44959aa532623e0e9eb38549e87043d6139))
- **download:** stream per-track stage, speed and elapsed time ([a5a3db9](https://github.com/filiphsps/plucker/commit/a5a3db909673cced4dd2c0169c19af0f4c096095))
- **download:** surface why a track failed to download ([d5484a1](https://github.com/filiphsps/plucker/commit/d5484a1d5a9ca605c7c7a7f1449367c004e29f67))
- **metadata:** cache manager IPC ([359cba2](https://github.com/filiphsps/plucker/commit/359cba28c5e39dce4bb00993f8b29663b543b57d))
- **metadata:** content-addressed audio metadata extraction and cache ([d1dc02f](https://github.com/filiphsps/plucker/commit/d1dc02f963de54c3b86822c95a02a1399e27d40b))
- **metadata:** expose track metadata, openExternal and filesExist over IPC ([d41f05d](https://github.com/filiphsps/plucker/commit/d41f05d65d1b2d74ae39d37f405d1c249ce5970c))
- **metadata:** reuse cache to skip redundant work on redownload ([6ba598a](https://github.com/filiphsps/plucker/commit/6ba598a72a12d1bf3d244b9e758d4b383f4864a3))
- **metadata:** self-describing cache entries with list/update/remove/clear ([c845420](https://github.com/filiphsps/plucker/commit/c8454208e442bc757be3c1bfff253be659690441))
- **pipeline:** benchmark and log the download pipeline ([63fd839](https://github.com/filiphsps/plucker/commit/63fd8392f975aacea205da69657ab9c8410976dd))
- **ui:** cache manager page linked from Settings ([55e9630](https://github.com/filiphsps/plucker/commit/55e96304664018f1ade0d9ef513ebf0b639766f4))
- **ui:** reusable Tooltip, download speed, live stage and done timing ([30ac510](https://github.com/filiphsps/plucker/commit/30ac510de566a4678619fa465c779eb43c051986))
- **ui:** reusable track-metadata visualizer components ([b5a1f19](https://github.com/filiphsps/plucker/commit/b5a1f1954f7f551649bbf04d26467278b20b3ab3))
- **ui:** show metadata on track expand and flag missing files ([47c7aef](https://github.com/filiphsps/plucker/commit/47c7aef2d72fefd29316d5330c5484f354fabb4b))
- **ui:** TrackRow cache variant and tag edit mode ([2180166](https://github.com/filiphsps/plucker/commit/2180166da8cae6745b308aed15bdf2d4b1e80cc3))

### Bug Fixes

- **download:** run yt-dlp and ffmpeg off the main-process event loop ([be8352b](https://github.com/filiphsps/plucker/commit/be8352bd032ce4c85880935b9435dc8d6269cf67))
- **pipeline:** download and transform tracks concurrently ([e865223](https://github.com/filiphsps/plucker/commit/e865223086274b09f2f17bbf3426a67a4fe010d6))
- **ui:** align audio metadata strip to the standard panel margins ([4cacb9f](https://github.com/filiphsps/plucker/commit/4cacb9f3bb5c565a0defce48e3dd269ef21294cf))
- **ui:** keep the transport deck visible for History re-downloads ([64bbe1d](https://github.com/filiphsps/plucker/commit/64bbe1d03fbaea9f9cb10d1f9eb54593eb3fd1e6))
- **ui:** prevent track metadata panel from overflowing horizontally ([3c1d96a](https://github.com/filiphsps/plucker/commit/3c1d96a1a8e50d8aae614e061f3c6437dae0d816))

### Performance Improvements

- **metadata:** read MP3 audio specs in-process instead of spawning ffmpeg ([7e62efb](https://github.com/filiphsps/plucker/commit/7e62efb308f56f7370d1754856c7979bfa680952))

## [0.3.0](https://github.com/filiphsps/plucker/compare/plucker-v0.2.0...plucker-v0.3.0) (2026-06-01)

### Features

- custom window frame with native traffic lights ([5652400](https://github.com/filiphsps/plucker/commit/56524004a1df8108f3246371207b5bdc470b658b))
- redesign UI with DAW-inspired studio theme ([89146fa](https://github.com/filiphsps/plucker/commit/89146fa53acfa1e9d818395a644c1cf0f3f0eec0))

### Bug Fixes

- align traffic lights to toolbar and highlight only the active row ([fb7aba5](https://github.com/filiphsps/plucker/commit/fb7aba5a239270de9dbdab2310eb41b75af6ec3b))
- **history:** update original entry on redownload instead of duplicating ([dcaf8a6](https://github.com/filiphsps/plucker/commit/dcaf8a640c516bbf27720098b5995c77f2ff6a80))
- tidy toolbar alignment and remove command-bar background band ([0349a01](https://github.com/filiphsps/plucker/commit/0349a01697f3c4789bd762707aa7f7cf9885fa1e))
- **transforms:** render config and distinguish reorder/expand icons ([0659223](https://github.com/filiphsps/plucker/commit/0659223984ad83f1ccaf4c200c52bf5eeded77dc))

## [0.2.0](https://github.com/filiphsps/plucker/compare/plucker-v0.1.0...plucker-v0.2.0) (2026-06-01)

### Features

- app menu navigation with Settings/History shortcuts ([46d09ef](https://github.com/filiphsps/plucker/commit/46d09ef1f29d6647f77616073a90dd7a2d3f0308))
- binary resolver + fetch script ([b8907cd](https://github.com/filiphsps/plucker/commit/b8907cd458d8876d8b459fd92ce15f4ed82c10fb))
- download view UI ([c3c35c9](https://github.com/filiphsps/plucker/commit/c3c35c9b515800ec3b5f050637f05dab87848a05))
- download/tag/rename pipeline ([c4075b3](https://github.com/filiphsps/plucker/commit/c4075b34814bf8f92f340346d7582c0988fac0be))
- filename template + sanitization ([9501c28](https://github.com/filiphsps/plucker/commit/9501c2870ca7dfe3ca48be3ca56f12f664ee3af4))
- i18n (en/de) with OS auto-detect + settings override ([9b7187a](https://github.com/filiphsps/plucker/commit/9b7187ae375dc61ce028dc7bb6fd3f298dc9d979))
- IPC + preload bridge ([b217600](https://github.com/filiphsps/plucker/commit/b217600564f271b9fe9cafadbcbc55dc4b17a482))
- musicbrainz client with throttle + cache ([12bfc69](https://github.com/filiphsps/plucker/commit/12bfc69b13a492f7e4939b1fee703a18e60dfc73))
- musicbrainz match selection ([8faf4aa](https://github.com/filiphsps/plucker/commit/8faf4aa07bba817408ffec9fff25b114a1162735))
- node-id3 tagger ([b569b95](https://github.com/filiphsps/plucker/commit/b569b95eff4264e7ede766690505fbb849f7b223))
- notify-only update checks via electron-updater ([b58e084](https://github.com/filiphsps/plucker/commit/b58e0840a928a4ac22f70b63047dc547566147b8))
- pipeline emits paths/metadata/videoId; history model + nav/cover/history IPC ([a3a9b60](https://github.com/filiphsps/plucker/commit/a3a9b60771549fc2693552118c00500903a42850))
- set application window title to app name ([e8f4898](https://github.com/filiphsps/plucker/commit/e8f4898595b0c5ec8095441962b8b26c7ef559e1))
- settings load/validate/merge ([5e58bba](https://github.com/filiphsps/plucker/commit/5e58bba719dbd81d435a2f916554d4d079fe69ce))
- settings panel UI ([aabca0b](https://github.com/filiphsps/plucker/commit/aabca0b2c343036ddec1b7993654a3b1a4c1769d))
- shared types ([39b5382](https://github.com/filiphsps/plucker/commit/39b53824d662519eac7f4e5f2cda2bad651b9e6d))
- TrackRow w/ cover, history view, download view nav+clear, header tabs ([2e976e7](https://github.com/filiphsps/plucker/commit/2e976e7b23f19e5ea3f6e43792cc3efe52f66973))
- transform pipeline (per-track concurrent transforms) ([557b5e5](https://github.com/filiphsps/plucker/commit/557b5e5c76df420c15c80540b468d8f1db6f3bd4))
- youtube title parser ([6bd521d](https://github.com/filiphsps/plucker/commit/6bd521de6fc3a8116a2d796707f30218c0edfc7c))
- yt-dlp args + progress + skip parsing ([d71a9e7](https://github.com/filiphsps/plucker/commit/d71a9e754e3ca90ca488be7a490bc2e92d79ba1b))

### Bug Fixes

- auto-setup yt-dlp + ffmpeg via postinstall (fixes 'yt-dlp failed to start') ([2812b95](https://github.com/filiphsps/plucker/commit/2812b95bf5234435d078df79b2c669cc60573053))
- pipeline single-video progress, failed-track accounting, resolveJob hardening ([5ac28bf](https://github.com/filiphsps/plucker/commit/5ac28bfcd3d38193bd97637a4b179b96d599d737))
- set macOS app name + About panel (Plucker, v0.1.0, author) ([ed0af04](https://github.com/filiphsps/plucker/commit/ed0af04b72ed93db1885d7bad0f9c3d710adffe9))
