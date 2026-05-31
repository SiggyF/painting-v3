export interface GPUParams {
  speed: number;
  blend: number;
  time: number;
  aspect: number;
  noiseScale: number;
  scale: number;
  mouseX: number;
  mouseY: number;
  isDrawing: number;
  mouseDirX: number;
  mouseDirY: number;
  uvScale: number;
  flipv: number;
  mouseRadius: number;
  decay: number;
  viscosity: number;
  scheme: number;
  analytical: number;
  particleSize?: number;
  particleOpacity?: number;
  particleCount?: number;
  particleTrail?: number;
  particleColorMode?: number;
  particleColorR?: number;
  particleColorG?: number;
  particleColorB?: number;
  particleColormapId?: number;
  channelU?: number;
  channelV?: number;
  channelMask?: number;
  channelWater?: number;
  waterLevelMin?: number;
  waterLevelMax?: number;
  waterLevelOpacity?: number;
  waterLevelEnabled?: boolean;
  waterLevelContours?: boolean;
  paintingEnabled?: boolean;
  particlesEnabled?: boolean;
}



