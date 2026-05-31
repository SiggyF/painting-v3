<script setup lang="ts">
import { computed } from 'vue'
import ModelsOverview from './ModelsOverview.vue'
import ColorSelection from './ColorSelection.vue'
import DrawingShortcuts from './DrawingShortcuts.vue'

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

const particleExponent = computed({
  get: () => {
    const count = props.gpuParams.particleCount;
    if (count === 0) return 0;
    return Math.round(Math.log2(count || 512));
  },
  set: (val) => {
    if (val === 0) {
      props.gpuParams.particleCount = 0;
    } else {
      props.gpuParams.particleCount = Math.pow(2, val);
    }
  }
})

const particleConstantColorHex = computed({
  get: () => {
    const r = Math.round((props.gpuParams.particleColorR ?? 1.0) * 255);
    const g = Math.round((props.gpuParams.particleColorG ?? 1.0) * 255);
    const b = Math.round((props.gpuParams.particleColorB ?? 1.0) * 255);
    const hex = (c: number) => c.toString(16).padStart(2, '0');
    return `#${hex(r)}${hex(g)}${hex(b)}`;
  },
  set: (val) => {
    const hex = val.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;
    props.gpuParams.particleColorR = r;
    props.gpuParams.particleColorG = g;
    props.gpuParams.particleColorB = b;
  }
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

      <div v-if="localActiveTab === 'rendering'" class="space-y-6">
        <!-- 1. Paint Controls (Sticky, add grid, add quiver, decay) -->
        <div>
          <h2 class="text-[10px] font-bold uppercase text-slate-500 tracking-[0.15em] mb-4">Paint Controls</h2>
          <div class="space-y-4">
            <!-- Sticky Paint Sources -->
            <div class="flex items-center justify-between glass-panel p-3 rounded-xl bg-white/5 border border-white/5 group hover:border-sky-500/30 transition-all cursor-pointer" @click="localIsPersistentSource = !localIsPersistentSource">
               <div>
                  <p class="text-xs font-semibold text-slate-200">Sticky Paint Sources</p>
                  <p class="text-[8px] text-slate-500 uppercase tracking-tighter">Continually pour paint from drawn paths</p>
               </div>
               <div class="w-10 h-5 rounded-full bg-slate-800 relative transition-colors" :class="localIsPersistentSource ? 'bg-sky-500/40' : ''">
                  <div class="absolute top-1 left-1 w-3 h-3 rounded-full bg-slate-400 transition-all" :class="localIsPersistentSource ? 'left-6 bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.8)]' : ''"></div>
               </div>
            </div>

            <!-- Domain Actions: Add Grid, Add Quivers -->
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

            <!-- Paint Decay -->
            <div>
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
            </div>
          </div>
        </div>

        <!-- 2. Particle Controls (count, opacity, trail) -->
        <!-- 4. Particle Layer -->
        <div class="pt-4 border-t border-white/5">
          <h2 class="text-[10px] font-bold uppercase text-slate-500 tracking-[0.15em] mb-4">Particle Layer</h2>
          <div class="space-y-4">
            <!-- Particle Size -->
            <div>
              <div class="flex justify-between text-[11px] mb-2 text-slate-400 font-mono">
                <span>Particle Size</span>
                <span class="text-sky-400">{{ (gpuParams.particleSize * 1000).toFixed(1) }}</span>
              </div>
              <input 
                type="range" 
                v-model.number="gpuParams.particleSize" 
                min="0.001" max="0.01" step="0.0005"
                class="w-full"
              >
            </div>

            <!-- Particle Count -->
            <div>
              <div class="flex justify-between text-[11px] mb-2 text-slate-400 font-mono">
                <span>Particle Count</span>
                <span class="text-sky-400">{{ gpuParams.particleCount }}</span>
              </div>
              <input 
                type="range" 
                v-model.number="particleExponent" 
                min="0" max="18" step="1"
                class="w-full"
              >
            </div>
            <!-- Particle Opacity -->
            <div>
              <div class="flex justify-between text-[11px] mb-2 text-slate-400 font-mono">
                <span>Particle Opacity</span>
                <span class="text-sky-400">{{ (gpuParams.particleOpacity * 100).toFixed(0) }}%</span>
              </div>
              <input 
                type="range" 
                v-model.number="gpuParams.particleOpacity" 
                min="0.05" max="1.0" step="0.05"
                class="w-full"
              >
            </div>

            <!-- Trail Length -->
            <div>
              <div class="flex justify-between text-[11px] mb-2 text-slate-400 font-mono">
                <span>Trail Length (Decay)</span>
                <span class="text-sky-400">{{ gpuParams.particleTrail === 0 ? 'None' : (gpuParams.particleTrail * 100).toFixed(0) + '%' }}</span>
              </div>
              <input 
                type="range" 
                v-model.number="gpuParams.particleTrail" 
                min="0.0" max="0.99" step="0.01"
                class="w-full"
              >
            </div>
          </div>
        </div>

        <!-- 3. Paint Color Controls -->
        <div class="pt-4 border-t border-white/5">
          <h2 class="text-[10px] font-bold uppercase text-slate-500 tracking-[0.15em] mb-4">Paint Color Controls</h2>
          <ColorSelection 
            @update:color="(c) => emit('select-color', c)" 
            @update:palette="(p) => emit('select-palette', p)"
            @select-painting="(url) => emit('select-painting', url)"
          />
        </div>

        <!-- 4. Particle Colormap (direction based, speed based, constant) -->
        <div class="pt-4 border-t border-white/5">
          <h2 class="text-[10px] font-bold uppercase text-slate-500 tracking-[0.15em] mb-4">Particle Colormap</h2>
          <div class="space-y-3">
            <div class="flex rounded-lg bg-slate-900 p-0.5 border border-white/5">
              <button 
                v-for="(mode, index) in ['Direction', 'Speed', 'Constant']" 
                :key="mode"
                @click="gpuParams.particleColorMode = index; gpuParams.particleColormapId = 0"
                class="flex-1 py-1.5 text-[9px] font-bold uppercase tracking-wider rounded-md transition-all"
                :class="gpuParams.particleColorMode === index ? 'bg-sky-500/20 text-sky-400' : 'text-slate-500 hover:text-slate-300'"
              >
                {{ mode }}
              </button>
            </div>

            <!-- Colormap Previews/Controls -->
            <!-- Direction based -->
            <div v-if="gpuParams.particleColorMode === 0" class="space-y-2">
              <span class="text-[8px] font-bold text-slate-500 uppercase">Circular Colormap</span>
              <div class="flex rounded-md bg-slate-900 p-0.5 border border-white/5">
                <button 
                  v-for="(cmap, index) in ['Crameri (RomaO)', 'Crameri (Oleron)']" 
                  :key="cmap"
                  @click="gpuParams.particleColormapId = index"
                  class="flex-1 py-1 text-[8px] font-bold uppercase tracking-wider rounded transition-all"
                  :class="gpuParams.particleColormapId === index ? 'bg-sky-500/20 text-sky-400' : 'text-slate-500 hover:text-slate-300'"
                >
                  {{ cmap }}
                </button>
              </div>
              <div 
                v-if="gpuParams.particleColormapId === 0"
                class="h-3 w-full rounded-md border border-white/10" 
                style="background: linear-gradient(to right, rgb(156, 15, 25), rgb(217, 113, 45), rgb(246, 213, 97), rgb(217, 233, 218), rgb(112, 176, 208), rgb(63, 80, 156), rgb(156, 15, 25))"
              ></div>
              <div 
                v-else
                class="h-3 w-full rounded-md border border-white/10" 
                style="background: linear-gradient(to right, rgb(31, 90, 166), rgb(141, 51, 141), rgb(217, 115, 115), rgb(230, 217, 141), rgb(90, 166, 115), rgb(31, 90, 166))"
              ></div>
            </div>
            
            <!-- Speed based -->
            <div v-else-if="gpuParams.particleColorMode === 1" class="space-y-2">
              <span class="text-[8px] font-bold text-slate-500 uppercase">Sequential Colormap</span>
              <select 
                v-model.number="gpuParams.particleColormapId" 
                class="w-full bg-slate-900/80 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/30 transition-all cursor-pointer"
              >
                <option :value="0">Crameri (Batlow)</option>
                <option :value="1">Viridis</option>
                <option :value="2">Plasma</option>
                <option :value="3">Inferno</option>
                <option :value="4">Magma</option>
              </select>
              
              <div 
                v-if="gpuParams.particleColormapId === 0"
                class="h-3 w-full rounded-md border border-white/10" 
                style="background: linear-gradient(to right, rgb(3, 39, 114), rgb(46, 97, 98), rgb(124, 149, 73), rgb(222, 155, 80), rgb(242, 197, 207))"
              ></div>
              <div 
                v-else-if="gpuParams.particleColormapId === 1"
                class="h-3 w-full rounded-md border border-white/10" 
                style="background: linear-gradient(to right, rgb(68, 1, 84), rgb(59, 82, 139), rgb(33, 145, 140), rgb(94, 201, 98), rgb(253, 231, 37))"
              ></div>
              <div 
                v-else-if="gpuParams.particleColormapId === 2"
                class="h-3 w-full rounded-md border border-white/10" 
                style="background: linear-gradient(to right, rgb(13, 8, 135), rgb(126, 3, 168), rgb(204, 71, 120), rgb(248, 149, 64), rgb(240, 249, 33))"
              ></div>
              <div 
                v-else-if="gpuParams.particleColormapId === 3"
                class="h-3 w-full rounded-md border border-white/10" 
                style="background: linear-gradient(to right, rgb(0, 0, 4), rgb(87, 16, 110), rgb(187, 55, 84), rgb(249, 142, 9), rgb(252, 253, 191))"
              ></div>
              <div 
                v-else
                class="h-3 w-full rounded-md border border-white/10" 
                style="background: linear-gradient(to right, rgb(0, 0, 7), rgb(81, 18, 124), rgb(182, 54, 121), rgb(251, 136, 97), rgb(252, 253, 151))"
              ></div>
            </div>

            <!-- Constant color -->
            <div v-else class="flex items-center justify-between glass-panel p-2 rounded-xl bg-white/5 border border-white/5">
              <span class="text-[9px] font-semibold text-slate-200">Solid Color Picker</span>
              <div class="flex items-center gap-2">
                <span class="text-[10px] font-mono text-slate-400 uppercase">{{ particleConstantColorHex }}</span>
                <input 
                  type="color" 
                  v-model="particleConstantColorHex"
                  class="w-6 h-6 rounded cursor-pointer bg-transparent border-0"
                >
              </div>
            </div>
          </div>
        </div>


        <!-- 5. Other Paint Settings (Brush Size, Oil Viscosity) -->
        <div class="pt-4 border-t border-white/5">
          <h2 class="text-[10px] font-bold uppercase text-slate-500 tracking-[0.15em] mb-4">Other Paint Settings</h2>
          <div class="space-y-4">
            <!-- Brush Size -->
            <div>
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

            <!-- Oil Viscosity -->
            <div>
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
            </div>
          </div>
        </div>

        <!-- 7. Other Simulation Settings (Sim Speed, UV Scale, Turbulence, Numerical Scheme) -->
        <div class="pt-4 border-t border-white/5">
          <h2 class="text-[10px] font-bold uppercase text-slate-500 tracking-[0.15em] mb-4">Other Simulation Settings</h2>
          <div class="space-y-4">
            <!-- Sim Speed -->
            <div>
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

            <!-- UV Scale -->
            <div>
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

            <!-- Turbulence Amplitude -->
            <div>
              <div class="flex justify-between text-[11px] mb-2 text-slate-400 font-mono">
                <span>Turbulence Amplitude</span>
                <span class="text-sky-400">{{ gpuParams.blend.toFixed(2) }}</span>
              </div>
              <input 
                type="range" 
                v-model.number="gpuParams.blend" 
                min="0.0" max="2.0" step="0.05"
                class="w-full"
              >
            </div>

            <!-- Turbulence Scale -->
            <div>
              <div class="flex justify-between text-[11px] mb-2 text-slate-400 font-mono">
                <span>Turbulence Scale</span>
                <span class="text-sky-400">{{ gpuParams.scale.toFixed(1) }}</span>
              </div>
              <input 
                type="range" 
                v-model.number="gpuParams.scale" 
                min="1.0" max="20.0" step="0.1"
                class="w-full"
              >
            </div>

            <!-- Numerical Scheme Selects -->
            <div class="pt-2">
              <span class="text-[8px] font-bold text-slate-500 uppercase mb-2 block">Numerical Scheme</span>
              <div class="glass-panel p-3 rounded-xl bg-white/5 border border-white/5 space-y-3">
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
          </div>
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
