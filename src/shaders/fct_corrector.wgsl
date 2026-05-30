fn minmod(a: vec4<f32>, b: vec4<f32>) -> vec4<f32> {
    let cond = a * b;
    return select(vec4<f32>(0.0), sign(a) * min(abs(a), abs(b)), cond > vec4<f32>(0.0));
}

fn sampleAdvectionCorrector(uv: vec2<f32>, prevUV: vec2<f32>, vel: vec2<f32>, fp: vec4<f32>, f_curr: vec4<f32>, aspect: vec2<f32>) -> vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(origStateTex, 0u));
    let texelSize = 1.0 / texSize;
    let dt = 0.00125;
    
    // CFL number calculation
    let cfl = (abs(vel.x) * texSize.x + abs(vel.y) * texSize.y) * dt;
    // Lower threshold for high-order schemes
    let blend = clamp((cfl - 0.5) / 0.3, 0.0, 1.0);
    let bilinear_val = textureSample(origStateTex, samp, prevUV);
    
    let c = f_curr;
    let c_w = textureSample(origStateTex, samp, uv - vec2<f32>(texelSize.x, 0.0));
    let c_ww = textureSample(origStateTex, samp, uv - vec2<f32>(2.0 * texelSize.x, 0.0));
    let c_e = textureSample(origStateTex, samp, uv + vec2<f32>(texelSize.x, 0.0));
    let c_ee = textureSample(origStateTex, samp, uv + vec2<f32>(2.0 * texelSize.x, 0.0));
    
    let c_n = textureSample(origStateTex, samp, uv - vec2<f32>(0.0, texelSize.y));
    let c_nn = textureSample(origStateTex, samp, uv - vec2<f32>(0.0, 2.0 * texelSize.y));
    let c_s = textureSample(origStateTex, samp, uv + vec2<f32>(0.0, texelSize.y));
    let c_ss = textureSample(origStateTex, samp, uv + vec2<f32>(0.0, 2.0 * texelSize.y));
    
    let vx = vel.x;
    let vy = vel.y;
    
    let cfl_x = vx * dt * texSize.x;
    let cfl_y = vy * dt * texSize.y;
    
    // East interface
    let ae_LW = 0.5 * vx * (1.0 - abs(cfl_x)) * (c_e - c);
    let ae_upstream = select(0.5 * vx * (1.0 - abs(cfl_x)) * (c_ee - c_e), 
                             0.5 * vx * (1.0 - abs(cfl_x)) * (c - c_w), 
                             vx >= 0.0);
    let ae_limited = minmod(ae_LW, ae_upstream);
    
    // West interface
    let aw_LW = 0.5 * vx * (1.0 - abs(cfl_x)) * (c - c_w);
    let aw_upstream = select(0.5 * vx * (1.0 - abs(cfl_x)) * (c_e - c), 
                             0.5 * vx * (1.0 - abs(cfl_x)) * (c_w - c_ww), 
                             vx >= 0.0);
    let aw_limited = minmod(aw_LW, aw_upstream);
    
    // South interface
    let as_LW = 0.5 * vy * (1.0 - abs(cfl_y)) * (c_s - c);
    let as_upstream = select(0.5 * vy * (1.0 - abs(cfl_y)) * (c_ss - c_s), 
                             0.5 * vy * (1.0 - abs(cfl_y)) * (c - c_n), 
                             vy >= 0.0);
    let as_limited = minmod(as_LW, as_upstream);
    
    // North interface
    let an_LW = 0.5 * vy * (1.0 - abs(cfl_y)) * (c - c_n);
    let an_upstream = select(0.5 * vy * (1.0 - abs(cfl_y)) * (c_s - c), 
                             0.5 * vy * (1.0 - abs(cfl_y)) * (c_n - c_nn), 
                             vy >= 0.0);
    let an_limited = minmod(an_LW, an_upstream);
    
    let c_low = fp;
    let limited_correction = -dt * ((ae_limited - aw_limited) * texSize.x + (as_limited - an_limited) * texSize.y);
    
    let fct_val = max(vec4<f32>(0.0), c_low + limited_correction);
    
    return mix(fct_val, bilinear_val, blend);
}
