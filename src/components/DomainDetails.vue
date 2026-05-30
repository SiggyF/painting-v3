<script setup lang="ts">
interface Props {
  selectedModel: any
}

defineProps<Props>()
</script>

<template>
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
</template>
