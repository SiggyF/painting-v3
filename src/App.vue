<script setup lang="ts">
import { ref, onMounted, reactive, onUnmounted } from 'vue'
import L from 'leaflet'
import { WebGPULayer } from './utils/WebGPULayer'
import { useWebGPU, type GPUParams } from './composables/useWebGPU'
import ModelsOverview from './components/ModelsOverview.vue'
import ColorSelection from './components/ColorSelection.vue'
import DrawingShortcuts from './components/DrawingShortcuts.vue'

const mapContainer = ref<HTMLElement | null>(null)
const sidebarOpen = ref(true)
const drawingActive = ref(false) // Default to map navigation
const activeTab = ref('models')
const currentSourceType = ref<'video' | 'image'>('video')
const currentVideoSrc = ref('')
const currentImageSrc = ref('')
const modelsList = ref<any[]>([])
const selectedModel = ref<any>(null)
const isShiftPressed = ref(false)
const isHoldActive = ref(false)
const activePalette = ref<string[]>([])
const isColorLocked = ref(false)
const { init, render, resize, updateUVTexture, clearTextures, updateActiveColor } = useWebGPU()

const videoElement = ref<HTMLVideoElement | null>(null)
const imageElement = ref<HTMLImageElement | null>(null)
let leafletMap: L.Map | null = null

const currentTime = ref(new Date())
const updateTime = () => { currentTime.value = new Date() }
let timeInterval: any = null

const updateMapInteraction = (drawing: boolean) => {
  const canvas = gpuLayer?.getCanvas()
  if (leafletMap && canvas) {
    if (drawing) {
      leafletMap.dragging.disable()
      leafletMap.scrollWheelZoom.disable()
      leafletMap.doubleClickZoom.disable()
      leafletMap.boxZoom.disable()
      canvas.style.pointerEvents = 'auto'
      canvas.style.cursor = 'crosshair'
    } else {
      leafletMap.dragging.enable()
      leafletMap.scrollWheelZoom.enable()
      leafletMap.doubleClickZoom.enable()
      leafletMap.boxZoom.enable()
      canvas.style.pointerEvents = 'none'
      canvas.style.cursor = 'default'
    }
  }
}

const toggleDrawing = () => {
  drawingActive.value = !drawingActive.value
  updateMapInteraction(drawingActive.value || isShiftPressed.value || isHoldActive.value)
}

const handleMouseDown = (e: MouseEvent) => {
  const drawing = drawingActive.value || isShiftPressed.value || isHoldActive.value
  if (!drawing) return
  gpuParams.isDrawing = 1.0
  console.log('Interaction: Start Drawing')
  updateMousePosition(e)
}

const handleMouseMove = (e: MouseEvent) => {
  if (gpuParams.isDrawing > 0.5) {
    updateMousePosition(e)
  }
}

const updateMousePosition = (e: MouseEvent) => {
  const canvas = gpuLayer?.getCanvas()
  if (canvas) {
    const rect = canvas.getBoundingClientRect()
    
    if (rect.width <= 0 || rect.height <= 0) return

    const nx = (e.clientX - rect.left) / rect.width
    const ny = (e.clientY - rect.top) / rect.height
    
    if (gpuParams.mouseX !== -1.0) {
      gpuParams.mouseDirX = nx - gpuParams.mouseX
      gpuParams.mouseDirY = ny - gpuParams.mouseY
    }
    gpuParams.mouseX = nx
    gpuParams.mouseY = ny
  }
}

const handleMouseUp = () => {
  if (gpuParams.isDrawing > 0.5) console.log('Interaction: Stop Drawing')
  gpuParams.isDrawing = 0.0
  gpuParams.mouseX = -1.0
}

const getSourceUrl = (src: string) => {
  if (!src) return ''
  const cleanSrc = src.startsWith('/') ? src.slice(1) : src
  const path = `${import.meta.env.BASE_URL}${cleanSrc}`
  if (path.endsWith('.webm')) {
    return path.replace('.webm', '.mp4')
  }
  return path
}

const handleModelSelect = (model: any) => {
  console.log('Selected Model:', model.title)
  selectedModel.value = model
  
  if (model.uniforms) {
    if (typeof model.uniforms.scale === 'number') {
      gpuParams.uvScale = model.uniforms.scale
    }
    if (typeof model.uniforms.flipv === 'boolean') {
      gpuParams.flipv = model.uniforms.flipv ? 1.0 : 0.0
    }
    if (typeof model.uniforms.decay === 'number') {
      gpuParams.decay = model.uniforms.decay
    }
  }

  if (leafletMap) {
    if (model.view?.center && Array.isArray(model.view.center)) {
      leafletMap.setView(model.view.center as [number, number], model.view.zoom || 10)
    } else if (model.extent?.sw && model.extent?.ne) {
      const sw = model.extent.sw
      const ne = model.extent.ne
      const centerLat = (sw[0] + ne[0]) / 2
      const centerLng = (sw[1] + ne[1]) / 2
      leafletMap.setView([centerLat, centerLng], model.view?.zoom || 10)
    }
  }

  if (gpuLayer && model.extent?.sw && model.extent?.ne) {
    const sw = L.latLng(model.extent.sw[0], model.extent.sw[1])
    const ne = L.latLng(model.extent.ne[0], model.extent.ne[1])
    gpuLayer.setBounds(L.latLngBounds(sw, ne))
  }

  const tag = model.uv?.tag || 'video'
  if (tag === 'img' || tag === 'image') {
    currentSourceType.value = 'image'
    currentImageSrc.value = getSourceUrl(model.uv?.src || '')
    currentVideoSrc.value = ''
  } else {
    currentSourceType.value = 'video'
    currentVideoSrc.value = getSourceUrl(model.uv?.src || '')
    currentImageSrc.value = ''
    
    if (videoElement.value) {
      videoElement.value.load()
      videoElement.value.play().catch(e => console.warn('Video play failed:', e))
    }
  }
}

const gpuParams = reactive<GPUParams>({
  speed: 0.08,
  blend: 0.04,
  time: 0.0,
  aspect: 1.0,
  scale: 4.0,
  mouseX: -1.0,
  mouseY: -1.0,
  isDrawing: 0.0,
  mouseDirX: 0.0,
  mouseDirY: 0.0,
  uvScale: 1.6, // Slowed down by ~5x (from 8.0)
  flipv: 1.0,
  mouseRadius: 0.02,
  decay: 0.999
})

let gpuLayer: WebGPULayer | null = null
let animationFrameId: number | null = null

onMounted(() => {
  timeInterval = setInterval(updateTime, 1000)
  if (mapContainer.value) {
    leafletMap = L.map(mapContainer.value, {
      zoomControl: false,
      attributionControl: false
    }).setView([53.4443, 5.6841], 11)
    
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      maxZoom: 20
    }).addTo(leafletMap)

    gpuLayer = new WebGPULayer()
    gpuLayer.addTo(leafletMap)

    const canvas = gpuLayer.getCanvas()
    if (canvas) {
      init(canvas).then(() => {
        gpuParams.aspect = canvas.width / canvas.height
        // Explicitly set initial state: Map navigation active
        leafletMap!.dragging.enable()
        canvas.style.pointerEvents = 'none'
        canvas.style.cursor = 'default'
        
        startLoop()
        fetchModels()
      })

      window.addEventListener('mousedown', handleMouseDown)
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)

      window.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.shiftKey && !isShiftPressed.value) {
          isShiftPressed.value = true
          updateMapInteraction(true)
        }
        if (e.key.toLowerCase() === 'c') {
          console.log('Interaction: Clear Canvas')
          clearTextures()
        }
        if (e.key.toLowerCase() === 'p') console.log('Pause requested')
        if (e.key.toLowerCase() === 's') sidebarOpen.value = !sidebarOpen.value
        if (e.key.toLowerCase() === 'b') toggleDrawing()
      })

      window.addEventListener('keyup', (e: KeyboardEvent) => {
        if (e.key === 'Shift') {
          isShiftPressed.value = false
          if (!drawingActive.value && !isHoldActive.value) {
            updateMapInteraction(false)
            gpuParams.isDrawing = 0.0
          }
        }
      })
    }

    gpuLayer.on('canvas-resize', (e: any) => {
      resize(e.width, e.height)
      gpuParams.aspect = e.width / e.height
    })
  }
})

const fetchModels = async () => {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}data/models.json`)
    const data = await response.json()
    modelsList.value = (data.models || []).map((model: any) => {
      const colors = ['38bdf8', '10b981', 'f43f5e', 'a855f7', 'f59e0b', '06b6d4', 'ec4899']
      let hash = 0
      for (let i = 0; i < model.title.length; i++) {
        hash = model.title.charCodeAt(i) + ((hash << 5) - hash)
      }
      const color = colors[Math.abs(hash) % colors.length]
      const initials = model.title.trim().split(/\s+/).map((w: string) => w[0]).join('').substring(0, 2).toUpperCase()
      
      return {
        ...model,
        summary: model.abstract || model.engine || 'Simulation model',
        icon: `https://placehold.co/100x100/1e293b/${color}?text=${initials}`
      }
    })

    if (modelsList.value.length > 0) {
      handleModelSelect(modelsList.value[0])
    }
  } catch (err) {
    console.error('Error loading models:', err)
  }
}

let colorFrameCount = 0
function startLoop() {
  const frame = () => {
    gpuParams.time += 0.01
    gpuParams.mouseDirX *= 0.9
    gpuParams.mouseDirY *= 0.9
    
    // Auto-cycle palette if drawing and not locked to a specific color
    if (gpuParams.isDrawing > 0.5 && activePalette.value.length > 0 && !isColorLocked.value) {
      colorFrameCount++
      if (colorFrameCount % 8 === 0) { // Switch every 8 frames for a "painterly" feel
        const randomColor = activePalette.value[Math.floor(Math.random() * activePalette.value.length)]
        updateActiveColor(randomColor)
      }
    }

    if (currentSourceType.value === 'video' && videoElement.value && videoElement.value.readyState >= 2) {
      if (videoElement.value.paused) videoElement.value.play().catch(() => {})
      updateUVTexture(videoElement.value)
    } else if (currentSourceType.value === 'image' && imageElement.value && imageElement.value.complete) {
      updateUVTexture(imageElement.value)
    }
    
    render(gpuParams)
    animationFrameId = requestAnimationFrame(frame)
  }
  frame()
}

onUnmounted(() => {
  if (animationFrameId) cancelAnimationFrame(animationFrameId)
  if (timeInterval) clearInterval(timeInterval)
  window.removeEventListener('mousedown', handleMouseDown)
  window.removeEventListener('mousemove', handleMouseMove)
  window.removeEventListener('mouseup', handleMouseUp)
})
</script>

<template>
  <div 
    class="relative w-screen h-screen overflow-hidden bg-slate-950 font-sans selection:bg-sky-500/30"
    :class="drawingActive ? 'cursor-crosshair' : 'cursor-default'"
  >
    <!-- Base Layer: Map -->
    <div ref="mapContainer" class="absolute inset-0 z-0"></div>

    <!-- Hidden Video Source -->
    <video 
      ref="videoElement" 
      class="hidden"
      autoplay 
      loop 
      muted 
      playsinline 
      crossorigin="anonymous"
      :src="currentVideoSrc"
    ></video>

    <!-- Hidden Image Source -->
    <img 
      ref="imageElement" 
      class="hidden"
      crossorigin="anonymous"
      :src="currentImageSrc"
    />

    <!-- UI Overlay: Floating Panels -->
    <div class="absolute inset-0 z-20 pointer-events-none flex flex-col">
      
      <!-- Top Header / Controls -->
      <div class="p-6 flex justify-between items-start pointer-events-none">
        <div class="flex items-start gap-4 pointer-events-auto">
          <!-- Clock Widget -->
          <div class="glass-panel px-5 py-3 rounded-xl shadow-2xl ring-1 ring-white/10 flex items-center gap-4 bg-slate-900/40 backdrop-blur-md">
            <div class="text-right">
              <p class="text-[18px] font-mono font-bold text-white tracking-tighter leading-none">
                {{ currentTime.toLocaleTimeString([], { hour12: false }) }}
              </p>
              <p class="text-[9px] uppercase tracking-[0.2em] text-sky-400/80 font-bold">
                {{ currentTime.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' }) }}
              </p>
            </div>
            <div class="w-px h-8 bg-white/10"></div>
            <div class="flex flex-col gap-0.5">
               <div class="flex gap-1 items-center">
                  <span class="w-1 h-1 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span class="text-[7px] font-mono text-emerald-500/80 uppercase">GPS: 53.44N, 5.68E</span>
               </div>
               <div class="text-[7px] font-mono text-slate-500 uppercase flex gap-2">
                  <span>FPS: 60.0</span>
                  <span>MS: 16.6</span>
               </div>
            </div>
            <div class="w-px h-8 bg-white/10"></div>
            <div class="w-8 h-8 rounded-lg bg-sky-500/10 flex items-center justify-center border border-sky-500/20">
               <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-sky-400"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            </div>
          </div>

          <div class="glass-panel p-4 rounded-xl flex items-center gap-4 shadow-2xl ring-1 ring-white/10">
            <div class="w-8 h-8 rounded-lg bg-sky-500 flex items-center justify-center shadow-lg shadow-sky-500/20">
               <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-white"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path></svg>
            </div>
            <div>
              <h1 class="text-sm font-bold text-white tracking-tight leading-tight">
                <span class="hidden sm:inline">Hold <span class="text-sky-400">SHIFT</span> + DRAG to Paint</span>
                <span class="sm:hidden">Hold <span class="text-sky-400">BUTTON</span> + DRAG to Paint</span>
              </h1>
              <p class="text-[9px] uppercase tracking-[0.2em] text-slate-500 font-bold mt-0.5">Hydrodynamic Flow Engine</p>
            </div>
          </div>
        </div>

        <div class="flex flex-col gap-4 items-end">
          <button 
            @click="sidebarOpen = !sidebarOpen"
            class="glass-panel px-4 py-2.5 rounded-full pointer-events-auto hover:bg-slate-800/80 transition-all flex items-center gap-2 ring-1 ring-white/10 shadow-xl group"
          >
            <span class="w-2 h-2 rounded-full bg-sky-500 animate-pulse"></span>
            <span class="text-sm font-medium text-slate-200 group-hover:text-white">{{ sidebarOpen ? 'Close Settings' : 'Simulation Settings' }}</span>
          </button>

          <transition name="fade">
            <div v-if="sidebarOpen" class="glass-panel rounded-2xl w-80 pointer-events-auto shadow-2xl ring-1 ring-white/10 overflow-hidden">
              <!-- Tabs -->
              <div class="flex border-b border-white/5 bg-white/5">
                <button 
                  v-for="tab in ['models', 'rendering', 'keys']" 
                  :key="tab"
                  @click="activeTab = tab"
                  class="flex-1 py-3 text-[10px] font-bold uppercase tracking-widest transition-colors"
                  :class="activeTab === tab ? 'text-sky-400 bg-white/5' : 'text-slate-500 hover:text-slate-300'"
                >
                  {{ tab }}
                </button>
              </div>

              <div class="p-5 max-h-[60vh] overflow-y-auto custom-scrollbar">
                <div v-if="activeTab === 'models'" class="space-y-4">
                  <h2 class="text-[10px] font-bold uppercase text-slate-500 tracking-[0.15em] mb-2">Available Domains</h2>
                  <ModelsOverview :models="modelsList" @select="handleModelSelect" />

                  <!-- Flow Source Debug Section -->
                  <div class="mt-6 pt-4 border-t border-white/5">
                    <h2 class="text-[10px] font-bold uppercase text-slate-500 tracking-[0.15em] mb-3">Flow Source Debug</h2>
                    <div class="aspect-video w-full rounded-lg bg-black border border-white/10 overflow-hidden relative group">
                      <video 
                        v-if="currentSourceType === 'video' && currentVideoSrc"
                        :src="currentVideoSrc"
                        autoplay loop muted playsinline
                        class="w-full h-full object-contain opacity-50 group-hover:opacity-100 transition-opacity"
                      ></video>
                      <img 
                        v-else-if="currentSourceType === 'image' && currentImageSrc"
                        :src="currentImageSrc"
                        class="w-full h-full object-contain opacity-50 group-hover:opacity-100 transition-opacity"
                      />
                      <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
                         <span class="text-[8px] text-sky-400 font-mono bg-black/40 px-2 py-1 rounded">
                           {{ currentSourceType === 'video' ? 'LIVE UV FIELD (VIDEO)' : 'STATIC UV FIELD (IMAGE)' }}
                         </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div v-if="activeTab === 'rendering'" class="space-y-6">
                  <div>
                    <h2 class="text-[10px] font-bold uppercase text-slate-500 tracking-[0.15em] mb-4">Fluid Viscosity</h2>
                    <div class="flex justify-between text-[11px] mb-2 text-slate-400 font-mono">
                      <span>Trail Blend</span>
                      <span class="text-sky-400">{{ gpuParams.blend.toFixed(3) }}</span>
                    </div>
                    <input 
                      type="range" 
                      v-model.number="gpuParams.blend" 
                      min="0.005" max="0.1" step="0.005"
                      class="w-full"
                    >
                  </div>

                  <div>
                    <h2 class="text-[10px] font-bold uppercase text-slate-500 tracking-[0.15em] mb-4">Brush Settings</h2>
                    <div class="flex justify-between text-[11px] mb-2 text-slate-400 font-mono">
                      <span>Brush Size</span>
                      <span class="text-sky-400">{{ (gpuParams.mouseRadius * 100).toFixed(1) }}%</span>
                    </div>
                    <input 
                      type="range" 
                      v-model.number="gpuParams.mouseRadius" 
                      min="0.002" max="0.08" step="0.002"
                      class="w-full"
                    >
                  </div>

                  <div>
                    <h2 class="text-[10px] font-bold uppercase text-slate-500 tracking-[0.15em] mb-4">Color Palette</h2>
                    <ColorSelection 
                      @update:color="(c) => { updateActiveColor(c); isColorLocked = true }" 
                      @update:palette="(p) => { activePalette = p; isColorLocked = false }"
                    />
                  </div>
                </div>

                <div v-if="activeTab === 'keys'" class="space-y-4">
                  <h2 class="text-[10px] font-bold uppercase text-slate-500 tracking-[0.15em] mb-4">Interaction Keys</h2>
                  <DrawingShortcuts />
                </div>
              </div>
              
              <div class="p-4 bg-sky-500/5 border-t border-white/5">
                <p class="text-[9px] text-slate-500 leading-relaxed italic text-center">
                  WebGPU 1.0 Pipeline • Subtractive RYB Mixing
                </p>
              </div>
            </div>
          </transition>
        </div>
      </div>

      <!-- Bottom Mobile Modifier Button -->
      <div class="absolute bottom-10 left-10 z-30 pointer-events-auto sm:hidden">
        <button 
          @touchstart.prevent="isHoldActive = true; updateMapInteraction(true)"
          @touchend.prevent="isHoldActive = false; updateMapInteraction(drawingActive); gpuParams.isDrawing = 0.0"
          @mousedown="isHoldActive = true; updateMapInteraction(true)"
          @mouseup="isHoldActive = false; updateMapInteraction(drawingActive); gpuParams.isDrawing = 0.0"
          class="w-20 h-20 rounded-full glass-panel flex flex-col items-center justify-center gap-1 shadow-2xl ring-1 ring-white/20 transition-all active:scale-90 select-none"
          :class="isHoldActive ? 'bg-sky-500/40 ring-sky-400' : 'bg-slate-900/60'"
        >
          <div :class="isHoldActive ? 'text-white' : 'text-sky-400'">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"></path><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path><path d="M2 2l7.586 7.586"></path><circle cx="11" cy="11" r="2"></circle></svg>
          </div>
          <span class="text-[8px] font-bold uppercase tracking-tighter" :class="isHoldActive ? 'text-white' : 'text-slate-400'">Hold to Paint</span>
        </button>
      </div>

      <!-- Bottom Panel (Domain Details) -->
      <div class="mt-auto p-6 pointer-events-none flex justify-center">
        <div v-if="selectedModel" class="glass-panel p-5 rounded-2xl w-full max-w-3xl pointer-events-auto shadow-2xl ring-1 ring-white/10 flex gap-6">
          <div class="flex-1 col-span-2">
             <h2 class="text-[10px] font-bold uppercase text-sky-400 tracking-widest border-b border-white/5 pb-2 mb-3 flex items-center gap-2">
                <span class="w-1.5 h-1.5 rounded-full bg-sky-400"></span>
                Domain Information
             </h2>
             <div class="space-y-2">
                <div>
                   <h3 class="text-sm font-semibold text-slate-200">{{ selectedModel.title }}</h3>
                   <p class="text-xs text-slate-400 leading-relaxed">{{ selectedModel.abstract || 'No description available' }}</p>
                </div>
                <div v-if="selectedModel.extent?.time" class="flex gap-4 pt-2 text-[10px] uppercase text-slate-500">
                   <div>
                      <span class="block text-slate-600">Start Time</span>
                      <span class="text-slate-300 font-mono">{{ new Date(selectedModel.extent.time[0]).toUTCString() }}</span>
                   </div>
                   <div>
                      <span class="block text-slate-600">End Time</span>
                      <span class="text-slate-300 font-mono">{{ new Date(selectedModel.extent.time[1]).toUTCString() }}</span>
                   </div>
                </div>
             </div>
          </div>
          <div class="w-px bg-white/5"></div>
          <div class="w-48 flex flex-col justify-center">
             <div class="text-[10px] uppercase text-slate-500 tracking-widest mb-1">Domain Engine</div>
             <div class="text-md font-bold text-slate-200 truncate">{{ selectedModel.engine || 'WebGPU' }}</div>
             <div class="mt-4 pt-4 border-t border-white/5 space-y-2">
                <div class="flex justify-between text-[9px] uppercase text-slate-500">
                   <span>Particles</span>
                   <span class="text-sky-400 font-mono">1.2M</span>
                </div>
                <div class="flex justify-between text-[9px] uppercase text-slate-500">
                   <span>Compute</span>
                   <span class="text-sky-400 font-mono">1.4ms</span>
                </div>
             </div>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<style>
.leaflet-container {
  width: 100%;
  height: 100%;
  background: #020617 !important;
}

.fade-enter-active,
.fade-leave-active {
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-20px) scale(0.95);
  filter: blur(10px);
}

.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 10px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(56, 189, 248, 0.3);
}

input[type=range] {
  -webkit-appearance: none;
  background: transparent;
  cursor: pointer;
}

input[type=range]::-webkit-slider-runnable-track {
  width: 100%;
  height: 2px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 1px;
}

input[type=range]::-webkit-slider-thumb {
  -webkit-appearance: none;
  height: 12px;
  width: 12px;
  border-radius: 50%;
  background: #38bdf8;
  box-shadow: 0 0 10px rgba(56, 189, 248, 0.5);
  margin-top: -5px;
  transition: all 0.2s;
}

input[type=range]:hover::-webkit-slider-thumb {
  transform: scale(1.2);
  background: #7dd3fc;
}
</style>
