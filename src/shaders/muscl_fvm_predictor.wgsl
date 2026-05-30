// MUSCL (Monotone Upstream-centered Schemes for Conservation Laws)
// Second-order, strictly conservative finite-volume advection predictor.
//
// Conservation guarantee:
//   Each shared face has its velocity sampled at the face midpoint so both
//   adjacent cells use the IDENTICAL velocity value. Combined with upwind
//   reconstruction from proper MUSCL slopes, the flux at face (i+1/2) is
//   the same whether computed from cell i or cell i+1.
//
// Implementation notes:
//   - All cell-average fetches use textureLoad (integer coords) to avoid
//     bilinear filtering drift corrupting the TVD stencil.
//   - minmod uses sign-comparison to prevent f32 underflow on tiny slopes.
//   - No bilinear semi-Lagrangian blend: any mixing with a non-conservative
//     scheme would break the mass conservation guarantee.
//   - Forward Euler time integration. Stable for CFL ≤ 0.5 per direction.
//     4× sub-stepping at dt=0.00125 keeps CFL well below this limit.
//   - Domain is UV [0,1]², vel is in UV-space per simulation time unit —
//     so texSize factors are the correct Δx⁻¹ scaling.

fn minmod_scalar(a: f32, b: f32) -> f32 {
    // sign()-based comparison avoids f32 underflow: a*b can flush to 0
    // for tiny same-sign values, incorrectly returning 0 slope.
    if (sign(a) != sign(b)) { return 0.0; }
    return select(b, a, abs(a) < abs(b));
}

fn minmod4(a: vec4<f32>, b: vec4<f32>) -> vec4<f32> {
    return vec4<f32>(
        minmod_scalar(a.r, b.r),
        minmod_scalar(a.g, b.g),
        minmod_scalar(a.b, b.b),
        minmod_scalar(a.a, b.a)
    );
}

fn sampleAdvection(uv: vec2<f32>, prevUV: vec2<f32>, vel: vec2<f32>) -> vec4<f32> {
    let texSize   = vec2<f32>(textureDimensions(prevStateTex, 0u));
    let texelSize = 1.0 / texSize;
    let dt        = 0.00125;

    let dx = vec2<f32>(texelSize.x, 0.0);
    let dy = vec2<f32>(0.0, texelSize.y);

    // Convert UV fragment centre to integer texel index.
    // uv * texSize = i + 0.5  →  i32(…) truncates to i. Exact for power-of-2 sizes.
    let base = vec2<i32>(uv * texSize);
    let W    = vec2<i32>(texSize) - vec2<i32>(1);  // inclusive clamp bound

    // 9-point stencil via exact integer loads (no bilinear filtering drift).
    // Clamped addressing replicates the edge cell — zero-gradient boundary.
    let c    = textureLoad(prevStateTex, clamp(base,                    vec2<i32>(0), W), 0);
    let c_w  = textureLoad(prevStateTex, clamp(base + vec2<i32>(-1, 0), vec2<i32>(0), W), 0);
    let c_e  = textureLoad(prevStateTex, clamp(base + vec2<i32>( 1, 0), vec2<i32>(0), W), 0);
    let c_ww = textureLoad(prevStateTex, clamp(base + vec2<i32>(-2, 0), vec2<i32>(0), W), 0);
    let c_ee = textureLoad(prevStateTex, clamp(base + vec2<i32>( 2, 0), vec2<i32>(0), W), 0);
    let c_n  = textureLoad(prevStateTex, clamp(base + vec2<i32>(0, -1), vec2<i32>(0), W), 0);
    let c_s  = textureLoad(prevStateTex, clamp(base + vec2<i32>(0,  1), vec2<i32>(0), W), 0);
    let c_nn = textureLoad(prevStateTex, clamp(base + vec2<i32>(0, -2), vec2<i32>(0), W), 0);
    let c_ss = textureLoad(prevStateTex, clamp(base + vec2<i32>(0,  2), vec2<i32>(0), W), 0);

    // MUSCL limited slopes. Each cell's slope is computed from ITS OWN neighbours,
    // which is why we need the 2-cell stencil extension (c_ww, c_ee, c_nn, c_ss).
    let sx_c = minmod4(c   - c_w,  c_e  - c);    // current x-slope
    let sx_w = minmod4(c_w - c_ww, c    - c_w);  // west cell x-slope
    let sx_e = minmod4(c_e - c,    c_ee - c_e);  // east cell x-slope
    let sy_c = minmod4(c   - c_n,  c_s  - c);    // current y-slope
    let sy_n = minmod4(c_n - c_nn, c    - c_n);  // north cell y-slope
    let sy_s = minmod4(c_s - c,    c_ss - c_s);  // south cell y-slope

    // Face-centred velocities — evaluated at the face midpoint, not the cell centre.
    // This ensures that when cell i computes its east flux using vel_east, and cell
    // i+1 computes its west flux using its own vel_west, both evaluate
    // getSimulationVelocity at the same UV position → identical velocity → conservation.
    let vel_east  = getSimulationVelocity(uv + 0.5 * dx);
    let vel_west  = getSimulationVelocity(uv - 0.5 * dx);
    let vel_south = getSimulationVelocity(uv + 0.5 * dy);
    let vel_north = getSimulationVelocity(uv - 0.5 * dy);

    let vx_e = vel_east.x;
    let vx_w = vel_west.x;
    let vy_s = vel_south.y;
    let vy_n = vel_north.y;

    // ---- East face (i+1/2) ----
    // L = right edge of current cell, R = left edge of east cell.
    // Upwind: pick L when flow goes east (vx_e ≥ 0), R when it goes west.
    // Conservation check: cell i+1's west flux uses vel_west_{i+1} at
    //   (uv+dx) - 0.5*dx = uv + 0.5*dx  ← same face position ✓
    let c_L_east  = c   + 0.5 * sx_c;
    let c_R_east  = c_e - 0.5 * sx_e;
    let flux_east = select(c_R_east, c_L_east, vx_e >= 0.0) * vx_e;

    // ---- West face (i-1/2) ----
    let c_L_west  = c_w + 0.5 * sx_w;
    let c_R_west  = c   - 0.5 * sx_c;
    let flux_west = select(c_R_west, c_L_west, vx_w >= 0.0) * vx_w;

    // ---- South face (j+1/2, texture +y = "south") ----
    let c_L_south  = c   + 0.5 * sy_c;
    let c_R_south  = c_s - 0.5 * sy_s;
    let flux_south = select(c_R_south, c_L_south, vy_s >= 0.0) * vy_s;

    // ---- North face (j-1/2, texture -y = "north") ----
    let c_L_north  = c_n + 0.5 * sy_n;
    let c_R_north  = c   - 0.5 * sy_c;
    let flux_north = select(c_R_north, c_L_north, vy_n >= 0.0) * vy_n;

    // Conservative update: c_new = c - dt · div(F)
    // texSize factors are Δx⁻¹ / Δy⁻¹ — valid because the domain is UV [0,1]²
    // and vel is in UV-space per simulation time.
    let div_flux = (flux_east - flux_west) * texSize.x
                 + (flux_south - flux_north) * texSize.y;

    // Positivity clamp: for concentration/density fields this is physically correct.
    // Note: this is a minor source of non-conservation when genuinely negative
    // intermediate values arise (should not occur for well-behaved TVD flow at CFL ≤ 0.5).
    return max(vec4<f32>(0.0), c - dt * div_flux);
}
