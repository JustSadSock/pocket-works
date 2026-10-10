export interface WorkshopOptions {
  appName?: string;
  version?: string;
  cachePrefix?: string;
  storageNamespace?: string;
  triggerSelector?: string;
  shortcut?: boolean;
  onReset?: () => unknown;
}
export function createWorkshopMode(options?: WorkshopOptions): {
  open: () => void;
  close: () => void;
  refresh: () => Promise<void>;
  recordError: (error: unknown, source?: string) => void;
  getReport: () => unknown;
  destroy: () => void;
};
