# MacCormack Corrector
A second-order predictor-corrector method that runs a backward advection step from the predictor state to estimate and subtract the first-order truncation error (anti-diffusive correction).

| Attribute | Classification |
| --- | --- |
| **Type** | Predictor-Corrector |
| **Accuracy** | Second-Order |
| **Diffusion** | Low |
| **Oscillations** | High (can cause overshoot/undershoot "wiggles" or negative concentration near sharp gradients) |
| **Cost** | Medium |

### Summary
Produces much sharper results by estimating advective error, but can introduce ringing artifacts or negative concentrations near steep gradients.
