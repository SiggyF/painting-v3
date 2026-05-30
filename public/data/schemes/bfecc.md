# BFECC Corrector
Back and Forth Error Compensation and Correction (BFECC) is a technique that advects forward, then backward, computes the error between the start and final state, and applies this error to correct the initial advection.

| Attribute | Classification |
| --- | --- |
| **Type** | Multi-Pass Error Compensated |
| **Accuracy** | Second-Order |
| **Diffusion** | Low |
| **Oscillations** | Moderate |
| **Cost** | High |

### Summary
Improves advection accuracy by reversing the advection flow temporarily to measure and cancel numerical diffusion, leading to detailed filament structures.
