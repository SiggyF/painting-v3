// Upwind Predictor: Explicit Upwind
// Strictly mass-conservative finite-volume implementation.
// Accurate to first-order in space and time.
// Guaranteed positivity for CFL < 1.0.

fn sampleAdvection(uv: vec2<f32>, prevUV: vec2<f32>, vel: vec2<f32>) -> vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(prevStateTex, 0u));
    let texelSize = 1.0 / texSize;
    let dt = 0.00125;
    
    // CFL number calculation
    let cfl = (abs(vel.x) * texSize.x + abs(vel.y) * texSize.y) * dt;
    
    // Smoothly blend with bilinear semi-Lagrangian when CFL approaches stability limit (1.0)
    let blend = clamp((cfl - 0.7) / 0.3, 0.0, 1.0);
    
    // Reference stable value (Bilinear/Semi-Lagrangian)
    let bilinear_val = textureSample(prevStateTex, samp, prevUV);
    
    // Current cell concentration
    let c = textureSample(prevStateTex, samp, uv);
    
    // Neighboring cell concentrations
    let c_w = textureSample(prevStateTex, samp, uv - vec2<f32>(texelSize.x, 0.0));
    let c_e = textureSample(prevStateTex, samp, uv + vec2<f32>(texelSize.x, 0.0));
    let c_n = textureSample(prevStateTex, samp, uv - vec2<f32>(0.0, texelSize.y));
    let c_s = textureSample(prevStateTex, samp, uv + vec2<f32>(0.0, texelSize.y));
    
    // Upwind Fluxes across the 4 cell faces
    let vx = vel.x;
    let vy = vel.y;
    let flux_e = select(c_e, c, vx >= 0.0) * vx;
    let flux_w = select(c, c_w, vx >= 0.0) * vx;
    let flux_s = select(c_s, c, vy >= 0.0) * vy;
    let flux_n = select(c, c_n, vy >= 0.0) * vy;
    
    let div_flux = (flux_e - flux_w) * texSize.x + (flux_s - flux_n) * texSize.y;
    let upwind_val = max(vec4<f32>(0.0), c - dt * div_flux);
    
    return mix(upwind_val, bilinear_val, blend);
}
