# Bicubic Interpolation Predictor
A higher-order semi-Lagrangian predictor that uses a 4x4 grid of surrounding texels for bicubic spline interpolation of the advected state.

| Attribute | Classification |
| --- | --- |
| **Type** | Semi-Lagrangian |
| **Accuracy** | Third-Order (Space) |
| **Stability** | Unconditionally Stable |
| **Diffusion** | Low |
| **Oscillations** | Moderate (at sharp gradients) |
| **Cost** | Medium |

### Summary
Offers sharp features and runs stably at high velocities, but can create mild overshoot/undershoot artifacts at steep gradients.
