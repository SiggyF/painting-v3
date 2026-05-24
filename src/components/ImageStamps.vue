<script setup lang="ts">
import { ref } from 'vue'

interface Stamp {
  name: string
  file: string
}

const stamps: Stamp[] = [
  { name: 'Arrow', file: 'arrow.png' },
  { name: 'Arrowhead', file: 'arrowhead.png' },
  { name: 'Bar', file: 'bar.png' },
  { name: 'Chess Board', file: 'chessboard.png' },
  { name: 'Dot', file: 'dot.png' },
  { name: 'Grid', file: 'grid.png' },
  { name: 'Small Grid', file: 'gridsmall.png' },
  { name: 'Vertical Bar', file: 'verticalbar.png' },
  { name: 'Zebra', file: 'zebra.png' }
]

const selectedStamp = ref<Stamp | null>(null)

const emit = defineEmits(['select', 'clear'])

const getImageUrl = (file: string) => {
  return `${import.meta.env.BASE_URL}images/${file}`
}

const selectStamp = (stamp: Stamp) => {
  if (selectedStamp.value?.file === stamp.file) {
    clearStamp()
    return
  }
  selectedStamp.value = stamp
  emit('select', getImageUrl(stamp.file))
}

const clearStamp = () => {
  selectedStamp.value = null
  emit('clear')
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex justify-between items-center">
      <h2 class="text-[10px] font-bold uppercase text-slate-500 tracking-[0.15em]">Image Stamps</h2>
      <button 
        v-if="selectedStamp"
        @click="clearStamp" 
        class="text-[8px] uppercase tracking-wider font-bold text-red-400 hover:text-red-300 transition-colors"
      >
        Clear Stamp
      </button>
    </div>

    <!-- Active Stamp Info -->
    <div 
      v-if="selectedStamp"
      class="glass-panel p-3 rounded-xl flex items-center gap-3 ring-1 ring-sky-500/30 bg-sky-500/5 shadow-lg"
    >
       <img 
         :src="getImageUrl(selectedStamp.file)" 
         class="w-10 h-10 rounded bg-black/60 border border-sky-500/20 object-contain p-1"
       />
       <div>
         <p class="text-[9px] font-bold uppercase tracking-widest text-sky-400 leading-none mb-1">Active Stamp</p>
         <p class="text-xs font-semibold text-white leading-none">{{ selectedStamp.name }}</p>
         <p class="text-[8px] text-emerald-400 font-bold uppercase tracking-wider mt-1.5 animate-pulse">
           Drag on map to paint
         </p>
       </div>
    </div>

    <div class="grid grid-cols-3 gap-2 max-h-[30vh] overflow-y-auto pr-1 custom-scrollbar">
      <button
        v-for="s in stamps"
        :key="s.file"
        @click="selectStamp(s)"
        class="glass-panel aspect-square rounded-lg flex flex-col items-center justify-center p-2 border hover:bg-white/5 transition-all duration-200"
        :class="selectedStamp?.file === s.file ? 'border-sky-500 bg-sky-500/10 shadow-[0_0_10px_rgba(14,165,233,0.3)]' : 'border-white/5 bg-slate-900/40'"
      >
        <img 
          :src="getImageUrl(s.file)" 
          class="w-8 h-8 object-contain mb-1 filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]" 
          :alt="s.name"
        />
        <span class="text-[8px] font-bold tracking-tight text-slate-400 truncate w-full text-center">{{ s.name }}</span>
      </button>
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
</style>
