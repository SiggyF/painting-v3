fn sampleAdvectionCorrector(uv: vec2<f32>, prevUV: vec2<f32>, vel: vec2<f32>, fp: vec4<f32>, f_curr: vec4<f32>, aspect: vec2<f32>) -> vec4<f32> {
    let forwardUV = uv + vel * 0.005 * aspect;
    let fc = textureSample(prevStateTex, samp, forwardUV);
    let f_curr_prev = textureSample(origStateTex, samp, prevUV);
    
    // Clamp to local bounds around prevUV (bilinear neighborhood)
    let texSize = vec2<f32>(textureDimensions(origStateTex, 0u));
    let sizeI = vec2<i32>(texSize);
    let tc = prevUV * texSize - 0.5;
    let tc_floor = clamp(vec2<i32>(floor(tc)), vec2<i32>(0), sizeI - vec2<i32>(2));
    
    let c0 = textureLoad(origStateTex, tc_floor, 0);
    let c1 = textureLoad(origStateTex, tc_floor + vec2<i32>(1, 0), 0);
    let c2 = textureLoad(origStateTex, tc_floor + vec2<i32>(0, 1), 0);
    let c3 = textureLoad(origStateTex, tc_floor + vec2<i32>(1, 1), 0);
    
    let minVal = min(c0, min(c1, min(c2, c3)));
    let maxVal = max(c0, max(c1, max(c2, c3)));
    
    let f_final = f_curr_prev + 0.5 * (f_curr - fc);
    return clamp(f_final, minVal, maxVal);
}
