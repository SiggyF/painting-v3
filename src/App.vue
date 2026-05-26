<script setup lang="ts">
import { ref, onMounted, reactive, onUnmounted, computed } from 'vue'
import L from 'leaflet'
import { WebGPULayer } from './utils/WebGPULayer'
import { useWebGPU, type GPUParams } from './composables/useWebGPU'
import ModelsOverview from './components/ModelsOverview.vue'
import ColorSelection from './components/ColorSelection.vue'
import DrawingShortcuts from './components/DrawingShortcuts.vue'
import ImageStamps from './components/ImageStamps.vue'

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
const isQPressed = ref(true)
const isGPressed = ref(false)
const isHoldActive = ref(false)
const activePalette = ref<string[]>(['#00A0B0', '#6A4A3C', '#CC333F', '#EB6841', '#EDC951'])
const isColorLocked = ref(false)
const isPersistentSource = ref(true) // New: Sticky paint sources
let initialQuiversInjected = false
const activeStampUrl = ref<string | null>(null)
const activeStampImage = ref<HTMLImageElement | null>(null)

const handleSelectStamp = (url: string) => {
  activeStampUrl.value = url
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = () => {
    activeStampImage.value = img
    drawingActive.value = true
    updateMapInteraction(true)
  }
  img.src = url
}

const handleClearStamp = () => {
  activeStampUrl.value = null
  activeStampImage.value = null
  drawingActive.value = false
  updateMapInteraction(false)
}

const handleSelectPainting = (url: string) => {
  console.log('Throwing painting in the water:', url)
  clearTextures()
  clearSource()
  resetMassStats()
  if (paintCtx) {
    paintCtx.clearRect(0, 0, paintCanvas.width, paintCanvas.height)
  }
  
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = () => {
    if (paintCtx) {
      // Draw painting onto our supersampled 2D paint canvas
      paintCtx.drawImage(img, 0, 0, paintCanvas.width, paintCanvas.height)
      
      // Upload the paint canvas to WebGPU immediately
      updatePaintTexture(paintCanvas)

      // Copy paintTex directly to simulation textures to initialize state at 100% opacity
      // Use true to CLEAR existing state when throwing a new painting
      loadPaintCanvasToSimulation(true)

      // Clear 2D paint canvas if not in "Sticky" mode so it doesn't continually add paint
      if (!isPersistentSource.value) {
        paintCtx.clearRect(0, 0, paintCanvas.width, paintCanvas.height)
        updatePaintTexture(paintCanvas)
      }
    }
  }
  img.src = url
}

const { init, render, resize, updateUVTexture, updatePaintTexture, clearTextures, clearSource, updateActiveColor, activeColor, loadPaintCanvasToSimulation, getStats } = useWebGPU()

const videoElement = ref<HTMLVideoElement | null>(null)
const imageElement = ref<HTMLImageElement | null>(null)
const paintCanvas = document.createElement('canvas')
const paintCtx = paintCanvas.getContext('2d')
let leafletMap: L.Map | null = null

const currentTime = ref(new Date())
const updateTime = () => { currentTime.value = new Date() }
let timeInterval: any = null

const videoProgress = ref(0) // Reactive progress for clock sync

// Initialize active color to match Ocean Five default
onMounted(() => {
  updateActiveColor('#00A0B0')
})

const modelTime = computed(() => {
  if (!selectedModel.value || !selectedModel.value.extent?.time) return currentTime.value
  
  const start = new Date(selectedModel.value.extent.time[0]).getTime()
  const end = new Date(selectedModel.value.extent.time[1]).getTime()
  
  // Use the reactive videoProgress updated in the render loop
  return new Date(start + (end - start) * videoProgress.value)
})

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

const addGrid = () => {
  if (!paintCtx) return
  const w = paintCanvas.width
  const h = paintCanvas.height
  const step = w / 16
  paintCtx.strokeStyle = 'white'
  paintCtx.lineWidth = 0.8
  for (let x = 0; x <= w; x += step) {
    paintCtx.beginPath(); paintCtx.moveTo(x, 0); paintCtx.lineTo(x, h); paintCtx.stroke()
  }
  for (let y = 0; y <= h; y += step) {
    paintCtx.beginPath(); paintCtx.moveTo(0, y); paintCtx.lineTo(w, y); paintCtx.stroke()
  }
}

const addQuivers = () => {
  if (!paintCtx) return
  const w = paintCanvas.width
  const h = paintCanvas.height
  // Reduced radius (now 3.0, 2x bigger than 1.5)
  const radius = 3.0 
  paintCtx.fillStyle = 'white'
  for (let i = 0; i < 200; i++) {
    const x = Math.random() * w
    const y = Math.random() * h
    paintCtx.beginPath()
    paintCtx.arc(x, y, radius, 0, Math.PI * 2)
    paintCtx.fill()
  }
}

const injectPattern = (type: 'grid' | 'quivers') => {
  if (type === 'grid') addGrid()
  else addQuivers()
  
  // 1. Upload to GPU
  updatePaintTexture(paintCanvas)
  
  // 2. Additive Splash into simulation state
  loadPaintCanvasToSimulation(false) 
  
  // NOTE: We no longer clear here. The startLoop() render function 
  // will handle clearing based on isPersistentSource.value.
}

const toggleDrawing = () => {
  drawingActive.value = !drawingActive.value
  updateMapInteraction(drawingActive.value || isShiftPressed.value || isHoldActive.value)
}

let moveTimeout: any = null
const lastMousePos = { x: -1, y: -1 }
const lastStampPos = { x: -1, y: -1 }

const drawToPaintCanvas = (nx: number, ny: number) => {
  if (!paintCtx) return
  const w = paintCanvas.width
  const h = paintCanvas.height
  const r = gpuParams.mouseRadius * w
  
  const color = `rgb(${activeColor.value[0]*255}, ${activeColor.value[1]*255}, ${activeColor.value[2]*255})`
  
  paintCtx.beginPath()
  if (lastMousePos.x !== -1) {
    paintCtx.moveTo(lastMousePos.x * w, lastMousePos.y * h)
    paintCtx.lineTo(nx * w, ny * h)
    paintCtx.strokeStyle = color
    paintCtx.lineWidth = r * 2
    paintCtx.lineCap = 'round'
    paintCtx.lineJoin = 'round'
    paintCtx.stroke()
  } else {
    paintCtx.arc(nx * w, ny * h, r, 0, Math.PI * 2)
    paintCtx.fillStyle = color
    paintCtx.fill()
  }
  
  lastMousePos.x = nx
  lastMousePos.y = ny
}

const stampImageAtMouse = (e: MouseEvent, isMove = false) => {
  if (!paintCtx || !activeStampImage.value) return
  const canvas = gpuLayer?.getCanvas()
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const nx = (e.clientX - rect.left) / rect.width
  const ny = (e.clientY - rect.top) / rect.height

  const w = paintCanvas.width
  const h = paintCanvas.height
  
  const stampWidth = gpuParams.mouseRadius * w * 25
  const stampHeight = stampWidth * (activeStampImage.value.height / activeStampImage.value.width)
  
  if (isMove && lastStampPos.x !== -1) {
    const dx = (nx - lastStampPos.x) * w
    const dy = (ny - lastStampPos.y) * h
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < stampWidth * 0.4) return
  }

  const x = nx * w - stampWidth / 2
  const y = ny * h - stampHeight / 2

  // Colorize stamp with active color using an offscreen canvas
  const color = `rgb(${activeColor.value[0]*255}, ${activeColor.value[1]*255}, ${activeColor.value[2]*255})`
  const sw_int = Math.ceil(stampWidth)
  const sh_int = Math.ceil(stampHeight)
  const offscreen = document.createElement('canvas')
  offscreen.width = sw_int
  offscreen.height = sh_int
  const octx = offscreen.getContext('2d')
  if (octx) {
    octx.drawImage(activeStampImage.value, 0, 0, sw_int, sh_int)
    octx.globalCompositeOperation = 'source-in'
    octx.fillStyle = color
    octx.fillRect(0, 0, sw_int, sh_int)
  }
  
  paintCtx.drawImage(offscreen, x, y, stampWidth, stampHeight)
  
  lastStampPos.x = nx
  lastStampPos.y = ny
}

const handleMouseDown = (e: MouseEvent) => {
  // Classic drag painting (if mode active)
  if (drawingActive.value) {
    gpuParams.isDrawing = 1.0
    updateMousePosition(e)
    if (activeStampImage.value) {
      stampImageAtMouse(e, false)
    }
  }
}

const handleMouseMove = (e: MouseEvent) => {
  const seamless = isShiftPressed.value || isHoldActive.value
  const drawing = drawingActive.value || seamless
  
  if (drawing) {
    gpuParams.isDrawing = 1.0
    updateMousePosition(e)
    
    // Draw to 2D paint canvas
    const canvas = gpuLayer?.getCanvas()
    if (canvas) {
      if (activeStampImage.value) {
        stampImageAtMouse(e, true)
      } else {
        const rect = canvas.getBoundingClientRect()
        const nx = (e.clientX - rect.left) / rect.width
        const ny = (e.clientY - rect.top) / rect.height
        drawToPaintCanvas(nx, ny)
      }
    }
    
    // For seamless (Shift-move / Hold-button), stop painting when movement stops
    if (seamless) {
      if (moveTimeout) clearTimeout(moveTimeout)
      moveTimeout = setTimeout(() => {
        if (!drawingActive.value) {
          gpuParams.isDrawing = 0.0
          lastMousePos.x = -1
          lastMousePos.y = -1
          lastStampPos.x = -1
          lastStampPos.y = -1
        }
      }, 50)
    }
  } else {
    lastMousePos.x = -1
    lastMousePos.y = -1
    lastStampPos.x = -1
    lastStampPos.y = -1
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
  lastMousePos.x = -1
  lastMousePos.y = -1
  lastStampPos.x = -1
  lastStampPos.y = -1
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
  
  // Clear textures and source when switching models
  clearTextures()
  clearSource()
  resetMassStats()
  if (paintCtx) {
    paintCtx.clearRect(0, 0, paintCanvas.width, paintCanvas.height)
  }

  // Set safe defaults before loading uniforms
  gpuParams.analytical = model.engine === 'analytical' ? 1.0 : 0.0
  gpuParams.flipv = (model.engine === 'analytical') ? 0.0 : 1.0; 
  
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
  }
}

const gpuParams = reactive<GPUParams>({
  speed: 0.16,
  blend: 0.0,
  time: 0.0,
  aspect: 1.0,
  scale: 16.0,
  mouseX: -1.0,
  mouseY: -1.0,
  isDrawing: 0.0,
  mouseDirX: 0.0,
  mouseDirY: 0.0,
  uvScale: 1.6, // Slowed down by ~5x (from 8.0)
  flipv: 1.0,
  mouseRadius: 0.005,
  decay: 0.98,
  viscosity: 0.0,
  scheme: 0.0,
  analytical: 0.0
})

let gpuLayer: WebGPULayer | null = null
let animationFrameId: number | null = null

let maxMass = 0
let maxPeak = 0
let currentDissipation = 0
let currentDiffusivity = 0
let isFetchingStats = false

const updateMainStats = () => {
  if (isFetchingStats) return
  isFetchingStats = true

  getStats().then(statsData => {
    if (statsData) {
      const mass = statsData[0] / 1000.0
      const peak = statsData[12] / 1000.0
      
      if (mass > maxMass) maxMass = mass
      if (peak > maxPeak) maxPeak = peak
      
      currentDissipation = maxMass > 1.0 ? (1.0 - mass / maxMass) * 100.0 : 0.0
      currentDiffusivity = maxPeak > 0.01 ? (1.0 - peak / maxPeak) * 100.0 : 0.0
      
      const statsEl = document.getElementById('main-stats')
      if (statsEl) {
        const massLabel = statsEl.children[1] as HTMLDivElement
        const dissipLabel = statsEl.children[2] as HTMLDivElement
        const diffusLabel = statsEl.children[3] as HTMLDivElement
        if (massLabel) massLabel.textContent = `Mass: ${mass.toFixed(1)}`
        if (dissipLabel) dissipLabel.textContent = `Dissip: ${currentDissipation.toFixed(1)}%`
        if (diffusLabel) diffusLabel.textContent = `Diffus: ${currentDiffusivity.toFixed(1)}%`
      }
    }
    isFetchingStats = false
  }).catch(() => {
    isFetchingStats = false
  })
}

const resetMassStats = () => {
  maxMass = 0
  maxPeak = 0
  currentDissipation = 0
  currentDiffusivity = 0
  const statsEl = document.getElementById('main-stats')
  if (statsEl) {
    const massLabel = statsEl.children[1] as HTMLDivElement
    const dissipLabel = statsEl.children[2] as HTMLDivElement
    const diffusLabel = statsEl.children[3] as HTMLDivElement
    if (massLabel) massLabel.textContent = `Mass: 0.0`
    if (dissipLabel) dissipLabel.textContent = `Dissip: 0.0%`
    if (diffusLabel) diffusLabel.textContent = `Diffus: 0.0%`
  }
}

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
      canvas.style.mixBlendMode = 'screen'
      init(canvas).then(async () => {
        gpuParams.aspect = canvas.width / canvas.height
        // Explicitly set initial state: Map navigation active
        leafletMap!.dragging.enable()
        canvas.style.pointerEvents = 'none'
        canvas.style.cursor = 'default'
        
        startLoop()
        await fetchModels()
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
          clearSource()
          resetMassStats()
          if (paintCtx) {
            paintCtx.clearRect(0, 0, paintCanvas.width, paintCanvas.height)
            updatePaintTexture(paintCanvas)
          }
        }
        if (e.key.toLowerCase() === 'q') {
          console.log('Interaction: Add Quivers')
          injectPattern('quivers')
        }
        if (e.key.toLowerCase() === 'g') {
          console.log('Interaction: Add Grid')
          injectPattern('grid')
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
      const wasZero = paintCanvas.width === 0;
      
      resize(e.width, e.height)
      gpuParams.aspect = e.width / e.height
      
      // Higher resolution for paint source (2x supersampling)
      paintCanvas.width = e.width * 2
      paintCanvas.height = e.height * 2

      // Perform initial injection once we have valid dimensions
      if (wasZero || !initialQuiversInjected) {
        injectPattern('quivers')
        initialQuiversInjected = true
      }
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
      
      // Update reactive progress for clock
      if (videoElement.value.duration > 0) {
        videoProgress.value = videoElement.value.currentTime / videoElement.value.duration
      }
    } else if (currentSourceType.value === 'image' && imageElement.value && imageElement.value.complete) {
      updateUVTexture(imageElement.value)
      videoProgress.value = (gpuParams.time % 10.0) / 10.0 // Loop dummy progress for static images
    }

    // Upload 2D paint canvas to WebGPU
    updatePaintTexture(paintCanvas)
    
    render(gpuParams)

    // Update stats overlay periodically
    if (Math.floor(gpuParams.time * 100) % 10 === 0) {
      updateMainStats()
    }

    // Clear 2D paint canvas if not in "Sticky" mode
    if (!isPersistentSource.value && paintCtx) {
      paintCtx.clearRect(0, 0, paintCanvas.width, paintCanvas.height)
    }

    // Update FPS label in stats overlay
    const now = performance.now()
    if (now - lastTime >= 1000) {
      const fps = Math.round((frameCount * 1000) / (now - lastTime))
      frameCount = 0
      lastTime = now
      const statsEl = document.getElementById('main-stats')
      if (statsEl) {
        const fpsLabel = statsEl.children[0] as HTMLDivElement
        if (fpsLabel) fpsLabel.textContent = `FPS: ${fps}`
      }
    }
    frameCount++

    animationFrameId = requestAnimationFrame(frame)
  }
  let frameCount = 0
  let lastTime = performance.now()
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

    <!-- Stats Overlay -->
    <div class="absolute top-24 left-6 z-20 pointer-events-none">
      <div id="main-stats" class="glass-panel px-2.5 py-1.5 rounded-lg border border-white/10 text-[10px] font-mono text-slate-400 backdrop-blur flex flex-col gap-0.5 min-w-20">
        <div>FPS: --</div>
        <div>Mass: --</div>
        <div>Dissip: --%</div>
        <div>Diffus: --%</div>
      </div>
    </div>

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
      <div class="p-4 sm:p-6 flex justify-between items-start pointer-events-none">
        <div class="flex items-start gap-3 sm:gap-4 pointer-events-auto">
          <!-- Clock Widget -->
          <div class="glass-panel p-3 sm:p-4 rounded-xl shadow-2xl ring-1 ring-white/10 flex items-center gap-3 sm:gap-4 bg-slate-900/40 backdrop-blur-md">
            <div class="text-right">
              <p class="text-[16px] sm:text-[18px] font-mono font-bold text-white tracking-tighter leading-none">
                {{ modelTime.toLocaleTimeString([], { hour12: false }) }}
              </p>
              <p class="text-[8px] sm:text-[9px] uppercase tracking-[0.2em] text-sky-400/80 font-bold">
                {{ modelTime.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' }) }}
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
            <div class="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-sky-500/10 flex items-center justify-center border border-sky-500/20">
               <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-sky-400"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            </div>
          </div>

          <!-- Instruction Card -->
          <div class="glass-panel p-3 sm:p-4 rounded-xl flex items-center gap-3 sm:gap-4 shadow-2xl ring-1 ring-white/10 bg-slate-900/40 backdrop-blur-md">
            <div class="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-sky-500 flex items-center justify-center shadow-lg shadow-sky-500/20">
               <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-white"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path></svg>
            </div>
            <div>
              <h1 class="text-xs sm:text-sm font-bold text-white tracking-tight leading-tight">
                <span class="hidden sm:inline">Hold <span class="text-sky-400">SHIFT</span> + MOVE to Paint</span>
                <span class="sm:hidden">Hold <span class="text-sky-400">BUTTON</span> + MOVE to Paint</span>
              </h1>
              <p class="text-[8px] sm:text-[9px] uppercase tracking-[0.2em] text-slate-500 font-bold mt-0.5">Hydrodynamic Flow Engine</p>
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
                    <h2 class="text-[10px] font-bold uppercase text-slate-500 tracking-[0.15em] mb-4">Domain Actions</h2>
                    <div class="grid grid-cols-2 gap-2">
                       <button @click="injectPattern('grid')" class="glass-panel py-2 rounded-lg bg-white/5 border border-white/5 text-[10px] uppercase font-bold text-slate-300 hover:bg-sky-500/20 hover:border-sky-500/50 transition-all flex items-center justify-center gap-2">
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg>
                          Add Grid
                       </button>
                       <button @click="injectPattern('quivers')" class="glass-panel py-2 rounded-lg bg-white/5 border border-white/5 text-[10px] uppercase font-bold text-slate-300 hover:bg-sky-500/20 hover:border-sky-500/50 transition-all flex items-center justify-center gap-2">
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                          Add Quivers
                       </button>
                    </div>                  </div>

                  <div>
                    <h2 class="text-[10px] font-bold uppercase text-slate-500 tracking-[0.15em] mb-4">Source Persistence</h2>
                    <div class="flex items-center justify-between glass-panel p-3 rounded-xl bg-white/5 border border-white/5 group hover:border-sky-500/30 transition-all cursor-pointer" @click="isPersistentSource = !isPersistentSource">
                       <div>
                          <p class="text-xs font-semibold text-slate-200">Sticky Paint Sources</p>
                          <p class="text-[8px] text-slate-500 uppercase tracking-tighter">Continually pour paint from drawn paths</p>
                       </div>
                       <div class="w-10 h-5 rounded-full bg-slate-800 relative transition-colors" :class="isPersistentSource ? 'bg-sky-500/40' : ''">
                          <div class="absolute top-1 left-1 w-3 h-3 rounded-full bg-slate-400 transition-all" :class="isPersistentSource ? 'left-6 bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.8)]' : ''"></div>
                       </div>
                    </div>
                  </div>

                  <div>
                    <h2 class="text-[10px] font-bold uppercase text-slate-500 tracking-[0.15em] mb-4">Simulation Persistence</h2>
                    <div class="flex justify-between text-[11px] mb-2 text-slate-400 font-mono">
                      <span>Paint Decay</span>
                      <span class="text-sky-400">{{ (gpuParams.decay * 100).toFixed(2) }}%</span>
                    </div>
                    <input 
                      type="range" 
                      v-model.number="gpuParams.decay" 
                      min="0.95" max="1.0" step="0.001"
                      class="w-full"
                    >
                    <p class="text-[8px] text-slate-600 mt-2 italic">100% means paint never fades, creating a persistent flow source.</p>
                  </div>

                  <div>
                    <h2 class="text-[10px] font-bold uppercase text-slate-500 tracking-[0.15em] mb-4">Fluid Properties</h2>
                    <div class="flex justify-between text-[11px] mb-2 text-slate-400 font-mono">
                      <span>Oil Viscosity</span>
                      <span class="text-sky-400">{{ gpuParams.viscosity.toFixed(3) }}</span>
                    </div>
                    <input 
                      type="range" 
                      v-model.number="gpuParams.viscosity" 
                      min="0.0" max="1.0" step="0.01"
                      class="w-full"
                    >
                    <p class="text-[8px] text-slate-600 mt-2 italic">Simulates surface tension and drag so the paint forms cohesive, slow-moving blobs.</p>
                  </div>

                  <div>
                    <h2 class="text-[10px] font-bold uppercase text-slate-500 tracking-[0.15em] mb-4">Flow Velocity</h2>
                    <div class="flex justify-between text-[11px] mb-2 text-slate-400 font-mono">
                      <span>Sim Speed</span>
                      <span class="text-sky-400">{{ gpuParams.speed.toFixed(2) }}x</span>
                    </div>
                    <input 
                      type="range" 
                      v-model.number="gpuParams.speed" 
                      min="0.01" max="0.5" step="0.01"
                      class="w-full"
                    >
                  </div>

                  <div>
                    <h2 class="text-[10px] font-bold uppercase text-slate-500 tracking-[0.15em] mb-4">Data Intensity</h2>
                    <div class="flex justify-between text-[11px] mb-2 text-slate-400 font-mono">
                      <span>UV Scale</span>
                      <span class="text-sky-400">{{ gpuParams.uvScale.toFixed(1) }}x</span>
                    </div>
                    <input 
                      type="range" 
                      v-model.number="gpuParams.uvScale" 
                      min="0.1" max="10.0" step="0.1"
                      class="w-full"
                    >
                  </div>

                  <div>
                    <h2 class="text-[10px] font-bold uppercase text-slate-500 tracking-[0.15em] mb-4">Turbulence Dynamics</h2>
                    <div class="flex justify-between text-[11px] mb-2 text-slate-400 font-mono">
                      <span>Amplitude</span>
                      <span class="text-sky-400">{{ gpuParams.blend.toFixed(2) }}</span>
                    </div>
                    <input 
                      type="range" 
                      v-model.number="gpuParams.blend" 
                      min="0.0" max="2.0" step="0.05"
                      class="w-full"
                    >
                    <div class="flex justify-between text-[11px] mb-2 mt-3 text-slate-400 font-mono">
                      <span>Scale</span>
                      <span class="text-sky-400">{{ gpuParams.scale.toFixed(1) }}</span>
                    </div>
                    <input 
                      type="range" 
                      v-model.number="gpuParams.scale" 
                      min="1.0" max="20.0" step="0.1"
                      class="w-full"
                    >
                  </div>

                  <div>
                    <h2 class="text-[10px] font-bold uppercase text-slate-500 tracking-[0.15em] mb-4">Brush Settings</h2>
                    <div class="flex justify-between text-[11px] mb-2 text-slate-400 font-mono">
                      <span>Brush Size</span>
                      <span class="text-sky-400">{{ (gpuParams.mouseRadius * 100).toFixed(2) }}%</span>
                    </div>
                    <input 
                      type="range" 
                      v-model.number="gpuParams.mouseRadius" 
                      min="0.0005" max="0.02" step="0.0005"
                      class="w-full"
                    >
                  </div>

                  <div>
                    <h2 class="text-[10px] font-bold uppercase text-slate-500 tracking-[0.15em] mb-4">Color Palette</h2>
                    <ColorSelection 
                      @update:color="(c) => { updateActiveColor(c); isColorLocked = true }" 
                      @update:palette="(p) => { activePalette = p; isColorLocked = false }"
                      @select-painting="handleSelectPainting"
                    />
                  </div>

                  <div class="pt-4 border-t border-white/5">
                    <ImageStamps 
                      @select="handleSelectStamp"
                      @clear="handleClearStamp"
                    />
                  </div>

                  <div class="pt-4 border-t border-white/5 flex flex-col gap-2">
                    <a 
                      href="./schemes.html" 
                      target="_blank"
                      class="glass-panel py-3 rounded-lg bg-sky-500/10 border border-sky-500/20 text-[10px] uppercase font-bold text-sky-400 hover:bg-sky-500/20 hover:text-white transition-all flex items-center justify-center gap-2 text-center pointer-events-auto"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                      Compare Numerical Schemes
                    </a>
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
      <div class="mt-auto p-4 sm:p-6 pointer-events-none flex justify-center overflow-hidden">
        <div v-if="selectedModel" class="glass-panel p-4 sm:p-5 rounded-2xl w-full max-w-3xl pointer-events-auto shadow-2xl ring-1 ring-white/10 flex flex-col sm:flex-row gap-4 sm:gap-6 max-h-[40vh] sm:max-h-none overflow-y-auto custom-scrollbar">
          <div class="flex-1">
             <h2 class="text-[10px] font-bold uppercase text-sky-400 tracking-widest border-b border-white/5 pb-2 mb-3 flex items-center gap-2">
                <span class="w-1.5 h-1.5 rounded-full bg-sky-400"></span>
                Domain Information
             </h2>
             <div class="space-y-2">
                <div>
                   <h3 class="text-sm font-semibold text-slate-200">{{ selectedModel.title }}</h3>
                   <p class="text-xs text-slate-400 leading-relaxed">{{ selectedModel.abstract || 'No description available' }}</p>
                </div>
                <div v-if="selectedModel.extent?.time" class="flex flex-col sm:flex-row gap-2 sm:gap-4 pt-2 text-[10px] uppercase text-slate-500">
                   <div>
                      <span class="block text-slate-600">Start Time</span>
                      <span class="text-slate-300 font-mono">{{ new Date(selectedModel.extent.time[0]).toUTCString().split(' ').slice(1, 5).join(' ') }} UTC</span>
                   </div>
                   <div>
                      <span class="block text-slate-600">End Time</span>
                      <span class="text-slate-300 font-mono">{{ new Date(selectedModel.extent.time[1]).toUTCString().split(' ').slice(1, 5).join(' ') }} UTC</span>
                   </div>
                </div>
             </div>
          </div>
          <div class="hidden sm:block w-px bg-white/5"></div>
          <div class="w-full sm:w-48 flex flex-col justify-center border-t border-white/5 pt-4 sm:border-t-0 sm:pt-0">
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
