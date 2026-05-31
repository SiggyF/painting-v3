struct Uniforms {
    channelWater: f32,
    waterLevelMin: f32,
    waterLevelMax: f32,
    opacity: f32,
    channelMask: f32,
    aspectRatio: f32,
    showContours: f32,
    dummy1: f32,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var uvSampler: sampler;
@group(0) @binding(2) var uvTex: texture_2d<f32>;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@vertex
fn vertex_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var output: VertexOutput;
    var positions = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>( 3.0, -1.0),
        vec2<f32>(-1.0,  3.0)
    );
    let pos = positions[vertexIndex];
    output.position = vec4<f32>(pos, 0.0, 1.0);
    output.uv = pos * 0.5 + 0.5;
    output.uv.y = 1.0 - output.uv.y;
    return output;
}

fn get_channel_value(color: vec4<f32>, channel_idx: f32) -> f32 {
    if (channel_idx < 0.5) { return color.r; }
    if (channel_idx < 1.5) { return color.g; }
    if (channel_idx < 2.5) { return color.b; }
    return color.a;
}

fn get_water_level_bilinear(uv: vec2<f32>) -> f32 {
    let raw = textureSample(uvTex, uvSampler, uv);
    return get_channel_value(raw, uniforms.channelWater);
}

// Crameri's Davos Colormap stops:
// c0 = vec3<f32>(0.0000, 0.0197, 0.2920)
// c1 = vec3<f32>(0.1844, 0.3537, 0.5883)
// c2 = vec3<f32>(0.4236, 0.5560, 0.5751)
// c3 = vec3<f32>(0.7423, 0.7875, 0.5851)
// c4 = vec3<f32>(0.9975, 0.9978, 0.9980)
fn davos_colormap(t: f32) -> vec3<f32> {
    let c0 = vec3<f32>(0.0000, 0.0197, 0.2920);
    let c1 = vec3<f32>(0.1844, 0.3537, 0.5883);
    let c2 = vec3<f32>(0.4236, 0.5560, 0.5751);
    let c3 = vec3<f32>(0.7423, 0.7875, 0.5851);
    let c4 = vec3<f32>(0.9975, 0.9978, 0.9980);
    if (t < 0.25) {
        return mix(c0, c1, t * 4.0);
    } else if (t < 0.5) {
        return mix(c1, c2, (t - 0.25) * 4.0);
    } else if (t < 0.75) {
        return mix(c2, c3, (t - 0.5) * 4.0);
    } else {
        return mix(c3, c4, (t - 0.75) * 4.0);
    }
}

fn cubicWeight(x: f32) -> vec4<f32> {
    let x2 = x * x;
    let x3 = x2 * x;
    let w0 = 0.5 * (-x3 + 2.0 * x2 - x);
    let w1 = 0.5 * (3.0 * x3 - 5.0 * x2 + 2.0);
    let w2 = 0.5 * (-3.0 * x3 + 4.0 * x2 + x);
    let w3 = 0.5 * (x3 - x2);
    return vec4<f32>(w0, w1, w2, w3);
}

fn textureSampleBicubic(tex: texture_2d<f32>, smp: sampler, uv: vec2<f32>) -> vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(tex, 0u));
    let texelSize = 1.0 / texSize;
    
    let tc = uv * texSize - 0.5;
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
            color += textureSample(tex, smp, samplePos) * weight;
            weightSum += weight;
        }
    }
    
    return color / weightSum;
}

fn get_water_level_bicubic(uv: vec2<f32>) -> f32 {
    let raw = textureSampleBicubic(uvTex, uvSampler, uv);
    return get_channel_value(raw, uniforms.channelWater);
}

@fragment
fn fragment_main(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(uvTex, 0u));
    let texelSize = 1.0 / texSize;
    
    // Smooth sample 9 points around uv using bicubic filtering to get C1 continuity
    let o = 1.8 * texelSize;
    
    let w00 = get_water_level_bicubic(uv + vec2<f32>(-o.x, -o.y));
    let w01 = get_water_level_bicubic(uv + vec2<f32>(0.0, -o.y));
    let w02 = get_water_level_bicubic(uv + vec2<f32>(o.x, -o.y));
    
    let w10 = get_water_level_bicubic(uv + vec2<f32>(-o.x, 0.0));
    let w11 = get_water_level_bicubic(uv);
    let w12 = get_water_level_bicubic(uv + vec2<f32>(o.x, 0.0));
    
    let w20 = get_water_level_bicubic(uv + vec2<f32>(-o.x, o.y));
    let w21 = get_water_level_bicubic(uv + vec2<f32>(0.0, o.y));
    let w22 = get_water_level_bicubic(uv + vec2<f32>(o.x, o.y));
    
    // Average value (Gaussian-like 3x3 filter of bicubic samples)
    let water_norm_smooth = (
        (w00 + w02 + w20 + w22) * 1.0 +
        (w01 + w10 + w12 + w21) * 2.0 +
        w11 * 4.0
    ) / 16.0;
    
    // Compute analytical gradient in UV space using Sobel filter
    let grad_u = ((w02 - w00) + 2.0 * (w12 - w10) + (w22 - w20)) / (8.0 * o.x);
    let grad_v = ((w20 - w00) + 2.0 * (w21 - w01) + (w22 - w02)) / (8.0 * o.y);
    let grad = vec2<f32>(grad_u, grad_v);
    
    // Project gradient to screen-space coordinates
    let dwdx = dot(grad, dpdx(uv));
    let dwdy = dot(grad, dpdy(uv));
    let dw_pixel = length(vec2<f32>(dwdx, dwdy));
    
    let step_size = 0.05; // Contour interval
    let val = water_norm_smooth / step_size;
    let f = fract(val);
    let edge = min(f, 1.0 - f);
    
    // Screen-space change in val per pixel
    let df_smooth = max(dw_pixel / step_size, 0.0001);
    
    // Clean anti-aliased line of width ~2.2 pixels
    let contour = smoothstep(2.2 * df_smooth, 0.0, edge);
    
    // Original sample for details (bicubic)
    let raw_sample = textureSampleBicubic(uvTex, uvSampler, uv);
    
    // Check mask to hide on land
    let raw_mask = get_channel_value(raw_sample, uniforms.channelMask);
    var is_land = 0.0;
    if (uniforms.channelMask > 2.5) {
        is_land = 1.0 - raw_mask;
    } else {
        is_land = raw_mask;
    }
    if (is_land > 0.5) {
        return vec4<f32>(0.0, 0.0, 0.0, 0.0);
    }
    
    // Map to colormap (use raw bicubic sample to preserve highest values and peaks from being smoothed away)
    let water_norm = get_channel_value(raw_sample, uniforms.channelWater);
    var color = davos_colormap(clamp(water_norm, 0.0, 1.0));
    
    // Draw contours if enabled
    if (uniforms.showContours > 0.5) {
        // Blend in a dark contour line (deep blue-grey)
        color = mix(color, vec3<f32>(0.02, 0.05, 0.15), contour * 0.45);
    }
    
    // Apply opacity and return premultiplied color
    let alpha = uniforms.opacity;
    return vec4<f32>(color * alpha, alpha);
}
