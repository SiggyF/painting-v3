import './style.css'
import { useWebGPU } from './composables/useWebGPU'
import { presets, buildCustomAdvectCode } from './composables/webgpu/schemes'

// Retrieve DOM elements
const canvasA = document.getElementById('canvas-a') as HTMLCanvasElement;
const canvasB = document.getElementById('canvas-b') as HTMLCanvasElement;
const videoElement = document.getElementById('sim-video') as HTMLVideoElement;
const imageElement = document.getElementById('sim-image') as HTMLImageElement;
const modelSelect = document.getElementById('param-model') as HTMLSelectElement;
const selectPredictor = document.getElementById('select-predictor') as HTMLSelectElement;
const selectCorrector = document.getElementById('select-corrector') as HTMLSelectElement;
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
const btnToggle = document.getElementById('btn-toggle') as HTMLButtonElement;
const paramBlueprintOpacity = document.getElementById('param-blueprint-opacity') as HTMLInputElement;
const labelBlueprintOpacity = document.getElementById('label-blueprint-opacity') as HTMLSpanElement;
const checkAutostop = document.getElementById('check-autostop') as HTMLInputElement;
const labelAutostopStatus = document.getElementById('label-autostop-status') as HTMLSpanElement;

const statsA = document.getElementById('stats-a') as HTMLDivElement;
const statsB = document.getElementById('stats-b') as HTMLDivElement;
const stepsLabelA = document.getElementById('timesteps-a') as HTMLSpanElement;
const stepsLabelB = document.getElementById('timesteps-b') as HTMLSpanElement;
const svgA = document.getElementById('svg-overlay-a') as HTMLElement;
const svgB = document.getElementById('svg-overlay-b') as HTMLElement;
const shapeA = document.getElementById('analytical-shape-a') as HTMLElement;
const shapeB = document.getElementById('analytical-shape-b') as HTMLElement;

// Initialize independent WebGPU simulations
const simA = useWebGPU();
const simB = useWebGPU();

// Create shared 2D offscreen canvas for identical drawing
const paintCanvas = document.createElement('canvas');
const paintCtx = paintCanvas.getContext('2d')!;

let totalSteps = 0;
let isPaused = true;
let blueprintOpacity = 0.8;
let analyticalInjectionTime = -1.0;
let activePatternType: 'cylinder' | 'grid' | null = null;

const BLUEPRINT_COLOR = "#38bdf8";

// Corrected Zalesak path (C-shape outline) centered at (0.5, 0.7)
const ZALESAK_PATH = `M 0.515 0.551 
                    A 0.15 0.15 0 1 1 0.485 0.551
                    L 0.485 0.77 L 0.515 0.77 Z`;

function getGridPath() {
  const side = 0.5 * Math.sqrt(2);
  const min = 0.5 - side / 2;
  const max = 0.5 + side / 2;
  const step = (max - min) / 12;
  let d = '';
  for (let i = 0; i <= 12; i++) {
    const x = min + i * step;
    d += `M ${x} ${min} L ${x} ${max} `;
    const y = min + i * step;
    d += `M ${min} ${y} L ${max} ${y} `;
  }
  return d;
}

function updateOverlayShape() {
  const path = activePatternType === 'grid' ? getGridPath() : ZALESAK_PATH;
  const pathHTML = `<path d="${path}" stroke="${BLUEPRINT_COLOR}" stroke-width="2.0" fill="none" vector-effect="non-scaling-stroke" stroke-opacity="0.8" />`;
  if (shapeA) shapeA.innerHTML = pathHTML;
  if (shapeB) shapeB.innerHTML = pathHTML;
}

function updateAnalyticalOverlay() {
  if (analyticalInjectionTime < 0 || !svgA || !svgB || blueprintOpacity <= 0) {
    if (svgA) svgA.style.opacity = '0';
    if (svgB) svgB.style.opacity = '0';
    return;
  }
  
  const type = gpuParamsA.analytical;
  if (type < 0.5) {
    if (svgA) svgA.style.opacity = '0';
    if (svgB) svgB.style.opacity = '0';
    return;
  }

  svgA.style.opacity = blueprintOpacity.toString();
  svgB.style.opacity = blueprintOpacity.toString();
  
  // Exact Pixel Alignment: Sync SVG to Canvas using offset properties
  svgA.style.left = `${canvasA.offsetLeft}px`;
  svgA.style.top = `${canvasA.offsetTop}px`;
  svgA.style.width = `${canvasA.offsetWidth}px`;
  svgA.style.height = `${canvasA.offsetHeight}px`;

  svgB.style.left = `${canvasB.offsetLeft}px`;
  svgB.style.top = `${canvasB.offsetTop}px`;
  svgB.style.width = `${canvasB.offsetWidth}px`;
  svgB.style.height = `${canvasB.offsetHeight}px`;
  
  const dt = gpuParamsA.time - analyticalInjectionTime;
  const speed = gpuParamsA.speed;
  const scale = gpuParamsA.uvScale;
  
  const effectiveSpeed = 0.5 * speed * scale;
  let transform = '';
  
  if (type > 0.5 && type < 1.5) {
    const theta = (effectiveSpeed * dt) * (180 / Math.PI); 
    transform = `rotate(${theta}, 0.5, 0.5)`;
  } else if (type > 1.5 && type < 2.5) {
    const dx = effectiveSpeed * dt;
    transform = `translate(${dx}, 0)`;
  } else if (type > 2.5) {
    const t = gpuParamsA.time;
    const t0 = analyticalInjectionTime;
    const getIntegral = (val: number) => {
      const full = Math.floor(val);
      const rem = val - full;
      let disp = 0;
      for(let i=0; i<full; i++) disp += (i % 2 === 0) ? 1 : -1;
      disp += (full % 2 === 0) ? rem : -rem;
      return disp;
    };
    const disp = (getIntegral(t) - getIntegral(t0)) * effectiveSpeed;
    transform = `translate(${disp}, ${-disp})`;
  }
  
  if (shapeA) shapeA.setAttribute('transform', transform);
  if (shapeB) shapeB.setAttribute('transform', transform);
}

function updatePlayPauseUI() {
  if (isPaused) {
    btnToggle.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"/></svg> Play`;
    btnToggle.className = "flex-[2] py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[9px] uppercase font-bold text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500/50 transition-all flex items-center justify-center gap-2 cursor-pointer";
  } else {
    btnToggle.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> Pause`;
    btnToggle.className = "flex-[2] py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[9px] uppercase font-bold text-amber-400 hover:bg-amber-500/20 hover:border-amber-500/50 transition-all flex items-center justify-center gap-2 cursor-pointer";
  }
}

// Presets are imported from composables/webgpu/schemes

// Simulation parameters
const gpuParamsA = {
  speed: 0.16, blend: 0.0, time: 0.0, aspect: 1.0, noiseScale: 64.0, scale: 16.0,
  mouseX: -1.0, mouseY: -1.0, isDrawing: 0.0, mouseDirX: 0.0, mouseDirY: 0.0,
  uvScale: 1.6, flipv: 1.0, mouseRadius: 0.005, decay: 1.0, viscosity: 0.0,
  scheme: 0.0, // Left canvas is Bilinear
  analytical: 1.0 // Default to analytical circular vortex active
};

const gpuParamsB = {
  speed: 0.16, blend: 0.0, time: 0.0, aspect: 1.0, noiseScale: 64.0, scale: 16.0,
  mouseX: -1.0, mouseY: -1.0, isDrawing: 0.0, mouseDirX: 0.0, mouseDirY: 0.0,
  uvScale: 1.6, flipv: 1.0, mouseRadius: 0.005, decay: 1.0, viscosity: 0.0,
  scheme: 1.0, // Right canvas uses pluggable custom solver
  analytical: 1.0
};

let currentSourceType = 'video';
let isPersistentSource = false;
let modelsList: any[] = [];
let schemeData: {
  predictors: any[];
  correctors: any[];
  presets: any[];
} = { predictors: [], correctors: [], presets: [] };

let maxMassA = 0;
let maxMassB = 0;
let maxPeakA = 0;
let maxPeakB = 0;
let currentDissipationA = 0;
let currentDissipationB = 0;
let currentDiffusivityA = 0;
let currentDiffusivityB = 0;
let isFetchingStats = false;

function resetMassStats() {
  maxMassA = 0;
  maxMassB = 0;
  maxPeakA = 0;
  maxPeakB = 0;
  currentDissipationA = 0;
  currentDissipationB = 0;
  currentDiffusivityA = 0;
  currentDiffusivityB = 0;

  const massLabelA = statsA.children[1] as HTMLDivElement;
  const dissipLabelA = statsA.children[2] as HTMLDivElement;
  const diffusLabelA = statsA.children[3] as HTMLDivElement;
  if (massLabelA) massLabelA.textContent = `Mass: 0.0`;
  if (dissipLabelA) dissipLabelA.textContent = `Dissip: 0.0%`;
  if (diffusLabelA) diffusLabelA.textContent = `Diffus: 0.0%`;
  
  const massLabelB = statsB.children[1] as HTMLDivElement;
  const dissipLabelB = statsB.children[2] as HTMLDivElement;
  const diffusLabelB = statsB.children[3] as HTMLDivElement;
  if (massLabelB) massLabelB.textContent = `Mass: 0.0`;
  if (dissipLabelB) dissipLabelB.textContent = `Dissip: 0.0%`;
  if (diffusLabelB) diffusLabelB.textContent = `Diffus: 0.0%`;
}

// Mirror quivers injection
function addQuivers() {
  resetMassStats();
  const w = paintCanvas.width;
  const h = paintCanvas.height;
  const radius = 3.0; // Increased radius (2x bigger than 1.5)
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

  analyticalInjectionTime = gpuParamsA.time;
  activePatternType = 'grid';
  updateOverlayShape();
  
  const side = 0.5 * Math.sqrt(2);
  const xMin = (0.5 - side / 2) * w;
  const xMax = (0.5 + side / 2) * w;
  const yMin = (0.5 - side / 2) * h;
  const yMax = (0.5 + side / 2) * h;
  
  const step = (xMax - xMin) / 12;
  paintCtx.strokeStyle = '#ffffff';
  paintCtx.lineWidth = 4.0;

  paintCtx.beginPath();
  for (let x = xMin; x <= xMax + 0.1; x += step) {
    paintCtx.moveTo(x, yMin); paintCtx.lineTo(x, yMax);
  }
  for (let y = yMin; y <= yMax + 0.1; y += step) {
    paintCtx.moveTo(xMin, y); paintCtx.lineTo(xMax, y);
  }
  paintCtx.stroke();
}

// Mirror slotted cylinder (Zalesak's Disk) injection
function addSlottedCylinder() {
  resetMassStats();
  const w = paintCanvas.width;
  const h = paintCanvas.height;

  analyticalInjectionTime = gpuParamsA.time;
  activePatternType = 'cylinder';
  updateOverlayShape();
  
  const cx = 0.5 * w;
  const cy = 0.7 * h;
  const r = 0.15 * Math.min(w, h);
  const slotW = 0.04 * Math.min(w, h);
  const slotH = 0.22 * Math.min(w, h);
  
  paintCtx.clearRect(0, 0, w, h);
  paintCtx.fillStyle = '#ffffff';
  paintCtx.beginPath();
  paintCtx.arc(cx, cy, r, 0, Math.PI * 2);
  paintCtx.fill();
  
  paintCtx.globalCompositeOperation = 'destination-out';
  paintCtx.beginPath();
  paintCtx.rect(cx - slotW / 2, cy - r, slotW, slotH);
  paintCtx.fill();
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

function parseMarkdown(md: string): string {
  let html = md;
  
  // 1. Headers
  html = html.replace(/^# (.*?)$/gm, '<h1 class="text-sm font-bold text-sky-400 border-b border-sky-500/20 pb-1 mb-2">$1</h1>');
  html = html.replace(/^## (.*?)$/gm, '<h2 class="text-xs font-bold text-slate-200 mt-3 mb-1.5">$1</h2>');
  html = html.replace(/^### (.*?)$/gm, '<h3 class="text-[10px] font-bold text-slate-300 uppercase tracking-wider mt-3 mb-1.5">$1</h3>');
  
  // 2. Bold text
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-slate-100">$1</strong>');
  
  // 3. Inline code
  html = html.replace(/`(.*?)`/g, '<code class="px-1 py-0.5 rounded bg-slate-900 border border-white/5 font-mono text-[9px] text-rose-400">$1</code>');
  
  // 4. Tables
  const tableRegex = /((?:\|.*\|(?:\r?\n|$))+)/g;
  html = html.replace(tableRegex, (match) => {
    const lines = match.trim().split('\n');
    let tableHtml = '<table class="w-full text-left border-collapse border border-white/5 text-[10px] my-2 bg-slate-950/40 rounded-lg overflow-hidden">';
    let hasHeader = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.includes('---')) continue;
      
      const cells = line.split('|').slice(1, -1).map(c => c.trim());
      if (cells.length === 0) continue;
      
      if (!hasHeader && i === 0) {
        tableHtml += '<thead><tr class="bg-white/5 border-b border-white/5">';
        cells.forEach(cell => {
          tableHtml += `<th class="px-2.5 py-1.5 font-semibold text-slate-300">${cell}</th>`;
        });
        tableHtml += '</tr></thead><tbody>';
        hasHeader = true;
      } else {
        tableHtml += '<tr class="border-b border-white/2.5 hover:bg-white/2.5 transition-colors">';
        cells.forEach(cell => {
          tableHtml += `<td class="px-2.5 py-1.5 text-slate-400">${cell}</td>`;
        });
        tableHtml += '</tr>';
      }
    }
    tableHtml += '</tbody></table>';
    return tableHtml;
  });
  
  // 5. Paragraphs and lists
  const blocks = html.split(/\n\n+/);
  html = blocks.map(block => {
    block = block.trim();
    if (!block) return '';
    if (block.startsWith('<h') || block.startsWith('<table') || block.startsWith('<ul') || block.startsWith('<li')) {
      return block;
    }
    return `<p class="mb-2 text-slate-400 leading-relaxed">${block.replace(/\n/g, '<br>')}</p>`;
  }).join('\n');

  return html;
}

async function loadSolverDocumentation(predPath?: string, corrPath?: string) {
  const descEl = document.getElementById('solver-description');
  if (!descEl) return;
  
  descEl.innerHTML = '<span class="text-slate-500 italic animate-pulse">Loading documentation...</span>';
  
  try {
    let html = '';
    
    if (predPath) {
      const res = await fetch(`${import.meta.env.BASE_URL}${predPath}`);
      if (res.ok) {
        const text = await res.text();
        html += `<div class="mb-4">${parseMarkdown(text)}</div>`;
      }
    }
    
    if (corrPath) {
      const res = await fetch(`${import.meta.env.BASE_URL}${corrPath}`);
      if (res.ok) {
        const text = await res.text();
        html += `<div class="border-t border-white/5 pt-4 mt-4">${parseMarkdown(text)}</div>`;
      }
    }
    
    descEl.innerHTML = html || '<span class="text-slate-500 italic">No description available</span>';
  } catch (err) {
    descEl.innerHTML = `<span class="text-red-400">Failed to load documentation.</span>`;
  }
}

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

  // Update Predictor / Corrector JIT code visualization panels
  const codePredictorEl = document.getElementById('code-predictor');
  const codeCorrectorEl = document.getElementById('code-corrector');
  if (codePredictorEl && codeCorrectorEl) {
    if (code.includes('fn sampleAdvectionCorrector')) {
      const correctorIdx = code.indexOf('fn sampleAdvectionCorrector');
      codePredictorEl.textContent = code.substring(0, correctorIdx).trim();
      codeCorrectorEl.textContent = code.substring(correctorIdx).trim();
    } else {
      codePredictorEl.textContent = code.trim();
      codeCorrectorEl.textContent = '// Single-Pass Solver (No Corrector Pass)';
    }
  }
}

function resize() {
  const container = canvasA.parentElement!.parentElement!;
  const w = Math.floor(container.clientWidth) || 800;
  const h = Math.floor(container.clientHeight) || 600;
  if (w <= 0 || h <= 0) return;
  const size = Math.min(w - 64, h - 64); 
  
  canvasA.width = size;
  canvasA.height = size;
  canvasB.width = size;
  canvasB.height = size;
  
  canvasA.style.width = `${size}px`;
  canvasA.style.height = `${size}px`;
  canvasB.style.width = `${size}px`;
  canvasB.style.height = `${size}px`;
  
  paintCanvas.width = size * 2;
  paintCanvas.height = size * 2;
  
  simA.resize(size, size);
  simB.resize(size, size);
}

function updateStats() {
  if (isFetchingStats) return;
  isFetchingStats = true;
  
  Promise.all([simA.getStats(), simB.getStats()]).then(([statsAData, statsBData]) => {
    const massLabelA = statsA.children[1] as HTMLDivElement;
    const dissipLabelA = statsA.children[2] as HTMLDivElement;
    const diffusLabelA = statsA.children[3] as HTMLDivElement;
    
    const massLabelB = statsB.children[1] as HTMLDivElement;
    const dissipLabelB = statsB.children[2] as HTMLDivElement;
    const diffusLabelB = statsB.children[3] as HTMLDivElement;

    if (statsAData) {
      const mass = statsAData[0] / 1000.0;
      const peak = statsAData[13] / 1000.0;
      if (mass > maxMassA) maxMassA = mass;
      if (peak > maxPeakA) maxPeakA = peak;
      currentDissipationA = maxMassA > 1.0 ? (1.0 - mass / maxMassA) * 100.0 : 0.0;
      currentDiffusivityA = maxPeakA > 0.01 ? (1.0 - peak / maxPeakA) * 100.0 : 0.0;
      if (massLabelA) massLabelA.textContent = `Mass: ${mass.toFixed(1)}`;
      if (dissipLabelA) dissipLabelA.textContent = `Dissip: ${currentDissipationA.toFixed(1)}%`;
      if (diffusLabelA) diffusLabelA.textContent = `Diffus: ${currentDiffusivityA.toFixed(1)}%`;
    }

    if (statsBData) {
      const mass = statsBData[0] / 1000.0;
      const peak = statsBData[13] / 1000.0;
      if (mass > maxMassB) maxMassB = mass;
      if (peak > maxPeakB) maxPeakB = peak;
      currentDissipationB = maxMassB > 1.0 ? (1.0 - mass / maxMassB) * 100.0 : 0.0;
      currentDiffusivityB = maxPeakB > 0.01 ? (1.0 - peak / maxPeakB) * 100.0 : 0.0;
      if (massLabelB) massLabelB.textContent = `Mass: ${mass.toFixed(1)}`;
      if (dissipLabelB) dissipLabelB.textContent = `Dissip: ${currentDissipationB.toFixed(1)}%`;
      if (diffusLabelB) diffusLabelB.textContent = `Diffus: ${currentDiffusivityB.toFixed(1)}%`;
    }
    isFetchingStats = false;
  }).catch(() => { isFetchingStats = false; });
}

let frameCount = 0;
let lastTime = performance.now();
let fps = 60;

function loop() {
  if (!isPaused) {
    gpuParamsA.time += 0.01;
    gpuParamsB.time += 0.01;
    if (checkAutostop && checkAutostop.checked && gpuParamsA.analytical > 0.5 && gpuParamsA.analytical < 1.5) {
      const dt = analyticalInjectionTime >= 0 ? (gpuParamsA.time - analyticalInjectionTime) : gpuParamsA.time;
      const effectiveSpeed = 0.5 * gpuParamsA.speed * gpuParamsA.uvScale;
      const revs = (effectiveSpeed * dt) / (2 * Math.PI);
      if (labelAutostopStatus) {
        labelAutostopStatus.textContent = `Rev: ${revs.toFixed(2)}`;
        labelAutostopStatus.className = 'text-[8px] font-mono text-emerald-400 uppercase';
      }
      if (revs >= 1.0) {
        isPaused = true;
        updatePlayPauseUI();
        if (labelAutostopStatus) labelAutostopStatus.textContent = "Stopped (1x)";
      }
    } else if (labelAutostopStatus) {
      labelAutostopStatus.textContent = "Ready";
      labelAutostopStatus.className = 'text-[8px] font-mono text-slate-600 uppercase';
    }
  }

  updateAnalyticalOverlay();
  gpuParamsA.mouseDirX *= 0.9;
  gpuParamsA.mouseDirY *= 0.9;
  gpuParamsB.mouseDirX *= 0.9;
  gpuParamsB.mouseDirY *= 0.9;

  simA.updatePaintTexture(paintCanvas);
  simB.updatePaintTexture(paintCanvas);

  if (currentSourceType === 'video' && videoElement.readyState >= 2) {
    if (videoElement.paused) videoElement.play().catch(() => {});
    simA.updateUVTexture(videoElement, gpuParamsA.flipv > 0.5);
    simB.updateUVTexture(videoElement, gpuParamsB.flipv > 0.5);
  } else if (currentSourceType === 'image' && imageElement.complete) {
    simA.updateUVTexture(imageElement, gpuParamsA.flipv > 0.5);
    simB.updateUVTexture(imageElement, gpuParamsB.flipv > 0.5);
  }

  const currentParamsA = { ...gpuParamsA, speed: isPaused ? 0.0 : gpuParamsA.speed };
  const currentParamsB = { ...gpuParamsB, speed: isPaused ? 0.0 : gpuParamsB.speed };
  simA.render(currentParamsA);
  simB.render(currentParamsB);

  if (!isPaused) {
    totalSteps++;
    if (stepsLabelA) stepsLabelA.textContent = `Steps: ${totalSteps}`;
    if (stepsLabelB) stepsLabelB.textContent = `Steps: ${totalSteps}`;
  }

  if (!isPersistentSource) {
    paintCtx.clearRect(0, 0, paintCanvas.width, paintCanvas.height);
  }
  
  if (frameCount % 10 === 0) updateStats();
  
  frameCount++;
  const now = performance.now();
  if (now - lastTime >= 1000) {
    fps = Math.round((frameCount * 1000) / (now - lastTime));
    frameCount = 0;
    lastTime = now;
    const fpsLabelA = statsA.children[0] as HTMLDivElement;
    if (fpsLabelA) fpsLabelA.textContent = `FPS: ${fps}`;
    const fpsLabelB = statsB.children[0] as HTMLDivElement;
    if (fpsLabelB) fpsLabelB.textContent = `FPS: ${fps}`;
  }
  requestAnimationFrame(loop);
}

async function initModels() {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/models.json`);
    const data = await res.json();
    modelsList = data.models || [];
    modelSelect.innerHTML = '';
    modelsList.forEach((m: any, idx: number) => {
      const opt = document.createElement('option');
      opt.value = idx.toString();
      opt.textContent = `${m.title} (${m.engine})`;
      modelSelect.appendChild(opt);
    });
    const circularIdx = modelsList.findIndex(m => m.title.toLowerCase().includes('circular'));
    const defaultIdx = circularIdx !== -1 ? circularIdx : 0;
    modelSelect.value = defaultIdx.toString();
    loadModel(modelsList[defaultIdx]);
  } catch (err) { console.error('Error fetching models:', err); }
}

function loadModel(model: any) {
  simA.clearTextures();
  simA.clearSource();
  simB.clearTextures();
  simB.clearSource();
  paintCtx.clearRect(0, 0, paintCanvas.width, paintCanvas.height);
  resetMassStats();
  totalSteps = 0;
  analyticalInjectionTime = -1.0;
  gpuParamsA.analytical = model.engine === 'analytical' ? (model.analyticalValue || 1.0) : 0.0;
  gpuParamsB.analytical = model.engine === 'analytical' ? (model.analyticalValue || 1.0) : 0.0;
  gpuParamsA.flipv = (model.engine === 'analytical') ? 0.0 : 1.0;
  gpuParamsB.flipv = (model.engine === 'analytical') ? 0.0 : 1.0;
  gpuParamsA.time = 0.0;
  gpuParamsB.time = 0.0;
  if (model.uniforms) {
    if (typeof model.uniforms.scale === 'number') {
      gpuParamsA.uvScale = model.uniforms.scale;
      gpuParamsB.uvScale = model.uniforms.scale;
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
  }
}

function bindEvents() {
  btnToggle.addEventListener('click', () => { isPaused = !isPaused; updatePlayPauseUI(); });
  paramBlueprintOpacity.addEventListener('input', () => {
    blueprintOpacity = parseFloat(paramBlueprintOpacity.value);
    labelBlueprintOpacity.textContent = `${Math.round(blueprintOpacity * 100)}%`;
    updateAnalyticalOverlay();
  });
  canvasA.addEventListener('mousedown', (e) => handleInteractionStart(e, canvasA));
  canvasA.addEventListener('mousemove', (e) => handleInteractionMove(e, canvasA));
  window.addEventListener('mouseup', handleInteractionEnd);
  canvasB.addEventListener('mousedown', (e) => handleInteractionStart(e, canvasB));
  canvasB.addEventListener('mousemove', (e) => handleInteractionMove(e, canvasB));
  paramSpeed.addEventListener('input', () => {
    const val = parseFloat(paramSpeed.value);
    gpuParamsA.speed = val; gpuParamsB.speed = val;
    labelSpeed.textContent = `${val.toFixed(2)}x`;
  });
  paramDecay.addEventListener('input', () => {
    const val = parseFloat(paramDecay.value);
    gpuParamsA.decay = val; gpuParamsB.decay = val;
    labelDecay.textContent = `${(val * 100).toFixed(2)}%`;
  });
  paramViscosity.addEventListener('input', () => {
    const val = parseFloat(paramViscosity.value);
    gpuParamsA.viscosity = val; gpuParamsB.viscosity = val;
    labelViscosity.textContent = val.toFixed(3);
  });
  modelSelect.addEventListener('change', () => loadModel(modelsList[parseInt(modelSelect.value)]));
  
  btnGrid.addEventListener('click', () => {
    addGrid();
    simA.updatePaintTexture(paintCanvas);
    simB.updatePaintTexture(paintCanvas);
    simA.loadPaintCanvasToSimulation(true);
    simB.loadPaintCanvasToSimulation(true);
    paintCtx.clearRect(0, 0, paintCanvas.width, paintCanvas.height);
    simA.updatePaintTexture(paintCanvas);
    simB.updatePaintTexture(paintCanvas);
  });

  btnQuivers.addEventListener('click', () => {
    addQuivers();
    simA.updatePaintTexture(paintCanvas);
    simB.updatePaintTexture(paintCanvas);
    simA.loadPaintCanvasToSimulation(true);
    simB.loadPaintCanvasToSimulation(true);
    paintCtx.clearRect(0, 0, paintCanvas.width, paintCanvas.height);
    simA.updatePaintTexture(paintCanvas);
    simB.updatePaintTexture(paintCanvas);
  });

  btnSlotted.addEventListener('click', () => {
    addSlottedCylinder();
    simA.updatePaintTexture(paintCanvas);
    simB.updatePaintTexture(paintCanvas);
    simA.loadPaintCanvasToSimulation(true);
    simB.loadPaintCanvasToSimulation(true);
    paintCtx.clearRect(0, 0, paintCanvas.width, paintCanvas.height);
    simA.updatePaintTexture(paintCanvas);
    simB.updatePaintTexture(paintCanvas);
  });

  btnClear.addEventListener('click', () => {
    simA.clearTextures(); simA.clearSource();
    simB.clearTextures(); simB.clearSource();
    paintCtx.clearRect(0, 0, paintCanvas.width, paintCanvas.height);
    resetMassStats(); totalSteps = 0; gpuParamsA.time = 0; gpuParamsB.time = 0;
    analyticalInjectionTime = -1.0; isPaused = true; updatePlayPauseUI();
    if (stepsLabelA) stepsLabelA.textContent = `Steps: 0`;
    if (stepsLabelB) stepsLabelB.textContent = `Steps: 0`;
  });

  // Populate dropdowns from schemes.json
  selectPredictor.innerHTML = '';
  schemeData.predictors.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    selectPredictor.appendChild(opt);
  });

  const updateCorrectorDropdown = () => {
    const selectedPredictorId = selectPredictor.value;
    selectCorrector.innerHTML = '';
    const compatible = schemeData.correctors.filter(c => 
      c.compatiblePredictors.includes(selectedPredictorId)
    );
    compatible.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name;
      selectCorrector.appendChild(opt);
    });
  };

  const handleSelectionChange = () => {
    const predictorId = selectPredictor.value;
    const correctorId = selectCorrector.value;
    const code = buildCustomAdvectCode(predictorId, correctorId);
    shaderEditor.value = code;

    const preset = schemeData.presets.find(p => p.predictor === predictorId && p.corrector === correctorId);
    gpuParamsB.scheme = preset ? preset.schemeId : 1.0;

    recompileShader();

    const predictor = schemeData.predictors.find(p => p.id === predictorId);
    const corrector = schemeData.correctors.find(c => c.id === correctorId);
    loadSolverDocumentation(predictor?.docs, corrector?.docs);

    // Update active scheme label in the viewport overlay
    const activeLabel = document.getElementById('active-scheme-label');
    if (activeLabel) {
      activeLabel.textContent = `${predictor?.name || predictorId} + ${corrector?.name || correctorId}`;
    }
  };

  selectPredictor.addEventListener('change', () => {
    updateCorrectorDropdown();
    handleSelectionChange();
  });

  selectCorrector.addEventListener('change', handleSelectionChange);

  applyBtn.addEventListener('click', recompileShader);
  window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'c') btnClear.click();
  });
  window.addEventListener('resize', resize);
}

async function loadSchemesData() {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/schemes.json`);
    schemeData = await res.json();
  } catch (err) {
    console.error('Error fetching schemes data:', err);
  }
}

async function start() {
  await loadSchemesData();
  
  if (selectPredictor && selectCorrector) {
    selectPredictor.value = 'semi-lagrangian';
    const selectedPredictorId = 'semi-lagrangian';
    selectCorrector.innerHTML = '';
    const compatible = schemeData.correctors.filter(c => 
      c.compatiblePredictors.includes(selectedPredictorId)
    );
    compatible.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name;
      selectCorrector.appendChild(opt);
    });
    selectCorrector.value = 'maccormack';
  }

  shaderEditor.value = presets['semi-lagrangian-maccormack'];
  const w = Math.floor(canvasA.parentElement!.clientWidth) || 800;
  const h = Math.floor(canvasA.parentElement!.clientHeight) || 600;
  const size = Math.min(w, h);
  canvasA.width = size; canvasA.height = size;
  canvasB.width = size; canvasB.height = size;
  paintCanvas.width = size * 2; paintCanvas.height = size * 2;
  await simA.init(canvasA);
  await simB.init(canvasB);
  const res = await simB.compileAdvectPipeline(presets['semi-lagrangian-maccormack']);
  if (!res.success) {
    compilerStatus.className = 'w-2 h-2 rounded-full bg-red-500';
    compilerLogs.textContent = `Compilation Error on Startup:\n${res.messages.join('\n')}`;
    throw new Error(`Failed to compile initial MacCormack shader:\n${res.messages.join('\n')}`);
  }
  resize();
  bindEvents();
  
  const initialPreset = schemeData.presets.find(p => p.id === 'semi-lagrangian-maccormack');
  const initialPred = schemeData.predictors.find(p => p.id === initialPreset?.predictor);
  const initialCorr = schemeData.correctors.find(c => c.id === initialPreset?.corrector);
  loadSolverDocumentation(initialPred?.docs, initialCorr?.docs);

  // Update active scheme label in the viewport overlay
  const activeLabel = document.getElementById('active-scheme-label');
  if (activeLabel) {
    activeLabel.textContent = `${initialPred?.name || 'Semi-Lagrangian'} + ${initialCorr?.name || 'MacCormack'}`;
  }
  
  updatePlayPauseUI();
  await initModels();
  loop();
}

start();
