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
    this._canvas.style.outline = '1px solid rgba(56, 189, 248, 0.4)'; // Thin border for the model boundary

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

    // Decouple internal resolution from zoom/screen-size.
    // Calculate a stable simulation aspect ratio and resolution (max 2048px along major axis)
    // using the geographical coordinates of the model bounds.
    const bounds = this.getBounds();
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    const latHeight = ne.lat - sw.lat;
    const lngWidth = ne.lng - sw.lng;
    
    // Project aspect ratio (approximate Mercator correction at mean latitude)
    const meanLat = ((sw.lat + ne.lat) / 2) * Math.PI / 180;
    const aspect = latHeight > 0 ? (lngWidth * Math.cos(meanLat)) / latHeight : 1.0;

    const maxSimSize = 2048;
    let width = maxSimSize;
    let height = maxSimSize;
    if (aspect >= 1.0) {
      height = Math.max(128, Math.round(maxSimSize / aspect));
    } else {
      width = Math.max(128, Math.round(maxSimSize * aspect));
    }

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
