# Bilinear Interpolation Predictor
A first-order advection predictor that traces flow trajectories backward in time and samples the state using standard bilinear interpolation.

| Attribute | Classification |
| --- | --- |
| **Type** | Semi-Lagrangian |
| **Accuracy** | First-Order |
| **Stability** | Unconditionally Stable |
| **Numerical Diffusion** | High |
| **Oscillations** | None (Monotonic) |
| **Cost** | Very Low |

### Summary
Extremely fast and stable under any flow velocity, but suffers from high numerical diffusion (blurs details quickly).
