let forwardUV = uv + vel * 0.005 * aspect;
let fc = textureSample(prevStateTex, samp, forwardUV);
let clampCenter = prevUV;

var tvd_minVal: vec4<f32>;
var tvd_maxVal: vec4<f32>;
{
    let texSize = vec2<f32>(textureDimensions(origStateTex, 0u));
    let sizeI = vec2<i32>(texSize);
    let tc = clampCenter * texSize - 0.5;
    let tc_floor = clamp(vec2<i32>(floor(tc)), vec2<i32>(0), sizeI - vec2<i32>(2));
    
    let c0 = textureLoad(origStateTex, tc_floor, 0);
    let c1 = textureLoad(origStateTex, tc_floor + vec2<i32>(1, 0), 0);
    let c2 = textureLoad(origStateTex, tc_floor + vec2<i32>(0, 1), 0);
    let c3 = textureLoad(origStateTex, tc_floor + vec2<i32>(1, 1), 0);
    
    tvd_minVal = min(c0, min(c1, min(c2, c3)));
    tvd_maxVal = max(c0, max(c1, max(c2, c3)));
}

let correction = 0.5 * (f_curr - fc);
let delta_plus = tvd_maxVal - fp;
let delta_minus = fp - tvd_minVal;

let pos_corr = clamp(correction, vec4<f32>(0.0), max(vec4<f32>(0.0), delta_plus));
let neg_corr = -clamp(-correction, vec4<f32>(0.0), max(vec4<f32>(0.0), delta_minus));
let tvd_correction = select(neg_corr, pos_corr, correction > vec4<f32>(0.0));

let f_base = fp;
let f_final = fp + tvd_correction;
