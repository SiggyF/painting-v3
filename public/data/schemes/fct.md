# Flux-Corrected Transport (FCT) Corrector
A high-order correction step that uses central difference fluxes to correct the low-order upwind predictor, limited by a multidimensional Zalesak limiter to guarantee positivity and monotonicity.

| Attribute | Classification |
| --- | --- |
| **Type** | Finite-Volume FCT |
| **Accuracy** | Second-Order (Approx) |
| **Conservation** | Strictly Conservative |
| **Oscillations** | None (Monotonic) |
| **Diffusion** | Low |
| **Cost** | High (4 sub-steps, 2 passes) |

### Summary
Provides sharp, conservative concentration profiles without ripple artifacts. It is computationally heavy but ideal for transport simulations where preserving total mass is critical.
