fn sampleAdvection(uv: vec2<f32>, prevUV: vec2<f32>, vel: vec2<f32>) -> vec4<f32> {
    let dt = 0.005;
    let aspect = vec2<f32>(1.0 / params.aspectRatio, 1.0);
    let k1 = vel;
    let p1 = uv - 0.5 * dt * k1 * aspect;
    let k2 = getVelocity(p1, params.time, params);
    let p2 = uv - 0.5 * dt * k2 * aspect;
    let k3 = getVelocity(p2, params.time, params);
    let p3 = uv - dt * k3 * aspect;
    let k4 = getVelocity(p3, params.time, params);
    let rk4_vel = (k1 + 2.0 * k2 + 2.0 * k3 + k4) / 6.0;
    let rk4_prevUV = uv - dt * rk4_vel * aspect;
    return textureSample(prevStateTex, samp, rk4_prevUV);
}
