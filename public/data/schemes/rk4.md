# Runge-Kutta 4 (RK4) Predictor
A higher-order trajectory predictor that uses a 4th-order Runge-Kutta integration method to trace the backward path of particles in the velocity field.

| Attribute | Classification |
| --- | --- |
| **Type** | Semi-Lagrangian (Trajectory) |
| **Accuracy** | 4th-Order (Time) / 1st-Order (Space) |
| **Stability** | Unconditionally Stable |
| **Numerical Diffusion** | High (Without Corrector) |
| **Oscillations** | None (Monotonic) |
| **Cost** | Medium |

### Summary
Significantly reduces trajectory tracking errors in highly curved or rotating flows compared to standard single-step first-order Euler tracking.
