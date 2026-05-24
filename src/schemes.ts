import './style.css'
import { useWebGPU } from './composables/useWebGPU'

// Retrieve DOM elements
const canvasA = document.getElementById('canvas-a') as HTMLCanvasElement;
const canvasB = document.getElementById('canvas-b') as HTMLCanvasElement;
const videoElement = document.getElementById('sim-video') as HTMLVideoElement;
const imageElement = document.getElementById('sim-image') as HTMLImageElement;
const modelSelect = document.getElementById('param-model') as HTMLSelectElement;
const presetSelect = document.getElementById('preset-scheme') as HTMLSelectElement;
const shaderEditor = document.getElementById('shader-editor') as HTMLTextAreaElement;
const applyBtn = document.getElementById('btn-apply-shader') as HTMLButtonElement;
const compilerStatus = document.getElementById('compiler-status') as HTMLSpanElement;
const compilerLogs = document.getElementById('compiler-logs') as HTMLDivElement;

const paramSpeed = document.getElementById('param-speed') as HTMLInputElement;
const paramDecay = document.getElementById('param-decay') as HTMLInputElement;
const paramViscosity = document.getElementById('param-viscosity') as HTMLInputElement;

const labelSpeed = document.getElementById('label-speed') as HTMLSpanElement;
const labelDecay = document.getElementById('label-decay') as HTMLSpanElement;
const labelViscosity = document.getElementById('label-viscosity') as HTMLSpanElement;

const btnGrid = document.getElementById('btn-grid') as HTMLButtonElement;
const btnQuivers = document.getElementById('btn-quivers') as HTMLButtonElement;
const btnClear = document.getElementById('btn-clear') as HTMLButtonElement;

const statsA = document.getElementById('stats-a') as HTMLDivElement;
const statsB = document.getElementById('stats-b') as HTMLDivElement;

// Initialize independent WebGPU simulations
const simA = useWebGPU();
const simB = useWebGPU();

// Create shared 2D offscreen canvas for identical drawing
const paintCanvas = document.createElement('canvas');
const paintCtx = paintCanvas.getContext('2d')!;

// Preset advection algorithms code
const presets: Record<string, string> = {
  'mac-cormack': `fn sampleAdvection(uv: vec2<f32>, prevUV: vec2<f32>, vel: vec2<f32>) -> vec4<f32> {
    // PASS 1: Predictor advects prevStateTex backward
    return textureSample(prevStateTex, samp, prevUV);
}

@group(0) @binding(7) var origStateTex: texture_2d<f32>;

@fragment
fn advect_main2(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
    let velocityScale = 1.0 - params.viscosity * 0.85;
    let aspect = vec2<f32>(1.0 / params.aspectRatio, 1.0);
    
    var vel = getVelocity(uv, params.time, params) * velocityScale;
    let prevUV = uv - vel * 0.005 * aspect;
    
    // 1. Predictor value fp (from tempTex at uv)
    let fp = textureSample(prevStateTex, samp, uv);
    
    // 2. Corrector step (Project forward from prevUV using velocity at prevUV)
    let vel_back = getVelocity(prevUV, params.time, params) * velocityScale;
    let forwardUV = prevUV + vel_back * 0.005 * aspect;
    
    // Sample predicted state tempTex at forwardUV
    let fc = textureSample(prevStateTex, samp, forwardUV);
    
    // 3. Original state f_curr at uv
    let f_curr = textureSample(origStateTex, samp, uv);
    
    // Smoothly fade out correction term near domain boundaries and masks to prevent artifacts
    let edgeDist = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
    let edgeDistPrev = min(min(prevUV.x, 1.0 - prevUV.x), min(prevUV.y, 1.0 - prevUV.y));
    let edgeDistFwd = min(min(forwardUV.x, 1.0 - forwardUV.x), min(forwardUV.y, 1.0 - forwardUV.y));
    let boundaryDist = min(edgeDist, min(edgeDistPrev, edgeDistFwd));
    let boundaryFade = smoothstep(0.0, 0.02, boundaryDist);

    var sampleUV_curr = uv;
    var sampleUV_prev = prevUV;
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
    var f_final = fp + 0.5 * (f_curr - fc) * fade;
    
    // 4. Point-sampled clamping bounds from the original state around prevUV
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
    
    f_final = clamp(f_final, minVal, maxVal);
    
    var pigment = clamp(f_final.rgb, vec3<f32>(0.0), vec3<f32>(1.0));
    var concentration = clamp(f_final.a, 0.0, 2.0);
    
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
}`,

  'bfecc': `fn sampleAdvection(uv: vec2<f32>, prevUV: vec2<f32>, vel: vec2<f32>) -> vec4<f32> {
    // PASS 1: Predictor advects prevStateTex backward
    return textureSample(prevStateTex, samp, prevUV);
}

@group(0) @binding(7) var origStateTex: texture_2d<f32>;

@fragment
fn advect_main2(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
    let velocityScale = 1.0 - params.viscosity * 0.85;
    let aspect = vec2<f32>(1.0 / params.aspectRatio, 1.0);
    
    var vel = getVelocity(uv, params.time, params) * velocityScale;
    let prevUV = uv - vel * 0.005 * aspect;
    
    // 1. Predictor value fp (from tempTex at uv)
    let fp = textureSample(prevStateTex, samp, uv);
    
    // 2. Corrector step (Project forward from prevUV using velocity at prevUV)
    let vel_back = getVelocity(prevUV, params.time, params) * velocityScale;
    let forwardUV = prevUV + vel_back * 0.005 * aspect;
    
    // Sample predicted state tempTex at forwardUV
    let fc = textureSample(prevStateTex, samp, forwardUV);
    
    // 3. Original state f_curr at uv
    let f_curr = textureSample(origStateTex, samp, uv);
    
    // Smoothly fade out correction term near domain boundaries and masks to prevent artifacts
    let edgeDist = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
    let edgeDistPrev = min(min(prevUV.x, 1.0 - prevUV.x), min(prevUV.y, 1.0 - prevUV.y));
    let edgeDistFwd = min(min(forwardUV.x, 1.0 - forwardUV.x), min(forwardUV.y, 1.0 - forwardUV.y));
    let boundaryDist = min(edgeDist, min(edgeDistPrev, edgeDistFwd));
    let boundaryFade = smoothstep(0.0, 0.02, boundaryDist);

    var sampleUV_curr = uv;
    var sampleUV_prev = prevUV;
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
    var f_final = fp + 0.5 * (f_curr - fc) * fade;
    
    // 4. Point-sampled clamping bounds from the original state around prevUV
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
    
    f_final = clamp(f_final, minVal, maxVal);
    
    var pigment = clamp(f_final.rgb, vec3<f32>(0.0), vec3<f32>(1.0));
    var concentration = clamp(f_final.a, 0.0, 2.0);
    
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
}`,

  'rk4-maccormack': `fn sampleAdvection(uv: vec2<f32>, prevUV: vec2<f32>, vel: vec2<f32>) -> vec4<f32> {
    // PASS 1: Predictor (RK4 Backward Advection)
    let dt = 0.005;
    let aspect = vec2<f32>(1.0 / params.aspectRatio, 1.0);
    
    // RK4 backtracking path
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

@group(0) @binding(7) var origStateTex: texture_2d<f32>;

@fragment
fn advect_main2(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
    let velocityScale = 1.0 - params.viscosity * 0.85;
    let aspect = vec2<f32>(1.0 / params.aspectRatio, 1.0);
    let dt = 0.005;
    
    var vel = getVelocity(uv, params.time, params) * velocityScale;
    
    // RK4 backtracking path to find the same rk4_prevUV
    let k1 = vel;
    let p1 = uv - 0.5 * dt * k1 * aspect;
    let k2 = getVelocity(p1, params.time, params) * velocityScale;
    let p2 = uv - 0.5 * dt * k2 * aspect;
    let k3 = getVelocity(p2, params.time, params) * velocityScale;
    let p3 = uv - dt * k3 * aspect;
    let k4 = getVelocity(p3, params.time, params) * velocityScale;
    
    let rk4_vel = (k1 + 2.0 * k2 + 2.0 * k3 + k4) / 6.0;
    let rk4_prevUV = uv - dt * rk4_vel * aspect;
    
    // 1. Predictor value fp (from tempTex at uv)
    let fp = textureSample(prevStateTex, samp, uv);
    
    // 2. Corrector step (Project forward from rk4_prevUV using velocity at rk4_prevUV)
    let vel_back = getVelocity(rk4_prevUV, params.time, params) * velocityScale;
    let forwardUV = rk4_prevUV + vel_back * dt * aspect;
    
    // Sample predicted state tempTex at forwardUV
    let fc = textureSample(prevStateTex, samp, forwardUV);
    
    // 3. Original state f_curr at uv
    let f_curr = textureSample(origStateTex, samp, uv);
    
    // Smoothly fade out correction term near domain boundaries and masks to prevent artifacts
    let edgeDist = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
    let edgeDistPrev = min(min(rk4_prevUV.x, 1.0 - rk4_prevUV.x), min(rk4_prevUV.y, 1.0 - rk4_prevUV.y));
    let edgeDistFwd = min(min(forwardUV.x, 1.0 - forwardUV.x), min(forwardUV.y, 1.0 - forwardUV.y));
    let boundaryDist = min(edgeDist, min(edgeDistPrev, edgeDistFwd));
    let boundaryFade = smoothstep(0.0, 0.02, boundaryDist);

    var sampleUV_curr = uv;
    var sampleUV_prev = rk4_prevUV;
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
    var f_final = fp + 0.5 * (f_curr - fc) * fade;
    
    // 4. Point-sampled clamping bounds from original state around rk4_prevUV
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
    
    f_final = clamp(f_final, minVal, maxVal);
    
    var pigment = clamp(f_final.rgb, vec3<f32>(0.0), vec3<f32>(1.0));
    var concentration = clamp(f_final.a, 0.0, 2.0);
    
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
}`,

  'bicubic': `fn cubicWeight(x: f32) -> vec4<f32> {
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
}`,

  'bilinear': `fn sampleAdvection(uv: vec2<f32>, prevUV: vec2<f32>, vel: vec2<f32>) -> vec4<f32> {
    return textureSample(prevStateTex, samp, prevUV);
}`
};

// Simulation parameters
const gpuParamsA = {
  speed: 0.16, blend: 0.5, time: 0.0, aspect: 1.0, scale: 4.0,
  mouseX: -1.0, mouseY: -1.0, isDrawing: 0.0, mouseDirX: 0.0, mouseDirY: 0.0,
  uvScale: 1.6, flipv: 1.0, mouseRadius: 0.005, decay: 0.999, viscosity: 0.0,
  scheme: 0.0, // Left canvas is Bilinear
  analytical: 1.0 // Default to analytical circular vortex active
};

const gpuParamsB = {
  speed: 0.16, blend: 0.5, time: 0.0, aspect: 1.0, scale: 4.0,
  mouseX: -1.0, mouseY: -1.0, isDrawing: 0.0, mouseDirX: 0.0, mouseDirY: 0.0,
  uvScale: 1.6, flipv: 1.0, mouseRadius: 0.005, decay: 0.999, viscosity: 0.0,
  scheme: 1.0, // Right canvas uses pluggable custom solver
  analytical: 1.0
};

let currentSourceType = 'video';
let isPersistentSource = false;
let modelsList: any[] = [];

let maxMassA = 0;
let maxMassB = 0;
let currentDissipationA = 0;
let currentDissipationB = 0;
let isFetchingStats = false;

function resetMassStats() {
  maxMassA = 0;
  maxMassB = 0;
  currentDissipationA = 0;
  currentDissipationB = 0;
  const labelA = statsA.children[1] as HTMLDivElement;
  if (labelA) labelA.textContent = `Dissip: 0.0%`;
  const labelB = statsB.children[1] as HTMLDivElement;
  if (labelB) labelB.textContent = `Dissip: 0.0%`;
}

// Synchronized continuous paint triggers
let isQPressed = false;
let isGPressed = false;

// Drawing coordinates state
const lastMousePos = { x: -1, y: -1 };

// Helper: draw to paint canvas
function drawToPaintCanvas(nx: number, ny: number) {
  resetMassStats();
  const w = paintCanvas.width;
  const h = paintCanvas.height;
  const r = gpuParamsA.mouseRadius * w;
  const color = '#38bdf8'; // Sky blue pigment

  paintCtx.beginPath();
  if (lastMousePos.x !== -1) {
    paintCtx.moveTo(lastMousePos.x * w, lastMousePos.y * h);
    paintCtx.lineTo(nx * w, ny * h);
    paintCtx.strokeStyle = color;
    paintCtx.lineWidth = r * 2;
    paintCtx.lineCap = 'round';
    paintCtx.lineJoin = 'round';
    paintCtx.stroke();
  } else {
    paintCtx.arc(nx * w, ny * h, r, 0, Math.PI * 2);
    paintCtx.fillStyle = color;
    paintCtx.fill();
  }
  
  lastMousePos.x = nx;
  lastMousePos.y = ny;
}

// Mirror quivers injection
function addQuivers() {
  resetMassStats();
  const w = paintCanvas.width;
  const h = paintCanvas.height;
  const radius = Math.max(0.9, w * 0.0009); // 50% larger size
  paintCtx.fillStyle = '#ffffff';
  for (let i = 0; i < 200; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    paintCtx.beginPath();
    paintCtx.arc(x, y, radius, 0, Math.PI * 2);
    paintCtx.fill();
  }
}

// Mirror grid lines injection
function addGrid() {
  resetMassStats();
  const w = paintCanvas.width;
  const h = paintCanvas.height;
  const step = w / 16;
  paintCtx.strokeStyle = '#ffffff';
  paintCtx.lineWidth = 0.4;
  for (let x = 0; x <= w; x += step) {
    paintCtx.beginPath(); paintCtx.moveTo(x, 0); paintCtx.lineTo(x, h); paintCtx.stroke();
  }
  for (let y = 0; y <= h; y += step) {
    paintCtx.beginPath(); paintCtx.moveTo(0, y); paintCtx.lineTo(w, y); paintCtx.stroke();
  }
}

// Shared mouse interaction handlers
let isMouseDown = false;

function handleInteractionStart(e: MouseEvent, canvas: HTMLCanvasElement) {
  isMouseDown = true;
  gpuParamsA.isDrawing = 1.0;
  gpuParamsB.isDrawing = 1.0;
  updateMouseCoordinates(e, canvas);
}

function handleInteractionMove(e: MouseEvent, canvas: HTMLCanvasElement) {
  if (!isMouseDown) return;
  updateMouseCoordinates(e, canvas);
  
  const rect = canvas.getBoundingClientRect();
  const nx = (e.clientX - rect.left) / rect.width;
  const ny = (e.clientY - rect.top) / rect.height;
  drawToPaintCanvas(nx, ny);
}

function handleInteractionEnd() {
  isMouseDown = false;
  gpuParamsA.isDrawing = 0.0;
  gpuParamsB.isDrawing = 0.0;
  gpuParamsA.mouseX = -1.0;
  gpuParamsA.mouseY = -1.0;
  gpuParamsB.mouseX = -1.0;
  gpuParamsB.mouseY = -1.0;
  lastMousePos.x = -1;
  lastMousePos.y = -1;
}

function updateMouseCoordinates(e: MouseEvent, canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  
  const nx = (e.clientX - rect.left) / rect.width;
  const ny = (e.clientY - rect.top) / rect.height;
  
  if (gpuParamsA.mouseX !== -1.0) {
    const dx = nx - gpuParamsA.mouseX;
    const dy = ny - gpuParamsA.mouseY;
    gpuParamsA.mouseDirX = dx;
    gpuParamsA.mouseDirY = dy;
    gpuParamsB.mouseDirX = dx;
    gpuParamsB.mouseDirY = dy;
  }
  
  gpuParamsA.mouseX = nx;
  gpuParamsA.mouseY = ny;
  gpuParamsB.mouseX = nx;
  gpuParamsB.mouseY = ny;
}

// Dynamic shader recompilation
async function recompileShader() {
  compilerStatus.className = 'w-2 h-2 rounded-full bg-amber-500 animate-pulse';
  compilerLogs.textContent = 'Compiling and rebuilding WebGPU pipeline...';
  
  const code = shaderEditor.value;
  const result = await simB.compileAdvectPipeline(code);
  
  if (result.success) {
    compilerStatus.className = 'w-2 h-2 rounded-full bg-emerald-500 animate-pulse';
    compilerLogs.textContent = 'Shader pipeline compilation successful.';
  } else {
    compilerStatus.className = 'w-2 h-2 rounded-full bg-red-500';
    compilerLogs.textContent = `Compilation Error:\n${result.messages.join('\n')}`;
  }
}

// Re-size canvasses synchronously
function resize() {
  const w = Math.floor(canvasA.parentElement!.clientWidth);
  const h = Math.floor(canvasA.parentElement!.clientHeight);
  
  canvasA.width = w;
  canvasA.height = h;
  canvasB.width = w;
  canvasB.height = h;
  
  paintCanvas.width = w * 2;
  paintCanvas.height = h * 2;
  
  simA.resize(w, h);
  simB.resize(w, h);
  
  gpuParamsA.aspect = w / h;
  gpuParamsB.aspect = w / h;
}

function updateStats() {
  if (isFetchingStats) return;
  isFetchingStats = true;
  
  Promise.all([simA.getStats(), simB.getStats()]).then(([statsAData, statsBData]) => {
    if (statsAData) {
      const mass = (statsAData[0] + statsAData[1] + statsAData[2]) / 100.0;
      if (mass > maxMassA) maxMassA = mass;
      currentDissipationA = maxMassA > 1.0 ? (1.0 - mass / maxMassA) * 100.0 : 0.0;
    }
    if (statsBData) {
      const mass = (statsBData[0] + statsBData[1] + statsBData[2]) / 100.0;
      if (mass > maxMassB) maxMassB = mass;
      currentDissipationB = maxMassB > 1.0 ? (1.0 - mass / maxMassB) * 100.0 : 0.0;
    }
    
    // Update live dissipation display
    const labelA = statsA.children[1] as HTMLDivElement;
    if (labelA) labelA.textContent = `Dissip: ${currentDissipationA.toFixed(1)}%`;
    const labelB = statsB.children[1] as HTMLDivElement;
    if (labelB) labelB.textContent = `Dissip: ${currentDissipationB.toFixed(1)}%`;
    
    isFetchingStats = false;
  }).catch(() => {
    isFetchingStats = false;
  });
}

// Main render loop
let frameCount = 0;
let lastTime = performance.now();
let fps = 60;

function loop() {
  gpuParamsA.time += 0.01;
  gpuParamsB.time += 0.01;
  
  gpuParamsA.mouseDirX *= 0.9;
  gpuParamsA.mouseDirY *= 0.9;
  gpuParamsB.mouseDirX *= 0.9;
  gpuParamsB.mouseDirY *= 0.9;
  
  if (isQPressed) addQuivers();
  if (isGPressed) addGrid();
  
  // Upload offscreen draw buffer to both simulations
  simA.updatePaintTexture(paintCanvas);
  simB.updatePaintTexture(paintCanvas);
  
  // Update Flow source
  if (currentSourceType === 'video' && videoElement.readyState >= 2) {
    if (videoElement.paused) videoElement.play().catch(() => {});
    simA.updateUVTexture(videoElement);
    simB.updateUVTexture(videoElement);
  } else if (currentSourceType === 'image' && imageElement.complete) {
    simA.updateUVTexture(imageElement);
    simB.updateUVTexture(imageElement);
  }
  
  simA.render(gpuParamsA);
  simB.render(gpuParamsB);
  
  // Clear offscreen draw canvas if non-sticky
  if (!isPersistentSource) {
    paintCtx.clearRect(0, 0, paintCanvas.width, paintCanvas.height);
  }
  
  // Fetch stats periodically
  if (frameCount % 10 === 0) {
    updateStats();
  }
  
  // Track performance metrics
  frameCount++;
  const now = performance.now();
  if (now - lastTime >= 1000) {
    fps = Math.round((frameCount * 1000) / (now - lastTime));
    frameCount = 0;
    lastTime = now;
    
    // Update dashboard FPS overlays
    const fpsLabelA = statsA.children[0] as HTMLDivElement;
    if (fpsLabelA) fpsLabelA.textContent = `FPS: ${fps}`;
    const fpsLabelB = statsB.children[0] as HTMLDivElement;
    if (fpsLabelB) fpsLabelB.textContent = `FPS: ${fps}`;
  }
  
  requestAnimationFrame(loop);
}

// Load flow domain models
async function initModels() {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/models.json`);
    const data = await res.json();
    modelsList = data.models || [];
    
    // Populate model selector dropdown
    modelSelect.innerHTML = '';
    modelsList.forEach((m: any, idx: number) => {
      const opt = document.createElement('option');
      opt.value = idx.toString();
      opt.textContent = `${m.title} (${m.engine})`;
      modelSelect.appendChild(opt);
    });
    
    // Load default model (Analytical circular case is index 6, let's select it if present)
    const circularIdx = modelsList.findIndex(m => m.title.toLowerCase().includes('circular'));
    const defaultIdx = circularIdx !== -1 ? circularIdx : 0;
    modelSelect.value = defaultIdx.toString();
    loadModel(modelsList[defaultIdx]);
    
  } catch (err) {
    console.error('Error fetching models:', err);
  }
}

function loadModel(model: any) {
  simA.clearTextures();
  simA.clearSource();
  simB.clearTextures();
  simB.clearSource();
  
  paintCtx.clearRect(0, 0, paintCanvas.width, paintCanvas.height);
  resetMassStats();
  
  gpuParamsA.analytical = model.engine === 'analytical' ? 1.0 : 0.0;
  gpuParamsB.analytical = model.engine === 'analytical' ? 1.0 : 0.0;
  
  if (model.uniforms) {
    if (typeof model.uniforms.scale === 'number') {
      gpuParamsA.uvScale = model.uniforms.scale;
      gpuParamsB.uvScale = model.uniforms.scale;
    }
    if (typeof model.uniforms.flipv === 'boolean') {
      gpuParamsA.flipv = model.uniforms.flipv ? 1.0 : 0.0;
      gpuParamsB.flipv = model.uniforms.flipv ? 1.0 : 0.0;
    }
    if (typeof model.uniforms.decay === 'number') {
      gpuParamsA.decay = model.uniforms.decay;
      gpuParamsB.decay = model.uniforms.decay;
      paramDecay.value = model.uniforms.decay.toString();
      labelDecay.textContent = `${(model.uniforms.decay * 100).toFixed(2)}%`;
    }
  }
  
  const tag = model.uv?.tag || 'video';
  const cleanSrc = model.uv?.src ? (model.uv.src.startsWith('/') ? model.uv.src.slice(1) : model.uv.src) : '';
  const url = `${import.meta.env.BASE_URL}${cleanSrc}`;
  
  if (tag === 'img' || tag === 'image') {
    currentSourceType = 'image';
    imageElement.src = url;
    videoElement.src = '';
  } else {
    currentSourceType = 'video';
    videoElement.src = url.endsWith('.webm') ? url.replace('.webm', '.mp4') : url;
    imageElement.src = '';
    videoElement.load();
    videoElement.play().catch(() => {});
  }
}

// Bind UI event listeners
function bindEvents() {
  // Canvases drawing listeners (A & B mirror automatically)
  canvasA.addEventListener('mousedown', (e) => handleInteractionStart(e, canvasA));
  canvasA.addEventListener('mousemove', (e) => handleInteractionMove(e, canvasA));
  window.addEventListener('mouseup', handleInteractionEnd);

  canvasB.addEventListener('mousedown', (e) => handleInteractionStart(e, canvasB));
  canvasB.addEventListener('mousemove', (e) => handleInteractionMove(e, canvasB));

  // Controls sliders
  paramSpeed.addEventListener('input', () => {
    const val = parseFloat(paramSpeed.value);
    gpuParamsA.speed = val;
    gpuParamsB.speed = val;
    labelSpeed.textContent = `${val.toFixed(2)}x`;
  });

  paramDecay.addEventListener('input', () => {
    const val = parseFloat(paramDecay.value);
    gpuParamsA.decay = val;
    gpuParamsB.decay = val;
    labelDecay.textContent = `${(val * 100).toFixed(2)}%`;
  });

  paramViscosity.addEventListener('input', () => {
    const val = parseFloat(paramViscosity.value);
    gpuParamsA.viscosity = val;
    gpuParamsB.viscosity = val;
    labelViscosity.textContent = val.toFixed(3);
  });

  // Model Selection Dropdown
  modelSelect.addEventListener('change', () => {
    const idx = parseInt(modelSelect.value);
    loadModel(modelsList[idx]);
  });

  // Action Buttons
  btnGrid.addEventListener('mousedown', () => { isGPressed = true; });
  btnGrid.addEventListener('mouseup', () => { isGPressed = false; });
  btnGrid.addEventListener('mouseleave', () => { isGPressed = false; });

  btnQuivers.addEventListener('mousedown', () => { isQPressed = true; });
  btnQuivers.addEventListener('mouseup', () => { isQPressed = false; });
  btnQuivers.addEventListener('mouseleave', () => { isQPressed = false; });

  btnClear.addEventListener('click', () => {
    simA.clearTextures();
    simA.clearSource();
    simB.clearTextures();
    simB.clearSource();
    paintCtx.clearRect(0, 0, paintCanvas.width, paintCanvas.height);
    resetMassStats();
  });

  // Preset schemes selector
  presetSelect.addEventListener('change', () => {
    const scheme = presetSelect.value;
    shaderEditor.value = presets[scheme] || '';
    recompileShader();
  });

  // Pluggable shader recompile button
  applyBtn.addEventListener('click', recompileShader);

  // Keyboard modifiers
  window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'c') btnClear.click();
    if (e.key.toLowerCase() === 'q') isQPressed = true;
    if (e.key.toLowerCase() === 'g') isGPressed = true;
  });

  window.addEventListener('keyup', (e) => {
    if (e.key.toLowerCase() === 'q') isQPressed = false;
    if (e.key.toLowerCase() === 'g') isGPressed = false;
  });

  window.addEventListener('resize', resize);
}

// Application startup
async function start() {
  // Set default solver code in editor (MacCormack)
  shaderEditor.value = presets['mac-cormack'];
  
  // Initialize canvas resolutions
  const w = Math.floor(canvasA.parentElement!.clientWidth) || 800;
  const h = Math.floor(canvasA.parentElement!.clientHeight) || 600;
  canvasA.width = w;
  canvasA.height = h;
  canvasB.width = w;
  canvasB.height = h;
  paintCanvas.width = w * 2;
  paintCanvas.height = h * 2;

  // Initialize contexts
  await simA.init(canvasA);
  await simB.init(canvasB);
  
  // Set initial solver code in Canvas B and fail fast if it fails to compile
  const res = await simB.compileAdvectPipeline(presets['mac-cormack']);
  if (!res.success) {
    console.error("Failed to compile initial MacCormack shader:", res.messages);
    compilerStatus.className = 'w-2 h-2 rounded-full bg-red-500';
    compilerLogs.textContent = `Compilation Error on Startup:\n${res.messages.join('\n')}`;
    throw new Error(`Failed to compile initial MacCormack shader:\n${res.messages.join('\n')}`);
  }

  resize();
  bindEvents();
  await initModels();
  loop();
}

start();
