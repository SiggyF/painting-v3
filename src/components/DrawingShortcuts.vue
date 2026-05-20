<script setup lang="ts">
const shortcuts = [
  { key: 'B', action: 'Toggle Brush Mode' },
  { key: 'C', action: 'Clear (WIP)' },
  { key: 'P', action: 'Pause (WIP)' },
  { key: 'S', action: 'Toggle Sidebar' },
  { key: 'Mouse Drag', action: 'Paint (in Brush Mode)' }
]
</script>

<template>
  <div class="space-y-3">
    <div 
      v-for="s in shortcuts" 
      :key="s.key"
      class="flex justify-between items-center group"
    >
      <span class="text-[10px] text-slate-400 group-hover:text-slate-300 transition-colors uppercase tracking-tight">
        {{ s.action }}
      </span>
      <kbd class="px-2 py-1 rounded bg-slate-800 border border-white/10 text-[9px] font-mono text-sky-400 shadow-sm">
        {{ s.key }}
      </kbd>
    </div>
    
    <div class="mt-4 p-3 bg-emerald-500/5 rounded-lg border border-emerald-500/10">
      <p class="text-[10px] text-emerald-400/80 leading-relaxed italic">
        <strong>Pro Tip:</strong> Moving the mouse faster creates more turbulence in the flow field.
      </p>
    </div>
  </div>
</template>
