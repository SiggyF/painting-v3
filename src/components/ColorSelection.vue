<script setup lang="ts">
import { ref } from 'vue'

const palettes = [
  // Legacy ColourLovers
  { name: 'Giant Goldfish', colors: ['#69D2E7', '#A7DBD8', '#E0E4CC', '#F38630', '#FA6900'] },
  { name: 'Happy Music', colors: ['#FE4365', '#FC9D9A', '#F9CDAD', '#C8C8A9', '#83AF9B'] },
  { name: 'Thought Provoking', colors: ['#ECD078', '#D95B43', '#C02942', '#542437', '#53777A'] },
  { name: 'Ocean Five', colors: ['#00A0B0', '#6A4A3C', '#CC333F', '#EB6841', '#EDC951'] },
  
  // Legacy Paintings (Extracted Primaries)
  { name: 'Botticelli', colors: ['#6d2b24', '#c84639', '#b04632', '#543630', '#2e1611'], isPainting: true },
  { name: 'Monet', colors: ['#2b1d1a', '#a13d26', '#984531', '#b97f70', '#5a3428'], isPainting: true },
  { name: 'Vinci', colors: ['#1a1a1a', '#4a4a4a', '#8a8a8a', '#cccccc', '#ffffff'], isPainting: true },
  
  // Scientific / Standard
  { name: 'Turbo', colors: ['#30123b', '#4662d8', '#36aaf9', '#1ae4b6', '#a4fc3c', '#fbb938', '#f66319', '#cf3002', '#7a0403'] },
  { name: 'Viridis', colors: ['#440154', '#482878', '#3b528b', '#26828e', '#5ec962', '#fde725'] },
  { name: 'Magma', colors: ['#000004', '#1b0c41', '#4a0c6b', '#781c6d', '#a52c60', '#cf4446', '#ed6925', '#fb9b06', '#fcfdbf'] }
]

const selectedPalette = ref(palettes[0].name)
const selectedColor = ref(palettes[0].colors[0])

const emit = defineEmits(['update:palette', 'update:color'])

const selectPalette = (name: string) => {
  selectedPalette.value = name
  const p = palettes.find(x => x.name === name)
  if (p) {
    selectColor(p.colors[0])
    emit('update:palette', p.colors)
  }
}

const selectColor = (hex: string) => {
  selectedColor.value = hex
  emit('update:color', hex)
}
</script>

<template>
  <div class="space-y-6">
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

    <!-- Palette Selection -->
    <div class="grid grid-cols-1 gap-4 max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar">
      <div 
        v-for="p in palettes" 
        :key="p.name"
        class="group"
      >
        <div class="flex justify-between items-center mb-2">
          <span 
            class="text-[9px] font-bold uppercase tracking-widest transition-colors cursor-pointer"
            :class="selectedPalette === p.name ? 'text-sky-400' : 'text-slate-500 group-hover:text-slate-300'"
            @click="selectPalette(p.name)"
          >
            {{ p.name }}
            <span v-if="p.isPainting" class="ml-1 text-[8px] px-1 bg-sky-500/20 rounded text-sky-400">Classic</span>
          </span>
          <div v-if="selectedPalette === p.name" class="w-1.5 h-1.5 rounded-full bg-sky-500 shadow-[0_0_8px_rgba(14,165,233,0.8)]"></div>
        </div>
        
        <div class="flex gap-1 h-5">
          <div 
            v-for="c in p.colors" 
            :key="c"
            @click="selectColor(c); selectedPalette = p.name"
            class="flex-1 rounded-sm cursor-pointer transition-transform hover:scale-110 hover:z-10 ring-1 ring-black/20"
            :class="selectedColor === c ? 'ring-2 ring-white scale-110 z-10' : ''"
            :style="{ backgroundColor: c }"
          ></div>
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
.custom-scrollbar-thumb:hover {
  background: rgba(56, 189, 248, 0.2);
}
</style>
