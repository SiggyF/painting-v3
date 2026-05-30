# Semi-Lagrangian Predictor
A standard advection predictor that traces flow trajectories backward in time over one timestep to find the source location, then interpolates the concentration.

| Attribute | Classification |
| --- | --- |
| **Type** | Semi-Lagrangian |
| **Accuracy** | First-Order |
| **Stability** | Unconditionally Stable |
| **Numerical Diffusion** | High |
| **Oscillations** | None (Monotonic) |
| **Cost** | Low |

### Summary
Serves as the baseline method for particle/concentration tracking in grid-based fluid simulations.
