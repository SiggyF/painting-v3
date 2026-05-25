fn sampleAdvection(uv: vec2<f32>, prevUV: vec2<f32>, vel: vec2<f32>) -> vec4<f32> {
    __PREDICTOR_ADVECT__
}

@group(0) @binding(7) var origStateTex: texture_2d<f32>;

@fragment
fn advect_main2(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
    let velocityScale = 1.0 - params.viscosity * 0.85;
    let aspect = vec2<f32>(1.0 / params.aspectRatio, 1.0);
    
    var vel = getVelocity(uv, params.time, params) * velocityScale;
    let prevUV = uv - vel * 0.005 * aspect;
    
    let fp = textureSample(prevStateTex, samp, uv);
    let f_curr = textureSample(origStateTex, samp, uv);
    let f_curr_prev = textureSample(origStateTex, samp, prevUV);
    
    __CORRECTOR_BODY__
    
    let edgeDist = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
    let edgeDistPrev = min(min(clampCenter.x, 1.0 - clampCenter.x), min(clampCenter.y, 1.0 - clampCenter.y));
    let edgeDistFwd = min(min(forwardUV.x, 1.0 - forwardUV.x), min(forwardUV.y, 1.0 - forwardUV.y));
    let boundaryDist = min(edgeDist, min(edgeDistPrev, edgeDistFwd));
    let boundaryFade = smoothstep(0.0, 0.02, boundaryDist);

    var sampleUV_curr = uv;
    var sampleUV_prev = clampCenter;
    var sampleUV_fwd = forwardUV;
    if (params.flipv > 0.5) {
        sampleUV_curr.y = 1.0 - sampleUV_curr.y;
        sampleUV_prev.y = 1.0 - sampleUV_prev.y;
        sampleUV_fwd.y = 1.0 - sampleUV_fwd.y;
    }
    let mask_curr = textureSample(uvTex, uvSampler, sampleUV_curr).b;
    let mask_prev = textureSample(uvTex, uvSampler, sampleUV_prev).b;
    let mask_fwd = textureSample(uvTex, uvSampler, sampleUV_fwd).b;
    let maskFade = clamp(1.0 - max(mask_curr, max(mask_prev, mask_fwd)) * 10.0, 0.0, 1.0);

    let fade = boundaryFade * maskFade;
    let f_final_clamped_val = mix(f_base, f_final, fade);
    
    let texSize = vec2<f32>(textureDimensions(origStateTex, 0u));
    let sizeI = vec2<i32>(texSize);
    let tc = clampCenter * texSize - 0.5;
    let tc_floor = clamp(vec2<i32>(floor(tc)), vec2<i32>(0), sizeI - vec2<i32>(2));
    
    let c0 = textureLoad(origStateTex, tc_floor, 0);
    let c1 = textureLoad(origStateTex, tc_floor + vec2<i32>(1, 0), 0);
    let c2 = textureLoad(origStateTex, tc_floor + vec2<i32>(0, 1), 0);
    let c3 = textureLoad(origStateTex, tc_floor + vec2<i32>(1, 1), 0);
    
    let minVal = min(c0, min(c1, min(c2, c3)));
    let maxVal = max(c0, max(c1, max(c2, c3)));
    
    let f_clamped = clamp(f_final_clamped_val, minVal, maxVal);
    
    var pigment = clamp(f_clamped.rgb, vec3<f32>(0.0), vec3<f32>(1.0));
    var concentration = clamp(f_clamped.a, 0.0, 2.0);
    
    if (params.viscosity > 0.001) {
        let edgeDecay = mix(1.0, 0.94, smoothstep(0.6, 0.1, concentration));
        concentration = concentration * mix(1.0, edgeDecay, params.viscosity);
    }
    
    let source = textureSample(sourceTex, samp, uv);
    if (source.a > 0.01) {
        pigment = mix(pigment, source.rgb, source.a * 0.5);
        let fillRate = 0.8;
        concentration += (1.5 - concentration) * source.a * fillRate;
    }
    
    concentration *= params.decay;
    
    var sampleUV = uv;
    if (params.flipv > 0.5) {
        sampleUV.y = 1.0 - sampleUV.y;
    }
    let mask = textureSample(uvTex, uvSampler, sampleUV).b;
    if (mask > 0.01) {
        return vec4<f32>(0.0, 0.0, 0.0, 0.0);
    }
    
    return vec4<f32>(pigment, concentration);
}
