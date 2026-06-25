declare const process: { env: Record<string, string | undefined>; platform: string };
declare module 'node:path' { const path: { join(...parts: string[]): string; dirname(path: string): string }; export default path; }
declare module 'node:url' { export function fileURLToPath(url: string | URL): string; }
declare module 'electron' {
  export const app: {
    getPath(name: 'userData'): string;
    whenReady(): Promise<void>;
    on(event: string, listener: (...args: unknown[]) => void): void;
    quit(): void;
  };
  export class BrowserWindow {
    constructor(options?: unknown);
    loadURL(url: string): Promise<void>;
    loadFile(filePath: string): Promise<void>;
    static getAllWindows(): BrowserWindow[];
  }
}
