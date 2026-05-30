# Project Status & Implementation Plan
**Date:** May 27, 2026
**Status:** Stable / Build Passing / Refactored

## Current Progress

### 1. Fixed Initial Video Orientation Bug
*   **Issue:** Video velocity fields (e.g., UK in DCSM) appeared upside down for the first few frames.
*   **Fix:** Centralized `flipv` logic. The vertical flip is now applied during `copyExternalImageToTexture` using the model's `flipv` setting.
*   **Refinement:** Updated `clearTextures` to reset `uvTex` to `rgba(0.5, 0.5, 0, 0)` (neutral velocity), preventing the diagonal flow burst during loading.

### 2. Implemented DELWAQ Numerical Schemes
*   **Scheme 1 (Upwind):** Mass-conservative explicit upwind finite-volume scheme.
*   **Scheme 5 (FCT):** High-order Flux-Corrected Transport using central differences with a non-linear limiter.
*   **Stability:** Implemented stability-aware blending. Shaders calculate the local Courant (CFL) number and blend to Semi-Lagrangian (bilinear) if the flow exceeds the stability limit (~0.8), preventing simulation "explosions."

### 3. Modular WebGPU Architecture
*   Refactored monolithic `useWebGPU.ts` into `src/composables/webgpu/`:
    *   `core.ts`: Device and context initialization.
    *   `textures.ts`: Resource management and fixed-orientation copy logic.
    *   `pipelines.ts`: Pipeline and bind group layout definitions.
    *   `schemes.ts`: JIT shader compilation for flexible solvers.
    *   `index.ts`: Orchestration facade.
*   Standardized naming convention for all schemes: `{predictor}-{corrector}`.

### 4. Version Control
*   Committed current state and tagged as `v0.1.0-pre-refactor`.

---

## Plan for Tomorrow

### Phase A: Sub-stepping & Buffer Logic
*   **Task:** Fix the `frame` index advancement in `webgpu/index.ts`.
*   **Goal:** Ensure that during the 4-step DELWAQ sub-stepping, the ping-pong buffers correctly alternate every sub-step so the simulation reads the absolute latest data.

### Phase B: Main UI Integration
*   **Task:** Add a "Numerical Scheme" selector to the `App.vue` sidebar.
*   **Goal:** Allow users to switch between standardized schemes (Bilinear, MacCormack, DELWAQ-FCT) directly on the main Leaflet map simulation.

### Phase C: Performance & Accuracy Tuning
*   **Task:** Refine the FCT limiter in `delwaq_scheme5.wgsl`.
*   **Goal:** Reduce "rippling" artifacts while maintaining the sharpness characteristic of high-order schemes.
*   **Task:** Optimize `updateUVTexture` to prevent unnecessary `createBindGroups()` calls if dimensions are unchanged.

### Phase D: Standalone Module Preparation
*   **Task:** Audit `webgpu/` modules for DOM dependencies.
*   **Goal:** Abstract any remaining canvas/video element specifics to move towards a standalone, headless velocity computation library (future npm package).
