# TVD Limiter Corrector
A Total Variation Diminishing (TVD) corrector that applies a non-linear flux limiter (like Superbee or minmod) to the MacCormack corrector step, guaranteeing that no new unphysical extrema are created.

| Attribute | Classification |
| --- | --- |
| **Type** | TVD Predictor-Corrector |
| **Accuracy** | High-Order / Monotonic |
| **Diffusion** | Low-Medium |
| **Oscillations** | None (Monotonic) |
| **Cost** | Medium-High |

### Summary
Combines the sharpness of second-order MacCormack with the ripple-free stability of bilinear advection by limiting anti-diffusive corrections near sharp edges.
