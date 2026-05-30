<script setup lang="ts">
// Static component for user instructions
</script>

<template>
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
</template>
