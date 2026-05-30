# MUSCL Finite Volume Predictor
A second-order, strictly mass-conservative finite-volume predictor using MUSCL (Monotone Upstream-centered Schemes for Conservation Laws) reconstruction with a minmod slope limiter and a Hancock half-step predictor for second-order temporal accuracy.

| Attribute | Classification |
| --- | --- |
| **Type** | Finite-Volume (Godunov-type, MUSCL-Hancock) |
| **Accuracy** | Second-Order |
| **Conservation** | Strictly Conservative |
| **Stability** | Conditionally Stable (CFL ≤ 0.5, sub-stepped) |
| **Diffusion** | Low |
| **Oscillations** | None (TVD by construction) |
| **Cost** | Medium (4 sub-steps) |

### Summary
Reconstructs piecewise-linear concentration profiles within each grid cell using the minmod slope limiter, preventing spurious oscillations near sharp gradients (TVD property). A half-step Hancock predictor provides second-order temporal accuracy before the Godunov upwind fluxes are computed at cell interfaces. The result is a strictly conservative, oscillation-free scheme that is considerably less diffusive than first-order upwind, making it well-suited for transport of sharp concentration fronts.
