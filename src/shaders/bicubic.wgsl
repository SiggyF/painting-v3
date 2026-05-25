fn cubicWeight(x: f32) -> vec4<f32> {
    let x2 = x * x;
    let x3 = x2 * x;
    let w0 = 0.5 * (-x3 + 2.0 * x2 - x);
    let w1 = 0.5 * (3.0 * x3 - 5.0 * x2 + 2.0);
    let w2 = 0.5 * (-3.0 * x3 + 4.0 * x2 + x);
    let w3 = 0.5 * (x3 - x2);
    return vec4<f32>(w0, w1, w2, w3);
}

fn sampleAdvection(uv: vec2<f32>, prevUV: vec2<f32>, vel: vec2<f32>) -> vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(prevStateTex, 0u));
    let texelSize = 1.0 / texSize;
    
    let tc = prevUV * texSize - 0.5;
    let tc_floor = floor(tc);
    let frac = tc - tc_floor;
    
    let wx = cubicWeight(frac.x);
    let wy = cubicWeight(frac.y);
    
    var color = vec4<f32>(0.0);
    var weightSum = 0.0;
    
    for (var y: i32 = -1; y <= 2; y++) {
        let coordY = (tc_floor.y + f32(y) + 0.5) * texelSize.y;
        let wY = wy[y + 1];
        
        for (var x: i32 = -1; x <= 2; x++) {
            let coordX = (tc_floor.x + f32(x) + 0.5) * texelSize.x;
            let wX = wx[x + 1];
            
            let weight = wX * wY;
            let samplePos = clamp(vec2<f32>(coordX, coordY), vec2<f32>(0.0), vec2<f32>(1.0));
            color += textureSample(prevStateTex, samp, samplePos) * weight;
            weightSum += weight;
        }
    }
    
    return color / weightSum;
}
