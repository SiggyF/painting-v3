fn sampleAdvection(uv: vec2<f32>, prevUV: vec2<f32>, vel: vec2<f32>) -> vec4<f32> {
    return textureSample(prevStateTex, samp, prevUV);
}
