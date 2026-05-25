import './style.css'
import { useWebGPU } from './composables/useWebGPU'
import maccormackPredictor from './shaders/maccormack_predictor.wgsl?raw';
import maccormackCorrector from './shaders/maccormack_corrector.wgsl?raw';
import bfeccPredictor from './shaders/bfecc_predictor.wgsl?raw';
import bfeccCorrector from './shaders/bfecc_corrector.wgsl?raw';
import rk4MaccormackPredictor from './shaders/rk4_maccormack_predictor.wgsl?raw';
import rk4MaccormackCorrector from './shaders/rk4_maccormack_corrector.wgsl?raw';
import tvdPredictor from './shaders/tvd_predictor.wgsl?raw';
import tvdCorrector from './shaders/tvd_corrector.wgsl?raw';
import advectionTemplateSource from './shaders/advection_template.wgsl?raw';
import bicubicSource from './shaders/bicubic.wgsl?raw';
import bilinearSource from './shaders/bilinear.wgsl?raw';

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
const btnSlotted = document.getElementById('btn-slotted') as HTMLButtonElement;
const btnClear = document.getElementById('btn-clear') as HTMLButtonElement;

const statsA = document.getElementById('stats-a') as HTMLDivElement;
const statsB = document.getElementById('stats-b') as HTMLDivElement;

// Initialize independent WebGPU simulations
const simA = useWebGPU();
const simB = useWebGPU();

// Create shared 2D offscreen canvas for identical drawing
const paintCanvas = document.createElement('canvas');
const paintCtx = paintCanvas.getContext('2d')!;

function buildAdvectPreset(config: {
  predictorAdvect: string;
  correctorBody: string;
}) {
  return advectionTemplateSource
    .replace('__PREDICTOR_ADVECT__', config.predictorAdvect)
    .replace('__CORRECTOR_BODY__', config.correctorBody);
}

const presets: Record<string, string> = {
  'mac-cormack': buildAdvectPreset({ predictorAdvect: maccormackPredictor, correctorBody: maccormackCorrector }),
  'bfecc': buildAdvectPreset({ predictorAdvect: bfeccPredictor, correctorBody: bfeccCorrector }),
  'rk4-maccormack': buildAdvectPreset({ predictorAdvect: rk4MaccormackPredictor, correctorBody: rk4MaccormackCorrector }),
  'tvd': buildAdvectPreset({ predictorAdvect: tvdPredictor, correctorBody: tvdCorrector }),
  'bicubic': bicubicSource,
  'bilinear': bilinearSource
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

// Mirror slotted cylinder (Zalesak's Disk) injection
function addSlottedCylinder() {
  resetMassStats();
  const w = paintCanvas.width;
  const h = paintCanvas.height;
  
  // Center of slotted cylinder at (0.5, 0.7)
  const cx = 0.5 * w;
  const cy = 0.7 * h;
  const r = 0.15 * Math.min(w, h);
  const slotW = 0.04 * Math.min(w, h);
  const slotH = 0.22 * Math.min(w, h);
  
  // Clear any existing paint to start fresh
  paintCtx.clearRect(0, 0, w, h);
  
  // Draw cylinder
  paintCtx.fillStyle = '#ffffff';
  paintCtx.beginPath();
  paintCtx.arc(cx, cy, r, 0, Math.PI * 2);
  paintCtx.fill();
  
  // Subtract slot using globalCompositeOperation 'destination-out'
  paintCtx.globalCompositeOperation = 'destination-out';
  paintCtx.beginPath();
  paintCtx.rect(cx - slotW / 2, cy - r, slotW, slotH);
  paintCtx.fill();
  
  // Restore default composition
  paintCtx.globalCompositeOperation = 'source-over';
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
}

function handleInteractionEnd() {
  isMouseDown = false;
  gpuParamsA.isDrawing = 0.0;
  gpuParamsB.isDrawing = 0.0;
  gpuParamsA.mouseX = -1.0;
  gpuParamsA.mouseY = -1.0;
  gpuParamsB.mouseX = -1.0;
  gpuParamsB.mouseY = -1.0;
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

function resize() {
  const w = Math.floor(canvasA.parentElement!.clientWidth) || 800;
  const h = Math.floor(canvasA.parentElement!.clientHeight) || 600;
  if (w <= 0 || h <= 0) return;
  
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

  // Check and count blue-dominant pixels periodically
  if (frameCount % 100 === 0) {
    simA.countBluePixels().then(count => {
      if (count > 0) {
        console.log(`[Left Canvas - Bilinear] Active blue-dominant pixels: ${count}`);
      }
    });
    simB.countBluePixels().then(count => {
      if (count > 0) {
        console.log(`[Right Canvas - Pluggable] Active blue-dominant pixels: ${count}`);
      }
    });
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
  
  gpuParamsA.analytical = model.engine === 'analytical' ? (model.analyticalValue || 1.0) : 0.0;
  gpuParamsB.analytical = model.engine === 'analytical' ? (model.analyticalValue || 1.0) : 0.0;
  gpuParamsA.time = 0.0;
  gpuParamsB.time = 0.0;
  
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

  btnSlotted.addEventListener('click', () => {
    addSlottedCylinder();
    simA.loadPaintCanvasToSimulation();
    simB.loadPaintCanvasToSimulation();
  });

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
