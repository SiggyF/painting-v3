// --- Common WGSL ---
struct Params {
    speed: f32, blend: f32, time: f32, aspectRatio: f32,
    noiseScale: f32, mouseX: f32, mouseY: f32, isDrawing: f32,
    mouseDirX: f32, mouseDirY: f32, uvScale: f32, flipv: f32,
    mouseRadius: f32, decay: f32, viscosity: f32, scheme: f32,
    activeColor: vec3<f32>, analytical: f32,
};

@group(0) @binding(3) var uvSampler: sampler;
@group(0) @binding(4) var uvTex: texture_2d<f32>;
@group(0) @binding(5) var sourceTex: texture_2d<f32>; // WebGPU accumulation buffer
@group(0) @binding(6) var paintTex: texture_2d<f32>; // New: Raw 2D paint canvas

fn hash(p: vec2<f32>) -> f32 {
    var p3 = fract(vec3<f32>(p.xyx) * 0.1031);
    p3 = p3 + dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

fn hash22(p: vec2<f32>) -> vec2<f32> {
    var p3 = fract(vec3<f32>(p.xyx) * vec3<f32>(0.1031, 0.1030, 0.0973));
    p3 = p3 + dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.xy) * p3.zy) * 2.0 - 1.0;
}

fn noise(p: vec2<f32>) -> f32 {
    let i = floor(p);
    let f = fract(p);
    let u = f * f * (3.0 - 2.0 * f);
    return mix(mix(dot(hash22(i + vec2<f32>(0.0,0.0)), f - vec2<f32>(0.0,0.0)),
                    dot(hash22(i + vec2<f32>(1.0,0.0)), f - vec2<f32>(1.0,0.0)), u.x),
                mix(dot(hash22(i + vec2<f32>(0.0,1.0)), f - vec2<f32>(0.0,1.0)),
                    dot(hash22(i + vec2<f32>(1.0,1.0)), f - vec2<f32>(1.0,1.0)), u.x), u.y);
}

fn getVelocity(uv: vec2<f32>, time: f32, p: Params) -> vec2<f32> {
    var vBase: vec2<f32>;
    
    if (p.analytical > 0.5) {
        if (p.analytical < 1.5) {
            // Analytical circular flow centered around (0.5, 0.5)
            let r = uv - vec2<f32>(0.5, 0.5);
            // Counter-clockwise rotation vortex
            vBase = vec2<f32>(-r.y, r.x) * p.uvScale;
        } else if (p.analytical < 2.5) {
            // Horizontal flow (u=1, v=0)
            vBase = vec2<f32>(1.0, 0.0) * p.uvScale;
        } else {
            // Diagonal back and forth flow (u=1, v=1 reversing every 100 timesteps/1.0 time units)
            let cycle = u32(floor(time));
            let direction = 1.0 - 2.0 * f32(cycle % 2u);
            vBase = vec2<f32>(direction, direction) * p.uvScale;
        }
    } else {
        // 1. Sample from Video/Image UV Texture
        var sampleUV = uv;
        if (p.flipv > 0.5) {
            sampleUV.y = 1.0 - sampleUV.y;
        }
        
        let uvData = textureSample(uvTex, uvSampler, sampleUV).rg;
        var vVideo = (uvData - 0.5) * p.uvScale;
        if (p.flipv > 0.5) {
            vVideo.y = -vVideo.y;
        }
        vBase = vVideo;
    }

    // 2. Add some noise for detail
    let pn = uv * p.noiseScale;
    let t = time * 0.2;
    let eps = 0.01;
    let n1_up = noise(pn + vec2<f32>(0.0, eps) + t);
    let n1_dn = noise(pn - vec2<f32>(0.0, eps) + t);
    let n1_rt = noise(pn + vec2<f32>(eps, 0.0) + t);
    let n1_lf = noise(pn - vec2<f32>(eps, 0.0) + t);
    let vNoise = vec2<f32>(n1_up - n1_dn, -(n1_rt - n1_lf)) * 2.0;

    if (p.analytical > 0.5) {
        return vBase * p.speed;
    } else {
        return vBase * p.speed + vNoise * p.blend;
    }
}

// --- RYB Mixing (Subtractive) ---
fn rgb_to_ryb(rgb: vec3<f32>) -> vec3<f32> {
    let w = min(rgb.r, min(rgb.g, rgb.b));
    var r = rgb.r - w; var g = rgb.g - w; var b = rgb.b - w;
    let mg = max(r, max(g, b));
    var y = min(r, g); r -= y; g -= y;
    if (b > 0.0 && g > 0.0) { b /= 2.0; g /= 2.0; }
    y += g; b += g;
    let my = max(r, max(y, b));
    if (my > 0.0) { let sc = mg / my; r *= sc; y *= sc; b *= sc; }
    return vec3<f32>(r + w, y + w, b + w);
}

fn ryb_to_rgb(ryb: vec3<f32>) -> vec3<f32> {
    let w = min(ryb.r, min(ryb.g, ryb.b));
    var r = ryb.r - w; var y = ryb.g - w; var b = ryb.b - w;
    let my = max(r, max(y, b));
    var g = min(y, b); y -= g; b -= g;
    if (b > 0.0 && g > 0.0) { b *= 2.0; g *= 2.0; }
    r += y; g += y;
    let mg = max(r, max(g, b));
    if (mg > 0.0) { let sc = my / mg; r *= sc; g *= sc; b *= sc; }
    return vec3<f32>(r + w, g + w, b + w);
}

// --- Vertex Shader ---
struct VertexOutput { @builtin(position) position: vec4<f32>, @location(0) uv: vec2<f32> };
@vertex fn vertex_main(@builtin(vertex_index) vi: u32) -> VertexOutput {
    var pos = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));
    var out: VertexOutput; out.position = vec4<f32>(pos[vi], 0.0, 1.0);
    out.uv = pos[vi] * 0.5 + 0.5; out.uv.y = 1.0 - out.uv.y; return out;
}

// --- Source Shader (Persistent Drawing) ---
@fragment
fn source_main(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
    // We sample from the raw 2D paint canvas (paintTex)
    let paintData = textureSample(paintTex, uvSampler, uv);
    
    // Return the color and alpha at full intensity.
    // The "rate" of pouring into the sea is controlled in advect_main.
    return paintData;
}

// --- Advect Shader ---
@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var prevStateTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> params: Params;

// ADVECTION_SOLVER_START
fn sampleAdvection(uv: vec2<f32>, prevUV: vec2<f32>, vel: vec2<f32>) -> vec4<f32> {
    return textureSample(prevStateTex, samp, prevUV);
}
// ADVECTION_SOLVER_END

@fragment
fn advect_main(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
    // Spatially uniform viscous drag to avoid numerical checkerboard feedback loops
    let velocityScale = 1.0 - params.viscosity * 0.85;

    let uvA = vec2<f32>(uv.x * params.aspectRatio, uv.y);
    var vel = getVelocity(uv, params.time, params);

    // Incompressible Mouse Interaction
    let mpos = vec2<f32>(params.mouseX * params.aspectRatio, params.mouseY);
    let r = uvA - mpos; let r2 = dot(r, r);
    let f = exp(-r2 / 0.003) * params.isDrawing;
    let Dx = params.mouseDirX * 15.0; let Dy = params.mouseDirY * 15.0;
    let term = (Dx * r.y - Dy * r.x) * 2.0 / 0.003;
    vel += f * vec2<f32>(Dx - r.y * term, Dy + r.x * term);

    // Apply viscosity/drag scaling to the advection velocity
    vel = vel * velocityScale;

    // Backwards Advection
    let prevUV = uv - vel * 0.005 * vec2<f32>(1.0 / params.aspectRatio, 1.0);
    let prevState = sampleAdvection(uv, prevUV, vel);
    
    // Read previous pigment and concentration
    var pigment = prevState.rgb;
    var concentration = prevState.a;

    // Viscosity (Cohesive Decay / Surface Tension)
    if (params.viscosity > 0.001) {
        // Non-linear edge decay: low concentration (blurry edges) decays faster to keep the core blob sharp.
        // This is 100% stable since it doesn't couple neighboring pixels.
        let edgeDecay = mix(1.0, 0.94, smoothstep(0.6, 0.1, concentration));
        concentration = concentration * mix(1.0, edgeDecay, params.viscosity);
    }

    // Sample from Persistent Source Texture
    let source = textureSample(sourceTex, samp, uv);
    if (source.a > 0.01) {
        // Smoothly blend the new pigment color
        pigment = mix(pigment, source.rgb, source.a * 0.5);
        
        // STABLE SATURATION MODEL:
        // Instead of adding indefinitely (overflow), we move towards a target concentration (1.5).
        // This ensures the simulation "fills up" but never explodes.
        let fillRate = 0.8; 
        concentration += (1.5 - concentration) * source.a * fillRate;
    }

    // Apply model decay (only concentration fades over time)
    concentration *= params.decay;

    // Masking using the blue channel of the UV source texture
    var sampleUV = uv;
    if (params.flipv > 0.5) {
        sampleUV.y = 1.0 - sampleUV.y;
    }
    let mask = textureSample(uvTex, uvSampler, sampleUV).b;
    if (mask > 0.01) {
        return vec4<f32>(0.0, 0.0, 0.0, 0.0);
    }

    return vec4<f32>(clamp(pigment, vec3<f32>(0.0), vec3<f32>(1.0)), clamp(concentration, 0.0, 2.0));
}

// --- Render Shader ---
@group(0) @binding(1) var stateTex: texture_2d<f32>;
@fragment
fn render_main(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
    let s = textureSample(stateTex, samp, uv);

    var sampleUV = uv;
    if (params.flipv > 0.5) {
        sampleUV.y = 1.0 - sampleUV.y;
    }
    let mask = textureSample(uvTex, uvSampler, sampleUV).b;
    if (mask > 0.01) {
        return vec4<f32>(0.0, 0.0, 0.0, 0.0);
    }

    // Render Pigment
    let pigmentColor = s.rgb;
    let pigmentOpacity = s.a; // Concentration can be up to 2.0 for glowing

    let finalRGB = clamp(pigmentColor * pigmentOpacity, vec3<f32>(0.0), vec3<f32>(1.0));

    return vec4<f32>(finalRGB, clamp(pigmentOpacity, 0.0, 1.0));
}

// --- Stats Compute Shader ---
@group(0) @binding(0) var statsTex: texture_2d<f32>;
@group(0) @binding(1) var<storage, read_write> stats: array<atomic<u32>>;

var<workgroup> localStats: array<atomic<u32>, 13>;

@compute @workgroup_size(16, 16)
fn stats_main(@builtin(global_invocation_id) id: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
    if (lid.x == 0u && lid.y == 0u) {
        for (var i = 0u; i < 13u; i++) { atomicStore(&localStats[i], 0u); }
    }
    workgroupBarrier();

    let dim = textureDimensions(statsTex, 0u);
    if (id.x < dim.x && id.y < dim.y) {
        let p = textureLoad(statsTex, id.xy, 0);
        // Fixed point conversion for atomics
        atomicAdd(&localStats[0], u32(max(0.0, p.r) * 100.0));
        atomicAdd(&localStats[1], u32(max(0.0, p.g) * 100.0));
        atomicAdd(&localStats[2], u32(max(0.0, p.b) * 100.0));

        let density = (p.r + p.g + p.b);
        let bin = u32(clamp(density * 2.0, 0.0, 9.0));
        atomicAdd(&localStats[3 + bin], 1u);
    }
    workgroupBarrier();

    if (lid.x == 0u && lid.y == 0u) {
        for (var i = 0u; i < 13u; i++) { atomicAdd(&stats[i], atomicLoad(&localStats[i])); }
    }
}
