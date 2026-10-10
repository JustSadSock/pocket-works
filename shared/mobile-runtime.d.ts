export interface ViewportState {
  width: number;
  height: number;
  offsetTop: number;
  keyboardInset: number;
  standalone: boolean;
}
export function getViewportState(): ViewportState;
export function capturePointer(element: Element | null, pointerId: number): boolean;
export function releasePointer(element: Element | null, pointerId: number): boolean;
type GestureHandler = (event: PointerEvent, pointers: Map<number, PointerEvent>) => void;
export function bindPointerGesture(element: Element, handlers?: {
  onStart?: GestureHandler;
  onMove?: GestureHandler;
  onEnd?: GestureHandler;
  onCancel?: GestureHandler;
}, options?: { capture?: boolean }): () => void;
export function setDocumentScrollLocked(locked: boolean): void;
export function installMobileRuntime(options?: {
  pressSelector?: string;
  selectableSelector?: string;
  calloutSelector?: string;
}): {
  getViewportState: typeof getViewportState;
  refreshViewport: () => void;
  refreshControls: () => void;
  setScrollLocked: typeof setDocumentScrollLocked;
  destroy: () => void;
};
