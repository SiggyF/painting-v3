fn sampleAdvection(uv: vec2<f32>, prevUV: vec2<f32>, vel: vec2<f32>) -> vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(prevStateTex, 0u));
    let texelSize = 1.0 / texSize;
    
    let vel_uv = vel * vec2<f32>(1.0 / params.aspectRatio, 1.0);
    let dt = 0.00125;
    
    // CFL number calculation
    let cfl = (abs(vel_uv.x) * texSize.x + abs(vel_uv.y) * texSize.y) * dt;
    
    // Smoothly blend with bilinear advection when CFL approaches stability limit (1.0)
    let blend = clamp((cfl - 0.75) / 0.2, 0.0, 1.0);
    
    // Always sample unconditionally to maintain uniform control flow for textureSample
    let bilinear_val = textureSample(prevStateTex, samp, prevUV);
    
    let c = textureSample(prevStateTex, samp, uv);
    let c_left = textureSample(prevStateTex, samp, clamp(uv - vec2<f32>(texelSize.x, 0.0), vec2<f32>(0.0), vec2<f32>(1.0)));
    let c_right = textureSample(prevStateTex, samp, clamp(uv + vec2<f32>(texelSize.x, 0.0), vec2<f32>(0.0), vec2<f32>(1.0)));
    let c_down = textureSample(prevStateTex, samp, clamp(uv - vec2<f32>(0.0, texelSize.y), vec2<f32>(0.0), vec2<f32>(1.0)));
    let c_up = textureSample(prevStateTex, samp, clamp(uv + vec2<f32>(0.0, texelSize.y), vec2<f32>(0.0), vec2<f32>(1.0)));
    
    // Compute Roe fluxes / upwind differences
    let diff_x = 0.5 * vel_uv.x * (c_right - c_left) - 0.5 * abs(vel_uv.x) * (c_right - 2.0 * c + c_left);
    let diff_y = 0.5 * vel_uv.y * (c_up - c_down) - 0.5 * abs(vel_uv.y) * (c_up - 2.0 * c + c_down);
    
    let roe_val = c - dt * (diff_x * texSize.x + diff_y * texSize.y);
    
    return mix(roe_val, bilinear_val, blend);
}
