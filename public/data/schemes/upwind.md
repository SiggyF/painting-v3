# First-Order Upwind Predictor
A strictly mass-conservative, first-order explicit upwind finite-volume advection predictor. It computes mass transport fluxes across cell boundaries.

| Attribute | Classification |
| --- | --- |
| **Type** | Finite-Volume |
| **Accuracy** | First-Order |
| **Conservation** | Strictly Conservative |
| **Stability** | Conditionally Stable (CFL < 1.0) |
| **Diffusion** | Very High |
| **Oscillations** | None (Monotonic) |
| **Cost** | Low (4 sub-steps) |

### Summary
Guarantees absolute mass conservation and positivity, but suffers from severe numerical diffusion, causing concentration fields to spread and blur rapidly.
