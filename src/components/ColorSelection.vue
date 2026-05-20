<script setup lang="ts">
import { ref } from 'vue'

const palettes = [
  { name: 'Turbo', colors: ['#30123b', '#4662d8', '#36aaf9', '#1ae4b6', '#a4fc3c', '#fbb938', '#f66319', '#cf3002', '#7a0403'] },
  { name: 'Viridis', colors: ['#440154', '#482878', '#3b528b', '#26828e', '#5ec962', '#fde725'] },
  { name: 'Magma', colors: ['#000004', '#1b0c41', '#4a0c6b', '#781c6d', '#a52c60', '#cf4446', '#ed6925', '#fb9b06', '#fcfdbf'] },
  { name: 'Ocean', colors: ['#000033', '#000066', '#003399', '#0066cc', '#33ccff'] }
]

const selectedPalette = ref(palettes[0].name)

const emit = defineEmits(['update:palette'])

const select = (name: string) => {
  selectedPalette.value = name
  emit('update:palette', name)
}
</script>

<template>
  <div class="grid grid-cols-1 gap-3">
    <div 
      v-for="p in palettes" 
      :key="p.name"
      @click="select(p.name)"
      class="group cursor-pointer"
    >
      <div class="flex justify-between items-center mb-1">
        <span class="text-[10px] uppercase tracking-widest text-slate-500 group-hover:text-sky-400 transition-colors">
          {{ p.name }}
        </span>
        <div v-if="selectedPalette === p.name" class="w-2 h-2 rounded-full bg-sky-500 shadow-[0_0_8px_rgba(14,165,233,0.8)]"></div>
      </div>
      <div class="h-3 w-full rounded-full overflow-hidden flex border border-white/5 group-hover:border-white/20 transition-all">
        <div 
          v-for="c in p.colors" 
          :key="c"
          :style="{ backgroundColor: c, flex: 1 }"
          class="h-full"
        ></div>
      </div>
    </div>
  </div>
</template>
