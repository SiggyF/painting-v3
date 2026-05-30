<script setup lang="ts">
interface Props {
  modelTime: Date
  gpsString?: string
}

withDefaults(defineProps<Props>(), {
  gpsString: 'GPS: 53.44N, 5.68E'
})
</script>

<template>
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
          <span class="text-[7px] font-mono text-emerald-500/80 uppercase">{{ gpsString }}</span>
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
</template>
