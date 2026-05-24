<script setup lang="ts">
const categories = [
  {
    title: 'Drawing & Painting',
    items: [
      { key: 'Shift + Move', action: 'Draw (Seamless)' },
      { key: 'Mouse Drag', action: 'Paint (in Brush Mode)' },
      { key: 'Hold to Paint', action: 'Touch/Hold Modifier' },
      { key: 'B', action: 'Toggle Brush Mode' }
    ]
  },
  {
    title: 'Simulation Controls',
    items: [
      { key: 'Q', action: 'Pour Quivers (Hold)' },
      { key: 'G', action: 'Pour Grid (Hold)' },
      { key: 'C', action: 'Clear Canvas' },
      { key: 'P', action: 'Pause (WIP)' }
    ]
  },
  {
    title: 'UI Controls',
    items: [
      { key: 'S', action: 'Toggle Sidebar' }
    ]
  }
]
</script>

<template>
  <div class="space-y-6">
    <div v-for="cat in categories" :key="cat.title" class="space-y-3">
      <h3 class="text-[9px] font-bold uppercase text-slate-500 tracking-[0.12em] border-b border-white/5 pb-1">
        {{ cat.title }}
      </h3>
      <div class="space-y-2">
        <div 
          v-for="s in cat.items" 
          :key="s.key"
          class="flex justify-between items-center group"
        >
          <span class="text-[10px] text-slate-400 group-hover:text-slate-300 transition-colors uppercase tracking-tight">
            {{ s.action }}
          </span>
          <kbd class="px-2 py-1 rounded bg-slate-800 border border-white/10 text-[9px] font-mono text-sky-400 shadow-sm select-none">
            {{ s.key }}
          </kbd>
        </div>
      </div>
    </div>
    
    <div class="mt-4 p-3 bg-emerald-500/5 rounded-lg border border-emerald-500/10">
      <p class="text-[10px] text-emerald-400/80 leading-relaxed italic">
        <strong>Pro Tip:</strong> Moving the mouse faster creates more turbulence in the flow field.
      </p>
    </div>
  </div>
</template>

