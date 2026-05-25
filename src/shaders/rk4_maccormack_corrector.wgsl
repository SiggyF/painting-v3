let dt = 0.005;
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

let clampCenter = rk4_prevUV;
let f_base = fp;
let f_final = fp + 0.5 * (f_curr - fc);
