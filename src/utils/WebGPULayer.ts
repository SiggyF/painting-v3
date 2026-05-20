import L from 'leaflet';

/**
 * Custom Leaflet Layer to place a WebGPU canvas over specific geographical bounds.
 * Extends L.ImageOverlay to leverage Leaflet's automatic positioning, scaling,
 * panning, and zoom animation handling.
 */
export class WebGPULayer extends L.ImageOverlay {
  private _canvas: HTMLCanvasElement | null = null;

  constructor(bounds: L.LatLngBoundsExpression = [[0, 0], [1, 1]], options: L.ImageOverlayOptions = {}) {
    super('', bounds, options);
  }

  // @ts-ignore - overriding internal Leaflet method
  _initImage() {
    // @ts-ignore
    const wasAnimated = this._map.options.zoomAnimation && L.Browser.any3d;
    const className = 'leaflet-image-layer ' + (wasAnimated ? 'leaflet-zoom-animated' : '');

    // Create canvas
    this._canvas = L.DomUtil.create('canvas', className) as HTMLCanvasElement;
    this._canvas.style.pointerEvents = 'none';
    this._canvas.style.mixBlendMode = 'screen';

    // @ts-ignore - ImageOverlay expects this._image to point to the DOM element
    this._image = this._canvas;

    if (this.options.interactive) {
      L.DomUtil.addClass(this._canvas, 'leaflet-interactive');
    }
  }

  // @ts-ignore - overriding internal Leaflet method
  _reset() {
    // Call parent reset to position/size the canvas DOM element
    // @ts-ignore
    super._reset();
    
    if (!this._canvas) return;

    // Get the size of the canvas as positioned by Leaflet
    const widthCss = parseInt(this._canvas.style.width || '0', 10);
    const heightCss = parseInt(this._canvas.style.height || '0', 10);
    
    const dpr = window.devicePixelRatio || 1;

    // Internal resolution with clamping to prevent exceeding GPU texture size limits
    const maxSimSize = 2048;
    const width = Math.min(Math.round(widthCss * dpr), maxSimSize);
    const height = Math.min(Math.round(heightCss * dpr), maxSimSize);

    if (width > 0 && height > 0 && (this._canvas.width !== width || this._canvas.height !== height)) {
      this._canvas.width = width;
      this._canvas.height = height;
      
      this.fire('canvas-resize', { width, height });
    }
  }

  getCanvas(): HTMLCanvasElement | null {
    return this._canvas;
  }
}

export function webGPULayer(bounds?: L.LatLngBoundsExpression, options?: L.ImageOverlayOptions) {
  return new WebGPULayer(bounds, options);
}
