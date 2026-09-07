// PELAGOS is a browser-only Pocket Works app. Babylon deliberately exposes a
// reduced cross-platform canvas interface, while our procedural material
// painters use the full browser CanvasRenderingContext2D API.
import '@babylonjs/core/Engines/ICanvas.js';

declare module '@babylonjs/core/Engines/ICanvas.js' {
  interface ICanvas extends HTMLCanvasElement {}
  interface ICanvasRenderingContext extends CanvasRenderingContext2D {}
}
