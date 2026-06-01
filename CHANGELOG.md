# Changelog

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
