// PELAGOS is browser-only. Babylon intentionally types DynamicTexture against
// its reduced cross-platform canvas surface; our procedural material painters
// use the browser Canvas2D API. These overloads describe the actual Safari/DOM
// object provided at runtime without changing any generated texture logic.
import '@babylonjs/core/Engines/ICanvas.js';

declare module '@babylonjs/core/Engines/ICanvas.js' {
  interface ICanvas {
    remove(): void;
    getContext(contextId: '2d', options?: CanvasRenderingContext2DSettings): CanvasRenderingContext2D | null;
    getContext(contextId: 'bitmaprenderer', options?: ImageBitmapRenderingContextSettings): ImageBitmapRenderingContext | null;
    getContext(contextId: 'webgl', options?: WebGLContextAttributes): WebGLRenderingContext | null;
    getContext(contextId: 'experimental-webgl', options?: WebGLContextAttributes): WebGLRenderingContext | null;
    getContext(contextId: 'webgl2', options?: WebGLContextAttributes): WebGL2RenderingContext | null;
    getContext(contextId: string, options?: unknown): RenderingContext | null;
  }
  interface ICanvas extends HTMLCanvasElement {}
  interface ICanvasRenderingContext extends CanvasRenderingContext2D {}
}
