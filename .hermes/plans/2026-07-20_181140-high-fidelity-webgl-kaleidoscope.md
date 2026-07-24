# High-Fidelity WebGL2 Cosmic Kaleidoscope — Implementation Plan

> Use subagent-driven-development to execute this plan task by task.

**Goal:** Přidat do Audio Visualizer Studio jeden vizuálně výrazný audio-reactive WebGL2 modul ve stylu neonové kosmické mandaly, aniž by se rozbily současné 2D scény, audio kontrakt nebo browser/runtime error handling.

**Architecture:** Současný `CanvasRuntime` a `SceneModule` kontrakt jsou čistě 2D (`CanvasRenderingContext2D`). Nejprve se proto přidá typovaná render-backend hranice, která zachová existující Canvas2D moduly a umožní samostatný WebGL2 lifecycle. Nový modul bude vlastní WebGL2 scéna s fullscreen quad/triangle a fragment shaderem; React bude pouze poskytovat stabilní `AudioFrame`, settings, palette, seed a lifecycle signály.

**Tech Stack:** React + TypeScript + Vite, existing Canvas2D module registry, native WebGL2 API, GLSL ES 3.00 fragment/vertex shaders, Vitest, TypeScript typecheck, production build, real Chromium browser smoke.

## Context and assumptions

- Repository: `/home/jolanda/Projekty/audio-visualizer-studio`.
- Taiga project: `Audio Visualizer Studio`, project ID `19`.
- Parent Epic: `#1` / internal ID `36`, `Interactive Audio Visualizer MVP`, status `New`.
- Existing renderer foundation: Story `#52` / internal ID `1132`, `Visualizer module contract and extensibility foundation`, status `Ready`.
- Existing adjacent Stories: Story `#7` / internal ID `1125`, `Four audio-reactive visual scenes`; Story `#10` / internal ID `1128`, `Integrated browser verification of MVP flow`.
- Current runtime uses `canvas.getContext('2d')`; current module types expose `CanvasRenderingContext2D` in `ModuleUpdateInput`, `ModuleCreateContext` and `SceneModule.render`.
- Current `AudioFrame` already provides `frequencyBins`, `waveform`, `bassEnergy`, `midEnergy`, `trebleEnergy`, `volume` and `beatPulse`.
- Current `SceneSettings` already provides `energy`, `sensitivity`, `motion`, `density`, `glow` and `background`.
- No `AGENTS.md` or `CLAUDE.md` was found in the repository during planning.
- No WebGL/Pixi/Three.js usage was found under `src/`; this plan uses the native WebGL2 API to avoid adding a rendering dependency for a single shader-based scene.
- Scope is a new high-fidelity scene and the backend boundary needed to host it. It is not server-side video export, marketplace/plugin downloading, billing, cloud persistence, or remote unsigned JavaScript.
- WebGL2 is a runtime prerequisite. Unsupported WebGL2 must produce an explicit user-visible runtime error; no silent substitution with stale, empty or lower-fidelity content is allowed.

## Planned Taiga hierarchy

- **Epic #1 — Interactive Audio Visualizer MVP**
  - **New Story: High-fidelity WebGL2 cosmic kaleidoscope scene**
    1. Define compatible Canvas2D/WebGL2 renderer contract.
    2. Implement WebGL2 runtime and GPU resource lifecycle.
    3. Implement the audio-reactive cosmic kaleidoscope shader module.
    4. Register the scene and connect settings, palettes, quality and reduced-motion behavior.
    5. Verify integration in automated tests, build and a real browser.

Tasks remain in the project's real initial `New` status until implementation evidence exists. No Task is moved to `In progress` as part of planning; execution must start with the contract task after dependency/status review.

## Tasks

### Task 1: Define a compatible Canvas2D/WebGL2 renderer contract

**Objective:** Extend the module/runtime types without breaking existing Canvas2D scenes, so a scene can explicitly declare and consume a render backend while retaining stable read-only audio/settings inputs.

**Files:**
- Modify: `src/types.ts`
- Modify: `src/visualizer/moduleContract.ts`
- Modify or split: `src/visualizer/CanvasRuntime.ts`
- Tests: `src/visualizer/moduleContract.test.ts`, `src/visualizer/CanvasRuntime.test.ts`

**Steps:**
1. Write focused failing tests for backend selection, explicit WebGL2 capability declaration, and preservation of the existing Canvas2D module contract.
2. Introduce the smallest additive type boundary, for example a backend/capability discriminator and a backend-specific lifecycle context; do not weaken the existing read-only `AudioFrame` or expose `AnalyserNode`, React state, credentials, filesystem or network access.
3. Define how a scene requests WebGL2 and how the runtime reports an unavailable backend.
4. Keep API versioning/migration explicit; do not silently reinterpret API version `1` for existing modules.
5. Run focused contract/runtime tests, then typecheck.

**Acceptance criteria:**
- Existing Canvas2D scene modules remain type-safe and behaviorally compatible.
- A WebGL2 module can be represented without casting its context to `CanvasRenderingContext2D`.
- Backend mismatch is an explicit error path.
- Resize includes logical dimensions and device-pixel ratio; lifecycle still covers quality, reduced motion and destroy.

**Dependency:** Existing renderer foundation Story #52 must remain the authoritative contract boundary; no shader work starts before this task is reviewed.

### Task 2: Implement WebGL2 runtime and GPU resource lifecycle

**Objective:** Add a dedicated WebGL2 runtime path with deterministic initialization, shader compile/link diagnostics, resize handling, frame scheduling, quality/reduced-motion inputs and complete cleanup.

**Files:**
- Create or modify: `src/visualizer/WebGLRuntime.ts`
- Modify: `src/visualizer/CanvasRuntime.ts` or the new backend dispatcher from Task 1
- Tests: `src/visualizer/WebGLRuntime.test.ts`
- Optional focused helper: `src/visualizer/webglResources.ts`

**Steps:**
1. Build a mocked WebGL2 context harness that records shader/program/buffer creation, resize, draw and delete calls.
2. Implement context acquisition with an explicit `webgl2` check.
3. Compile/link shaders with actionable errors containing the failing stage, but never source secrets or dump unbounded shader/runtime data into the UI.
4. Allocate GPU resources once per module/runtime, not inside the frame loop.
5. Apply DPR-capped viewport sizing and preserve logical width/height for uniforms.
6. Implement destroy/context-loss cleanup and stop scheduling frames after failure.
7. Run focused tests and inspect executed-test counts.

**Acceptance criteria:**
- WebGL2 unavailable, shader compile failure, link failure and context loss are distinct explicit failures.
- Resize and DPR updates change the viewport/canvas size correctly.
- `destroy()` deletes owned resources and cancels the RAF path; repeated destroy is safe.
- Quality and reduced-motion values are available to the shader/module without React-driven frame loops.

**Dependency:** Task 1.

### Task 3: Implement the audio-reactive cosmic kaleidoscope shader module

**Objective:** Create the reference high-fidelity scene: deep space background, polar/radial repetition, neon rings/filaments, chromatic glow and audio-driven deformation.

**Files:**
- Create: `src/visualizer/scenes/cosmicKaleidoscope.ts`
- Create: `src/visualizer/shaders/cosmicKaleidoscope.vert.glsl` or a typed shader source module
- Create: `src/visualizer/shaders/cosmicKaleidoscope.frag.glsl` or a typed shader source module
- Tests: `src/visualizer/scenes/cosmicKaleidoscope.test.ts`

**Steps:**
1. Define a pure uniform-mapping function and write RED tests for boundary audio/settings values.
2. Implement a fullscreen primitive with normalized coordinates and deterministic seed input.
3. Implement GLSL ES 3.00 polar coordinates, sector folding/repetition, radial layers, stable procedural detail/noise and palette-driven color mixing.
4. Map `bassEnergy` to core/radial scale and pulse, `midEnergy` to structural deformation, `trebleEnergy`/frequency bins to fine details, `beatPulse` to transient bloom, and settings to motion/density/glow/background.
5. Ensure bounded loops and quality-dependent sample/detail counts; avoid per-frame allocations and unbounded shader work.
6. Keep reduced motion deterministic: freeze or strongly damp time-based movement while preserving a readable non-animated frame.
7. Run shader/uniform pure tests and the WebGL harness from Task 2.

**Acceptance criteria:**
- Scene output is deterministic for the same seed, dimensions, settings and audio frame.
- All audio mappings have clamped/bounded behavior at silence and peak values.
- The shader contains no external texture/network dependency and no data-dependent unbounded loop.
- High/balanced/low quality modes have an intentional cost/fidelity difference.
- Reduced motion removes or dampens continuous animation without blanking the scene.

**Dependency:** Task 2.

### Task 4: Register the scene and connect product controls

**Objective:** Make the new module selectable in the existing scene catalog and ensure current settings, palettes, scene persistence and format profiles work with it.

**Files:**
- Modify: `src/visualizer/sceneModules.ts` and/or registry source
- Modify: `src/types.ts` for the new `SceneId`/manifest entry if needed
- Modify: `src/App.tsx` and/or scene selector components
- Modify: `src/styles.css` only where the scene card/control needs a coherent UI entry
- Tests: relevant registry/catalog/App tests

**Steps:**
1. Add the scene manifest, stable ID, description, tags, entitlement and settings schema through the existing registry path.
2. Add the scene to the existing UI catalog without removing or renaming current scenes.
3. Connect palette changes, generic settings, seed changes, profile resize and persisted project state.
4. Preserve accessibility labels and keyboard operation of the selector/controls.
5. Verify scene switching destroys the previous backend/module before creating the next one.
6. Run focused UI/registry tests, typecheck and production build.

**Acceptance criteria:**
- User can select the new scene from the existing UI.
- Existing four scenes still select/render through their current path.
- Settings/palette/seed/profile changes reach the module and persist according to the current project-state contract.
- No React-driven frame loop or silent fallback is introduced.

**Dependencies:** Tasks 1–3; adjacent settings/palette Story #8 and renderer Story #52 are context dependencies, not reasons to duplicate their scope.

### Task 5: Run integrated browser verification and close the evidence boundary

**Objective:** Exercise the real application path and document what is proven by automation versus what remains open for manual/device review.

**Files:**
- Tests/fixtures: existing browser test location discovered from Story #10 / repository scripts
- Documentation/evidence: only if the repository has a canonical verification note; otherwise Taiga comment is sufficient
- No production source changes unless a verification defect is found and split into a new Task

**Steps:**
1. Inspect the package scripts and use the repository's canonical test, typecheck and build commands.
2. Start the real browser preview using the project-supported command.
3. Load a representative local MP3, start playback, select Cosmic Kaleidoscope, change at least one setting and palette, change profile/aspect ratio, and observe resize.
4. Check browser console for uncaught errors, shader compilation errors, repeated resource creation and runtime leaks.
5. Verify reduced-motion behavior using the browser preference or runtime control where available.
6. Record executed test counts, command exit codes, browser dimensions, limitations and any physical-device/manual gates separately.

**Acceptance criteria:**
- Automated focused tests, typecheck and production build pass with real executed counts.
- Real Chromium browser reaches MP3 → play → audio frame → WebGL2 scene → settings/palette → resize without uncaught console errors.
- WebGL2 unsupported/error state is visible and truthful.
- Remaining physical-device, long-session performance and final visual acceptance gates are explicitly `OPEN` unless actually exercised.

**Dependencies:** Tasks 1–4; browser verification Story #10 is the evidence stream.

## Verification

- Focused contract and lifecycle tests for backend selection, shader/program failures, resize, cleanup, context loss and repeated destroy.
- Pure uniform-mapping tests for silence, nominal audio, peak audio, seed determinism, quality and reduced motion.
- Existing visualizer module/registry tests remain green.
- Project TypeScript typecheck.
- Project production build.
- Real Chromium smoke with a representative local MP3 and the exact user path.
- Browser console inspection and a short lifecycle/resource sanity check.
- `git diff --check` and final worktree inspection after implementation; this planning task itself must not modify source files.

## Risks, trade-offs, and open questions

- **WebGL2 compatibility:** Some browsers/devices may not expose WebGL2 or may expose unstable drivers. Decision: fail explicitly with a visible runtime error rather than silently downgrade.
- **Contract migration:** The existing module contract is 2D-only. Additive backend types are safer than rewriting all existing modules at once; keep Canvas2D compatibility as a first-class path.
- **Shader portability:** GLSL precision, loop limits and derivative support vary. Keep GLSL ES 3.00 simple, bounded and testable through the real browser, not only mocks.
- **Performance:** A visually rich shader can starve playback/UI. Quality modes must materially reduce detail/sample count, and per-frame CPU/GPU allocations are forbidden.
- **Visual fidelity:** Automated tests can prove mapping/lifecycle, not artistic quality. Human visual review remains a separate OPEN gate until performed.
- **Export boundary:** This plan targets live browser preview only. Deterministic video export is not included and must be a separate Story/Task under the export Epic.
- **Dependency ordering:** The new Story should remain `Ready`/open during planning; only the first implementation Task may later move to `In progress` after its dependency review. Do not close the Story when only shader code is green; browser and visual acceptance remain required.

## Taiga evidence template for execution

For each implementation Task, append one concise comment after verification:

- `PASS` — exact command, exit code, executed-test count, relevant paths and observed result.
- `PARTIAL` — what passed and what remains unverified.
- `OPEN` — exact missing browser/device/runtime prerequisite or blocker.
- Include the Taiga internal ID, displayed ref, resulting version and post-write GET confirmation in the execution log.
