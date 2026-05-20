<script setup lang="ts">
import { ref } from 'vue'

interface Model {
  id: string;
  title: string;
  summary: string;
  icon?: string;
}

const props = defineProps<{
  models: Model[]
}>()

const emit = defineEmits(['select'])

const selectedId = ref<string | null>(null)

const handleSelect = (model: Model) => {
  selectedId.value = model.id
  emit('select', model)
}
</script>

<template>
  <div class="space-y-2">
    <div 
      v-for="model in models" 
      :key="model.id"
      @click="handleSelect(model)"
      class="flex items-center gap-3 p-3 rounded-xl transition-all cursor-pointer group"
      :class="selectedId === model.id ? 'bg-sky-500/20 border border-sky-500/30' : 'hover:bg-slate-800/50 border border-transparent'"
    >
      <div class="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center overflow-hidden border border-white/5">
        <img v-if="model.icon" :src="model.icon" class="w-full h-full object-cover" />
        <div v-else class="text-sky-400">
           <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
        </div>
      </div>
      <div class="flex-1 min-w-0">
        <h3 class="text-sm font-semibold text-slate-200 truncate group-hover:text-sky-300 transition-colors">
          {{ model.title }}
        </h3>
        <p class="text-[10px] text-slate-500 truncate uppercase tracking-tighter">{{ model.summary }}</p>
      </div>
      <div 
        class="opacity-0 group-hover:opacity-100 transition-opacity"
        :class="{ 'opacity-100': selectedId === model.id }"
      >
        <div class="w-6 h-6 rounded-full bg-sky-500 flex items-center justify-center text-white">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
        </div>
      </div>
    </div>
  </div>
</template>
