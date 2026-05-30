fn sampleAdvectionCorrector(uv: vec2<f32>, prevUV: vec2<f32>, vel: vec2<f32>, fp: vec4<f32>, f_curr: vec4<f32>, aspect: vec2<f32>) -> vec4<f32> {
    let dt = 0.005;
    let velocityScale = 1.0 - params.viscosity * 0.85;

    let k1_fwd = vel;
    let p1_fwd = uv + 0.5 * dt * k1_fwd * aspect;
    let k2_fwd = getVelocity(p1_fwd, params.time, params) * velocityScale;
    let p2_fwd = uv + 0.5 * dt * k2_fwd * aspect;
    let k3_fwd = getVelocity(p2_fwd, params.time, params) * velocityScale;
    let p3_fwd = uv + dt * k3_fwd * aspect;
    let k4_fwd = getVelocity(p3_fwd, params.time, params) * velocityScale;
    let rk4_fwd_vel = (k1_fwd + 2.0 * k2_fwd + 2.0 * k3_fwd + k4_fwd) / 6.0;
    let forwardUV = uv + dt * rk4_fwd_vel * aspect;
    let fc = textureSample(prevStateTex, samp, forwardUV);
    
    let p1_bk = uv - 0.5 * dt * vel * aspect;
    let k2_bk = getVelocity(p1_bk, params.time, params) * velocityScale;
    let p2_bk = uv - 0.5 * dt * k2_bk * aspect;
    let k3_bk = getVelocity(p2_bk, params.time, params) * velocityScale;
    let p3_bk = uv - dt * k3_bk * aspect;
    let k4_bk = getVelocity(p3_bk, params.time, params) * velocityScale;
    let rk4_bk_vel = (vel + 2.0 * k2_bk + 2.0 * k3_bk + k4_bk) / 6.0;
    let rk4_prevUV = uv - dt * rk4_bk_vel * aspect;
    
    // Clamp to local bounds around rk4_prevUV (bilinear neighborhood)
    let texSize = vec2<f32>(textureDimensions(origStateTex, 0u));
    let sizeI = vec2<i32>(texSize);
    let tc = rk4_prevUV * texSize - 0.5;
    let tc_floor = clamp(vec2<i32>(floor(tc)), vec2<i32>(0), sizeI - vec2<i32>(2));
    
    let c0 = textureLoad(origStateTex, tc_floor, 0);
    let c1 = textureLoad(origStateTex, tc_floor + vec2<i32>(1, 0), 0);
    let c2 = textureLoad(origStateTex, tc_floor + vec2<i32>(0, 1), 0);
    let c3 = textureLoad(origStateTex, tc_floor + vec2<i32>(1, 1), 0);
    
    let minVal = min(c0, min(c1, min(c2, c3)));
    let maxVal = max(c0, max(c1, max(c2, c3)));
    
    let f_final = fp + 0.5 * (f_curr - fc);
    return clamp(f_final, minVal, maxVal);
}
