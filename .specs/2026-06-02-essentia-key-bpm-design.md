# Design: Essentia-backed key & BPM detection

Date: 2026-06-02
Status: Approved (pending spec review)

## Problem

The `analyze-key-bpm` transform detects musical key and tempo with hand-rolled
DSP in TypeScript (`src/shared/chroma.ts`, `src/shared/tempo.ts`):

- **Key** uses a Krumhansl–Schmuckler-style chromagram correlated against
  Temperley profiles. This algorithm family caps around 60–70% accuracy even
  when implemented perfectly, and its characteristic errors — relative
  major/minor swaps and perfect-fifth confusions — make the detected key look
  "wildly off" in practice.
- **BPM** uses a spectral-flux onset envelope + autocorrelation with a tempo
  prior. It lands close on clean 4/4 material but suffers the classic
  octave/half-time errors on busy or syncopated tracks ("sometimes close,
  sometimes wildly off").

The ceiling here is algorithmic, not a tuning bug. No amount of parameter
tweaking moves a hand-rolled chroma key detector into "reliable" territory.

## Decision

Replace the analysis engine with **Essentia.js** — the WebAssembly build of
Essentia, the C++ MIR library behind many production DJ/music apps. It ships
state-of-the-art, trained implementations of exactly these two tasks:

- `KeyExtractor` → `{ key, scale, strength }`
- `RhythmExtractor2013` → `{ bpm, confidence, ... }`

Pure JS/WASM, so no native per-arch binary to codesign — the unsigned
arm64+x64 DMG build stays as-is.

### Resolved choices

| Question | Decision |
| --- | --- |
| Engine | Essentia.js (WASM) |
| Integration shape | **A** — Essentia primary, existing TS DSP kept as fallback |
| Ground truth fixtures | None — rely on Essentia's published accuracy + spot-check by ear |
| Analysis sample rate | **44100 Hz** (Essentia's profiles are tuned for it; was 11025) |
| Confidence | Use `strength`/`confidence` to mark low-confidence results `inconclusive` rather than writing a bad tag |
| Packaging risk | Keep TS fallback **and** verify WASM actually loads in a packaged DMG before done |

## Architecture

The transform already isolates analysis behind an injectable `AnalyzeDeps`
interface (`decode` / `estimateKey` / `estimateBpm` / `keyToCamelot` /
`writeTags`). We swap the implementations behind that seam — no rewrite of the
orchestration in `analyze-key-bpm.ts`.

```
analyze-key-bpm.ts (orchestration, unchanged shape)
        │  AnalyzeDeps
        ▼
  src/main/essentia.ts   ◄── NEW. Lazy WASM singleton + analyzeKey/analyzeBpm
        │  (on init failure)
        ▼
  src/shared/chroma.ts / tempo.ts  ◄── fallback estimators (kept)
```

### New module: `src/main/essentia.ts` (main-only)

WASM is a native-ish, main-process concern, so it lives in `src/main/`, not
`src/shared/`.

Responsibilities:

1. **Lazy singleton init.** Instantiate `new Essentia(EssentiaWASM)` once on
   first use and cache the promise. WASM boot (~hundreds of ms) is paid once per
   app session, not per track. Init failure is caught and surfaced as a flag so
   callers fall back.
2. **`analyzeKey(pcm, sr): { key: string; strength: number } | null`** —
   `arrayToVector(pcm)` → `KeyExtractor(vec, …, sampleRate)` → map
   `{key:'C', scale:'minor'}` to our `"Cm"` string format. Free the input
   vector. Profile: start with `profileType: 'edma'` (best general/EDM
   performer in Essentia's evaluation); revisit only if spot-checks disappoint.
3. **`analyzeBpm(pcm, sr, range): { bpm: number; confidence: number } | null`** —
   `RhythmExtractor2013` (multifeature method) → bpm + confidence, then
   octave-fold into `[minBpm, maxBpm]` via a shared helper.
4. **Memory hygiene.** Every `arrayToVector` result and every vector-typed
   output is `.delete()`d after use to avoid WASM heap leaks across a long
   batch of tracks.

### Shared helper: BPM octave-folding

The existing fold loop in `tempo.ts` (`while (bpm < min) bpm *= 2` …) is lifted
into a small, unit-tested `foldBpm(bpm, range)` util so both the Essentia path
and the TS fallback use the same range logic (per the project's
reusable-utility rule). Candidate home: `src/shared/tempo.ts` export, or a
dedicated `src/shared/bpm-fold.ts`.

### Key string + Camelot mapping

Essentia returns `key` ∈ {C, C#, …, B} and `scale` ∈ {major, minor}. We already
have `keyToCamelot`. We add a tiny mapper `essentiaKeyToString(key, scale)` →
`"C"` / `"Cm"` matching the format `keyToCamelot` and our tags expect. Note:
Essentia uses sharps; confirm `keyToCamelot` handles the same enharmonic
spelling (it already keys off the 12 sharp names used in `chroma.ts`).

### Confidence gating

- **Key:** `KeyExtractor.strength` is a 0–1 correlation. Below a threshold
  (start ~0.5, tune by spot-check) we treat the key as `inconclusive` and write
  no `TKEY`/`CAMELOT` — better a missing tag than a confidently wrong one.
- **BPM:** `RhythmExtractor2013.confidence` is ~0–5.32. Below a low floor
  (start ~1.5) we mark BPM `inconclusive`.
- Thresholds live as named constants in `essentia.ts` with a comment on their
  source range, so they're easy to retune.

### Wiring in `analyze-key-bpm.ts`

- `ANALYSIS_SR` → `44100`.
- Real `deps.estimateKey` / `deps.estimateBpm` become thin adapters that try
  Essentia first and fall back to the TS estimators if Essentia is unavailable.
  The adapters also carry confidence through so the transform's existing logging
  can report `key=Am (8A) strength=0.71` / `bpm=128 conf=3.2` and the
  `inconclusive` branch fires on low confidence.
- The injectable `AnalyzeDeps` seam and all existing unit tests stay valid.

## Data flow

1. ffmpeg decodes `workingFile` → mono f32 PCM @ 44.1 kHz (existing
   `decodePcm`, new SR).
2. PCM → Essentia vector → `KeyExtractor` + `RhythmExtractor2013`.
3. Map key→string, fold bpm into range, gate on confidence.
4. On any Essentia failure (init or per-call throw): same PCM → TS
   `estimateKey`/`estimateBpm`.
5. Write `TKEY` / `TBPM` / `TXXX:CAMELOT` via existing `writeAnalysisTags`
   (only the confident ones).

## Packaging

Essentia.js ships WASM. In a packaged Electron app the main process must be able
to load it.

- Add `essentia.js` as a dependency (pnpm).
- Ensure the WASM/glue is reachable from the packaged main bundle. With
  electron-vite, keep `essentia.js` **external** (not bundled/minified) and, if
  the WASM is shipped as a separate file rather than inlined, add it to
  `asarUnpack` so it loads from disk. The require-form `EssentiaWASM` in the npm
  package is the Emscripten module; confirm which shape this version ships.
- **Verification gate (required before done):** build the DMG (arm64 and x64),
  install, and confirm via the transform log that Essentia — not the fallback —
  produced the tags. The new module logs which engine ran so this is observable
  without a debugger.

## Testing

- **`essentia.ts`:** unit-test the pure mapping/gating logic (`key+scale →
  string`, confidence thresholds, fold) with the Essentia call injected/mocked —
  keep WASM out of unit tests. Follow the existing `AnalyzeDeps` injection
  pattern.
- **`foldBpm`:** dedicated `*.test.ts` (octave folding, boundary cases).
- **Fallback path:** a test that forces Essentia-unavailable and asserts the TS
  estimators run and tags are still written.
- **Existing tests:** `analyze-key-bpm.test.ts`, `chroma.test.ts`,
  `tempo.test.ts` remain (fallback is still live code).
- **Manual:** spot-check a handful of tracks of known genre/feel by ear; verify
  the packaged-DMG engine gate above.

## Out of scope / YAGNI

- No reconciliation/voting between engines (approach C rejected).
- No ground-truth fixture harness (no reference set available).
- No key-change/segment analysis — global key only, as today.
- No deletion of `chroma.ts`/`tempo.ts` — they remain as the fallback.

## Risks

| Risk | Mitigation |
| --- | --- |
| WASM fails to load in packaged DMG | TS fallback + explicit DMG verification gate |
| Essentia memory leaks over a batch | `.delete()` every vector; init once |
| Sharp/flat enharmonic mismatch with `keyToCamelot` | Confirm mapper against existing 12-name table; unit test |
| Confidence thresholds miscalibrated | Named constants, tuned by spot-check; default conservative |
| 44.1 kHz decode memory for long tracks | f32 mono ~10 MB/min; acceptable, no cap needed |
