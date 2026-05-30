<script setup lang="ts">
import { computed } from 'vue'
import ModelsOverview from './ModelsOverview.vue'
import ColorSelection from './ColorSelection.vue'
import DrawingShortcuts from './DrawingShortcuts.vue'
import ImageStamps from './ImageStamps.vue'

interface Props {
  modelsList: any[]
  allPredictors: any[]
  allCorrectors: any[]
  selectedPredictorId: string
  selectedCorrectorId: string
  gpuParams: any
  isPersistentSource: boolean
  currentSourceType: 'video' | 'image'
  currentVideoSrc: string
  currentImageSrc: string
  activeTab: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'update:selectedPredictorId', val: string): void
  (e: 'update:selectedCorrectorId', val: string): void
  (e: 'update:isPersistentSource', val: boolean): void
  (e: 'update:activeTab', val: string): void
  (e: 'select-model', model: any): void
  (e: 'inject-pattern', pattern: 'grid' | 'quivers'): void
  (e: 'select-painting', url: string): void
  (e: 'select-stamp', stamp: any): void
  (e: 'clear-stamp'): void
  (e: 'predictor-change'): void
  (e: 'corrector-change'): void
  (e: 'select-color', color: string): void
  (e: 'select-palette', palette: any[]): void
}>()

const localSelectedPredictorId = computed({
  get: () => props.selectedPredictorId,
  set: (val) => emit('update:selectedPredictorId', val)
})

const localSelectedCorrectorId = computed({
  get: () => props.selectedCorrectorId,
  set: (val) => emit('update:selectedCorrectorId', val)
})

const localIsPersistentSource = computed({
  get: () => props.isPersistentSource,
  set: (val) => emit('update:isPersistentSource', val)
})

const localActiveTab = computed({
  get: () => props.activeTab,
  set: (val) => emit('update:activeTab', val)
})

const filteredCorrectors = computed(() => {
  return props.allCorrectors.filter(c => c.compatiblePredictors.includes(props.selectedPredictorId))
})
</script>

<template>
  <div class="glass-panel rounded-2xl w-80 pointer-events-auto shadow-2xl ring-1 ring-white/10 overflow-hidden">
    <!-- Tabs -->
    <div class="flex border-b border-white/5 bg-white/5">
      <button 
        v-for="tab in ['models', 'rendering', 'keys']" 
        :key="tab"
        @click="localActiveTab = tab"
        class="flex-1 py-3 text-[10px] font-bold uppercase tracking-widest transition-colors"
        :class="localActiveTab === tab ? 'text-sky-400 bg-white/5' : 'text-slate-500 hover:text-slate-300'"
      >
        {{ tab }}
      </button>
    </div>

    <div class="p-5 max-h-[60vh] overflow-y-auto custom-scrollbar">
      <div v-if="localActiveTab === 'models'" class="space-y-4">
        <h2 class="text-[10px] font-bold uppercase text-slate-500 tracking-[0.15em] mb-2">Available Domains</h2>
        <ModelsOverview :models="modelsList" @select="(m) => emit('select-model', m)" />

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

      <div v-if="localActiveTab === 'rendering'" class="space-y-6">
        <div>
          <h2 class="text-[10px] font-bold uppercase text-slate-500 tracking-[0.15em] mb-4">Domain Actions</h2>
          <div class="grid grid-cols-2 gap-2">
             <button @click="emit('inject-pattern', 'grid')" class="glass-panel py-2 rounded-lg bg-white/5 border border-white/5 text-[10px] uppercase font-bold text-slate-300 hover:bg-sky-500/20 hover:border-sky-500/50 transition-all flex items-center justify-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg>
                Add Grid
             </button>
             <button @click="emit('inject-pattern', 'quivers')" class="glass-panel py-2 rounded-lg bg-white/5 border border-white/5 text-[10px] uppercase font-bold text-slate-300 hover:bg-sky-500/20 hover:border-sky-500/50 transition-all flex items-center justify-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                Add Quivers
             </button>
          </div>
        </div>

        <div>
          <h2 class="text-[10px] font-bold uppercase text-slate-500 tracking-[0.15em] mb-4">Numerical Scheme</h2>
          <div class="glass-panel p-3 rounded-xl bg-white/5 border border-white/5 group hover:border-sky-500/30 transition-all space-y-3">
            <div>
              <span class="text-[8px] font-bold text-slate-500 uppercase">Predictor</span>
              <select 
                v-model="localSelectedPredictorId" 
                @change="emit('predictor-change')"
                class="w-full bg-slate-900/80 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/30 transition-all cursor-pointer mt-1"
              >
                <option v-for="pred in allPredictors" :key="pred.id" :value="pred.id">
                  {{ pred.name }}
                </option>
              </select>
            </div>
            <div>
              <span class="text-[8px] font-bold text-slate-500 uppercase">Corrector</span>
              <select 
                v-model="localSelectedCorrectorId" 
                @change="emit('corrector-change')"
                class="w-full bg-slate-900/80 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/30 transition-all cursor-pointer mt-1"
              >
                <option v-for="corr in filteredCorrectors" :key="corr.id" :value="corr.id">
                  {{ corr.name }}
                </option>
              </select>
            </div>
          </div>
        </div>

        <div>
          <h2 class="text-[10px] font-bold uppercase text-slate-500 tracking-[0.15em] mb-4">Source Persistence</h2>
          <div class="flex items-center justify-between glass-panel p-3 rounded-xl bg-white/5 border border-white/5 group hover:border-sky-500/30 transition-all cursor-pointer" @click="localIsPersistentSource = !localIsPersistentSource">
             <div>
                <p class="text-xs font-semibold text-slate-200">Sticky Paint Sources</p>
                <p class="text-[8px] text-slate-500 uppercase tracking-tighter">Continually pour paint from drawn paths</p>
             </div>
             <div class="w-10 h-5 rounded-full bg-slate-800 relative transition-colors" :class="localIsPersistentSource ? 'bg-sky-500/40' : ''">
                <div class="absolute top-1 left-1 w-3 h-3 rounded-full bg-slate-400 transition-all" :class="localIsPersistentSource ? 'left-6 bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.8)]' : ''"></div>
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
            @update:color="(c) => emit('select-color', c)" 
            @update:palette="(p) => emit('select-palette', p)"
            @select-painting="(url) => emit('select-painting', url)"
          />
        </div>

        <div class="pt-4 border-t border-white/5">
          <ImageStamps 
            @select="(s) => emit('select-stamp', s)"
            @clear="emit('clear-stamp')"
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

      <div v-if="localActiveTab === 'keys'" class="space-y-4">
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
</template>
