# Changelog

## [0.3.0](https://github.com/filiphsps/plucker/compare/plucker-v0.2.0...plucker-v0.3.0) (2026-06-01)


### Features

* custom window frame with native traffic lights ([5652400](https://github.com/filiphsps/plucker/commit/56524004a1df8108f3246371207b5bdc470b658b))
* redesign UI with DAW-inspired studio theme ([89146fa](https://github.com/filiphsps/plucker/commit/89146fa53acfa1e9d818395a644c1cf0f3f0eec0))


### Bug Fixes

* align traffic lights to toolbar and highlight only the active row ([fb7aba5](https://github.com/filiphsps/plucker/commit/fb7aba5a239270de9dbdab2310eb41b75af6ec3b))
* **history:** update original entry on redownload instead of duplicating ([dcaf8a6](https://github.com/filiphsps/plucker/commit/dcaf8a640c516bbf27720098b5995c77f2ff6a80))
* tidy toolbar alignment and remove command-bar background band ([0349a01](https://github.com/filiphsps/plucker/commit/0349a01697f3c4789bd762707aa7f7cf9885fa1e))
* **transforms:** render config and distinguish reorder/expand icons ([0659223](https://github.com/filiphsps/plucker/commit/0659223984ad83f1ccaf4c200c52bf5eeded77dc))

## [0.2.0](https://github.com/filiphsps/plucker/compare/plucker-v0.1.0...plucker-v0.2.0) (2026-06-01)


### Features

* app menu navigation with Settings/History shortcuts ([46d09ef](https://github.com/filiphsps/plucker/commit/46d09ef1f29d6647f77616073a90dd7a2d3f0308))
* binary resolver + fetch script ([b8907cd](https://github.com/filiphsps/plucker/commit/b8907cd458d8876d8b459fd92ce15f4ed82c10fb))
* download view UI ([c3c35c9](https://github.com/filiphsps/plucker/commit/c3c35c9b515800ec3b5f050637f05dab87848a05))
* download/tag/rename pipeline ([c4075b3](https://github.com/filiphsps/plucker/commit/c4075b34814bf8f92f340346d7582c0988fac0be))
* filename template + sanitization ([9501c28](https://github.com/filiphsps/plucker/commit/9501c2870ca7dfe3ca48be3ca56f12f664ee3af4))
* i18n (en/de) with OS auto-detect + settings override ([9b7187a](https://github.com/filiphsps/plucker/commit/9b7187ae375dc61ce028dc7bb6fd3f298dc9d979))
* IPC + preload bridge ([b217600](https://github.com/filiphsps/plucker/commit/b217600564f271b9fe9cafadbcbc55dc4b17a482))
* musicbrainz client with throttle + cache ([12bfc69](https://github.com/filiphsps/plucker/commit/12bfc69b13a492f7e4939b1fee703a18e60dfc73))
* musicbrainz match selection ([8faf4aa](https://github.com/filiphsps/plucker/commit/8faf4aa07bba817408ffec9fff25b114a1162735))
* node-id3 tagger ([b569b95](https://github.com/filiphsps/plucker/commit/b569b95eff4264e7ede766690505fbb849f7b223))
* notify-only update checks via electron-updater ([b58e084](https://github.com/filiphsps/plucker/commit/b58e0840a928a4ac22f70b63047dc547566147b8))
* pipeline emits paths/metadata/videoId; history model + nav/cover/history IPC ([a3a9b60](https://github.com/filiphsps/plucker/commit/a3a9b60771549fc2693552118c00500903a42850))
* set application window title to app name ([e8f4898](https://github.com/filiphsps/plucker/commit/e8f4898595b0c5ec8095441962b8b26c7ef559e1))
* settings load/validate/merge ([5e58bba](https://github.com/filiphsps/plucker/commit/5e58bba719dbd81d435a2f916554d4d079fe69ce))
* settings panel UI ([aabca0b](https://github.com/filiphsps/plucker/commit/aabca0b2c343036ddec1b7993654a3b1a4c1769d))
* shared types ([39b5382](https://github.com/filiphsps/plucker/commit/39b53824d662519eac7f4e5f2cda2bad651b9e6d))
* TrackRow w/ cover, history view, download view nav+clear, header tabs ([2e976e7](https://github.com/filiphsps/plucker/commit/2e976e7b23f19e5ea3f6e43792cc3efe52f66973))
* transform pipeline (per-track concurrent transforms) ([557b5e5](https://github.com/filiphsps/plucker/commit/557b5e5c76df420c15c80540b468d8f1db6f3bd4))
* youtube title parser ([6bd521d](https://github.com/filiphsps/plucker/commit/6bd521de6fc3a8116a2d796707f30218c0edfc7c))
* yt-dlp args + progress + skip parsing ([d71a9e7](https://github.com/filiphsps/plucker/commit/d71a9e754e3ca90ca488be7a490bc2e92d79ba1b))


### Bug Fixes

* auto-setup yt-dlp + ffmpeg via postinstall (fixes 'yt-dlp failed to start') ([2812b95](https://github.com/filiphsps/plucker/commit/2812b95bf5234435d078df79b2c669cc60573053))
* pipeline single-video progress, failed-track accounting, resolveJob hardening ([5ac28bf](https://github.com/filiphsps/plucker/commit/5ac28bfcd3d38193bd97637a4b179b96d599d737))
* set macOS app name + About panel (Plucker, v0.1.0, author) ([ed0af04](https://github.com/filiphsps/plucker/commit/ed0af04b72ed93db1885d7bad0f9c3d710adffe9))
