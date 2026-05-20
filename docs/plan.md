# Layout & Architecture Plan: New Painting App

## Background & Motivation
The goal is to modernize an existing map-based visualization application ("painting-old") while integrating the high-performance visual aesthetics of a newer WebGPU-based fluid simulation ("painting-new"). The old app uses Vue 2, Leaflet, and a Vuetify-based sidebar for dense UI controls, overlaying flow fields (particles and advection) on a map. The new app provides an immersive, full-screen WebGPU canvas with modern Tailwind CSS "glass" UI panels. The new application will merge these concepts, maintaining the rich geographical data features while upgrading to a modern framework and an immersive visual layout.

## Scope & Impact
This plan covers the layout definition and architectural setup of the new Vue application. It involves:
- Establishing a new project scaffolding with Vue 3, Vite, and Tailwind CSS.
- Designing an immersive layout where the map and rendering layers occupy the full screen.
- Replacing the persistent Vuetify sidebar with floating "glassmorphism" panels for tools, charts, and models.
- Setting up the architectural pattern to overlay a custom WebGPU context on top of a Leaflet base map to render legacy flow fields and particles with modern performance.

## Proposed Solution
**1. Layout: Immersive Canvas with Floating Glass UI**
- **Base Layer:** A full-screen Leaflet map component (`vue-leaflet` or vanilla Leaflet integrated into Vue 3).
- **Visualization Overlay:** A full-screen WebGPU canvas layered securely over the map. This canvas will handle the rendering of advection flow fields, particles, and the "Pigment Flow" subtractive mixing logic from the new concept.
- **UI Overlay:** A series of floating panels (`z-index` over the canvas) styled with Tailwind CSS (`backdrop-blur`, semi-transparent backgrounds).
  - *Main Control Panel (Top Right):* Collapsible model selection, color palettes, and global settings.
  - *Timeseries / Details Panel (Bottom Right or Bottom Center):* Expanding glass panel for charts and real-time data.
  - *Wind Rose / Story Mode (Left):* Modular floating widgets for specific data features.

**2. Tech Stack: Vue 3 + Vite + Leaflet + WebGPU Overlay**
- **Framework:** Vue 3 (Composition API) built with Vite for optimal developer experience.
- **Styling:** Tailwind CSS.
- **Mapping:** Leaflet.
- **Rendering:** WebGPU (via custom shaders, similar to `painting-new`) synchronized with Leaflet map movements (pan/zoom).

## Alternatives Considered
- **MapLibre GL JS Integration:** We considered migrating away from Leaflet to MapLibre GL for tighter WebGL integration, but decided against it to maximize backward compatibility with existing Leaflet tile layers and logic from `painting-old`.
- **Traditional Sidebar Layout:** A standard sidebar was considered but discarded in favor of the floating "glass" UI to achieve the desired "conservative concept of new" (an immersive, app-like visual experience).

## Implementation Plan
**Phase 1: Project Scaffolding & Base UI**
- Initialize a new Vite + Vue 3 project (`painting-app-v3`).
- Install Tailwind CSS and configure basic styles (glassmorphism utilities).
- Implement the core layout structure: Full-screen container, Top-level floating header/controls, and floating widget areas.

**Phase 2: Map & Canvas Integration**
- Integrate Leaflet as the absolute background layer.
- Create a transparent, full-screen `<canvas>` overlay synchronized with Leaflet's coordinate system (translating lat/lng to screen space for the WebGPU layer).

**Phase 3: WebGPU Setup**
- Port the WebGPU initialization and shader pipeline from `painting-new` into a composable Vue utility.
- Hook up basic interaction (mouse dragging to create pigment/flow) over the map.

**Phase 4: Feature Migration (Mockup)**
- Create placeholder Vue components for the old features (Models Overview, Timeseries Charts, Wind Rose, Color Selection) within the new floating glass panels.

## Verification
- Ensure the Vite dev server runs without errors.
- Verify the Leaflet map is interactive beneath the WebGPU canvas (using CSS `pointer-events: none` on the canvas dynamically, or handling event delegation).
- Confirm the UI panels float correctly, apply blur effects, and adapt to screen resizing.

## Migration & Rollback
- The new project will be developed in a separate repository or directory (e.g., `painting-v3`) ensuring the existing `painting-old` and `painting-new` codebases remain unaffected during development.