# Roe Upwind Predictor
A strictly mass-conservative, first-order finite-volume predictor based on Roe's approximate Riemann solver for resolving flux differences at cell interfaces.

| Attribute | Classification |
| --- | --- |
| **Type** | Finite-Volume |
| **Accuracy** | First-Order |
| **Conservation** | Strictly Conservative |
| **Stability** | Conditionally Stable (CFL < 1.0) |
| **Diffusion** | High |
| **Oscillations** | None |
| **Cost** | Low (4 sub-steps) |

### Summary
Computes numerical fluxes by resolving localized Riemann problems at cell interfaces. Strictly conservative and stable under CFL bounds, but blurs fine-scale details.
