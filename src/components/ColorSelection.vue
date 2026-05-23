<script setup lang="ts">
import { ref, onMounted } from 'vue'

interface ColorItem {
  i: number
  x: number
  y: number
  rgb: [number, number, number]
  hex: string
  active: boolean
}

interface Painting {
  url: string
  info: string
  painter: string
  title: string
  palette: ColorItem[]
}

interface ColourLoversPalette {
  id: number
  title: string
  colors: string[]
}

interface StandardPalette {
  name: string
  colors: string[]
  isPainting?: boolean
}

const emit = defineEmits(['update:palette', 'update:color', 'select-painting'])

// Hardcoded default palettes (as fallback and core selection)
const standardPalettes = ref<StandardPalette[]>([
  { name: 'Ocean Five', colors: ['#00A0B0', '#6A4A3C', '#CC333F', '#EB6841', '#EDC951'] },
  { name: 'Turbo', colors: ['#30123b', '#4662d8', '#36aaf9', '#1ae4b6', '#a4fc3c', '#fbb938', '#f66319', '#cf3002', '#7a0403'] },
  { name: 'Viridis', colors: ['#440154', '#482878', '#3b528b', '#26828e', '#5ec962', '#fde725'] },
  { name: 'Magma', colors: ['#000004', '#1b0c41', '#4a0c6b', '#781c6d', '#a52c60', '#cf4446', '#ed6925', '#fb9b06', '#fcfdbf'] }
])

const activeTab = ref<'standard' | 'paintings'>('standard')
const selectedPaletteName = ref('Ocean Five')
const selectedColor = ref('#00A0B0')

// Dynamic data loaded from JSON
const paintings = ref<Painting[]>([])
const selectedPainting = ref<Painting | null>(null)

const rgbToHex = (r: number, g: number, b: number) => {
  const toHex = (c: number) => {
    const hex = Math.round(c * 255).toString(16)
    return hex.length === 1 ? '0' + hex : hex
  }
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase()
}

const getImageUrl = (url: string) => {
  const cleanUrl = url.startsWith('/') ? url.slice(1) : url
  return `${import.meta.env.BASE_URL}${cleanUrl}`
}

onMounted(async () => {
  // Fetch ColourLovers
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/colourlovers.json`)
    const data: ColourLoversPalette[] = await res.json()
    const formatted = data.map(p => ({
      name: p.title,
      colors: p.colors.map(c => c.startsWith('#') ? c : `#${c}`)
    }))
    // Merge, avoiding duplicates
    const existingNames = new Set(standardPalettes.value.map(p => p.name))
    formatted.forEach(p => {
      if (!existingNames.has(p.name)) {
        standardPalettes.value.push(p)
      }
    })
  } catch (err) {
    console.error('Error loading colourlovers.json:', err)
  }

  // Fetch Paintings
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/paintings.json`)
    const data: any[] = await res.json()
    paintings.value = data.map(item => ({
      url: item.url,
      info: item.info,
      painter: item.painter,
      title: item.title,
      palette: item.palette.map((color: any) => ({
        ...color,
        hex: rgbToHex(color.rgb[0], color.rgb[1], color.rgb[2]),
        active: true
      }))
    }))
    if (paintings.value.length > 0) {
      selectPainting(paintings.value[0])
    }
  } catch (err) {
    console.error('Error loading paintings.json:', err)
  }
})

const selectStandardPalette = (p: StandardPalette) => {
  selectedPaletteName.value = p.name
  selectColor(p.colors[0])
  emit('update:palette', p.colors)
}

const selectPainting = (painting: Painting) => {
  selectedPainting.value = painting
  selectedPaletteName.value = painting.title
  
  // Set all colors to active initially
  painting.palette.forEach(c => { c.active = true })
  
  // Update palette in simulation
  const activeColors = painting.palette.filter(c => c.active).map(c => c.hex)
  emit('update:palette', activeColors)
  
  if (activeColors.length > 0) {
    selectColor(activeColors[0])
  }
  
  // Emit selection event with formatted image URL for simulation rendering
  emit('select-painting', getImageUrl(painting.url))
}

const selectColor = (hex: string) => {
  selectedColor.value = hex
  emit('update:color', hex)
}

// Toggle painting color in active palette
const togglePaintingColor = (color: ColorItem) => {
  if (!selectedPainting.value) return
  color.active = !color.active
  
  // Update active color if we just enabled it
  if (color.active) {
    selectColor(color.hex)
  }

  const activeColors = selectedPainting.value.palette.filter(c => c.active).map(c => c.hex)
  emit('update:palette', activeColors)
}

const selectAllPaintingColors = () => {
  if (!selectedPainting.value) return
  selectedPainting.value.palette.forEach(c => { c.active = true })
  const activeColors = selectedPainting.value.palette.map(c => c.hex)
  emit('update:palette', activeColors)
  if (activeColors.length > 0) {
    selectColor(activeColors[0])
  }
}

const deselectAllPaintingColors = () => {
  if (!selectedPainting.value) return
  selectedPainting.value.palette.forEach(c => { c.active = false })
  emit('update:palette', [])
}
</script>

<template>
  <div class="space-y-4">
    <!-- Tabs -->
    <div class="flex rounded-lg bg-slate-900/60 p-1 ring-1 ring-white/10">
      <button 
        @click="activeTab = 'standard'"
        class="flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all"
        :class="activeTab === 'standard' ? 'bg-sky-500/20 text-sky-400 ring-1 ring-sky-500/30' : 'text-slate-400 hover:text-slate-200'"
      >
        Palettes
      </button>
      <button 
        @click="activeTab = 'paintings'"
        class="flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all"
        :class="activeTab === 'paintings' ? 'bg-sky-500/20 text-sky-400 ring-1 ring-sky-500/30' : 'text-slate-400 hover:text-slate-200'"
      >
        Paintings
      </button>
    </div>

    <!-- Active Color Indicator -->
    <div class="glass-panel p-3 rounded-xl flex items-center gap-3 ring-1 ring-white/10 shadow-lg bg-white/5">
       <div 
         class="w-10 h-10 rounded-lg shadow-inner ring-1 ring-white/20 transition-all duration-300"
         :style="{ backgroundColor: selectedColor, boxShadow: `0 0 20px ${selectedColor}44` }"
       ></div>
       <div>
         <p class="text-[9px] font-bold uppercase tracking-widest text-slate-500 leading-none mb-1">Active Pigment</p>
         <p class="text-xs font-mono text-white leading-none uppercase">{{ selectedColor }}</p>
       </div>
    </div>

    <!-- Standard Palettes Content -->
    <div v-if="activeTab === 'standard'" class="grid grid-cols-1 gap-4 max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar">
      <div 
        v-for="p in standardPalettes" 
        :key="p.name"
        class="group"
      >
        <div class="flex justify-between items-center mb-1.5">
          <span 
            class="text-[9px] font-bold uppercase tracking-widest transition-colors cursor-pointer"
            :class="selectedPaletteName === p.name ? 'text-sky-400' : 'text-slate-500 group-hover:text-slate-300'"
            @click="selectStandardPalette(p)"
          >
            {{ p.name }}
          </span>
          <div v-if="selectedPaletteName === p.name" class="w-1.5 h-1.5 rounded-full bg-sky-500 shadow-[0_0_8px_rgba(14,165,233,0.8)]"></div>
        </div>
        
        <div class="flex gap-1 h-5">
          <div 
            v-for="c in p.colors" 
            :key="c"
            @click="selectColor(c); selectedPaletteName = p.name; emit('update:palette', p.colors)"
            class="flex-1 rounded-sm cursor-pointer transition-transform hover:scale-110 hover:z-10 ring-1 ring-black/20"
            :class="selectedColor === c ? 'ring-2 ring-white scale-110 z-10' : ''"
            :style="{ backgroundColor: c }"
          ></div>
        </div>
      </div>
    </div>

    <!-- Paintings Content -->
    <div v-else-if="activeTab === 'paintings'" class="space-y-4">
      <!-- Painting Selector -->
      <div class="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
        <button
          v-for="p in paintings"
          :key="p.url"
          @click="selectPainting(p)"
          class="flex-shrink-0 w-12 h-12 rounded-lg border overflow-hidden transition-all duration-200"
          :class="selectedPainting?.url === p.url ? 'border-sky-500 scale-105 shadow-[0_0_10px_rgba(14,165,233,0.5)]' : 'border-white/10 grayscale opacity-60 hover:grayscale-0 hover:opacity-100'"
        >
          <img :src="getImageUrl(p.url)" class="w-full h-full object-cover" :alt="p.title" />
        </button>
      </div>

      <!-- Active Painting Meta -->
      <div v-if="selectedPainting" class="glass-panel p-3 rounded-xl bg-white/5 border border-white/10 flex gap-3">
        <img :src="getImageUrl(selectedPainting.url)" class="w-16 h-16 rounded-md object-cover border border-white/10" />
        <div class="min-w-0 flex-1">
          <p class="text-xs font-bold text-slate-200 truncate">{{ selectedPainting.title }}</p>
          <p class="text-[10px] text-slate-400 truncate">by {{ selectedPainting.painter }}</p>
          <a :href="selectedPainting.info" target="_blank" class="inline-flex items-center gap-1 text-[8px] text-sky-400 font-bold uppercase tracking-wider mt-1 hover:underline">
            More Info
            <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/></svg>
          </a>
        </div>
      </div>

      <!-- Scatterplot Palette -->
      <div v-if="selectedPainting" class="glass-panel p-3 rounded-xl bg-slate-950/60 border border-white/5 relative">
        <p class="text-[9px] font-bold uppercase tracking-widest text-slate-500 mb-2">Pigment Space (X/Y)</p>
        
        <!-- SVG Scatterplot -->
        <svg viewBox="0 0 260 200" class="w-full h-48 bg-black/40 rounded-lg overflow-visible">
          <g>
            <circle
              v-for="c in selectedPainting.palette"
              :key="c.i"
              :cx="20 + c.x * 220"
              :cy="180 - c.y * 160"
              :r="selectedColor === c.hex ? '7' : '5'"
              :fill="c.hex"
              class="cursor-pointer transition-all duration-150 hover:r-8 hover:stroke-white hover:stroke-1"
              :class="[
                c.active ? 'opacity-100' : 'opacity-10 stroke-dashed',
                selectedColor === c.hex ? 'stroke-white stroke-2 shadow-lg' : 'stroke-black/30 stroke-1'
              ]"
              @click="togglePaintingColor(c)"
            />
          </g>
        </svg>

        <div class="flex justify-between mt-3">
          <button @click="deselectAllPaintingColors" class="px-2 py-1 bg-white/5 hover:bg-red-500/10 hover:text-red-400 border border-white/5 hover:border-red-500/20 text-[8px] uppercase font-bold tracking-wider rounded text-slate-400 transition-colors">
            Clear All
          </button>
          <button @click="selectAllPaintingColors" class="px-2 py-1 bg-white/5 hover:bg-sky-500/10 hover:text-sky-400 border border-white/5 hover:border-sky-500/20 text-[8px] uppercase font-bold tracking-wider rounded text-slate-400 transition-colors">
            Select All
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 3px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 10px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(56, 189, 248, 0.2);
}
.scrollbar-none::-webkit-scrollbar {
  display: none;
}
.scrollbar-none {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
