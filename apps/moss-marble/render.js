import { DioramaRenderer as CoreDioramaRenderer } from './render-core14.js';
import { LivingGreenhouseLayer } from './greenhouse15.js';

export { polygonArea, triangulatePolygon } from './render-core14.js';

export class DioramaRenderer {
  constructor(canvas) {
    const core = new CoreDioramaRenderer(canvas);
    const greenhouse = new LivingGreenhouseLayer(canvas, core);

    return new Proxy(core, {
      get(target, property) {
        if (property === 'livingGreenhouse') return greenhouse;
        if (property === 'draw') {
          return (level, ball, aim, time, dt, mode) => {
            const result = target.draw(level, ball, aim, time, dt, mode);
            greenhouse.draw(level, ball, aim, time, dt, mode);
            return result;
          };
        }
        if (property === 'emit') {
          return (x, y, type, amount) => {
            target.emit?.(x, y, type, amount);
            greenhouse.emit(x, y, type, amount);
          };
        }
        if (property === 'destroy') {
          return () => {
            greenhouse.destroy();
            target.destroy?.();
          };
        }
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
      set(target, property, value) {
        Reflect.set(target, property, value, target);
        return true;
      }
    });
  }
}
