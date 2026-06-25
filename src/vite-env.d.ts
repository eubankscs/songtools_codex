declare module '*.css';
declare module 'react' {
  export type ReactNode = any;
  export function useCallback<T extends (...args: any[]) => any>(callback: T, deps: any[]): T;
  export function useEffect(effect: () => void | (() => void), deps?: any[]): void;
  export function useMemo<T>(factory: () => T, deps: any[]): T;
  export function useState<T>(initial: T | (() => T)): [T, (value: T | ((previous: T) => T)) => void];
  const React: { StrictMode: any };
  export default React;
}
declare module 'react-dom/client' {
  export default { createRoot: (element: Element) => ({ render: (node: any) => undefined }) };
}
declare module 'react/jsx-runtime' {
  export const jsx: any;
  export const jsxs: any;
  export const Fragment: any;
}
declare namespace JSX {
  interface IntrinsicAttributes { key?: string | number; }
  interface IntrinsicElements { [elementName: string]: any; }
}
declare namespace React { type ReactNode = any; interface MouseEvent { preventDefault(): void; } }
declare module 'vitest' {
  export function describe(name: string, fn: () => void): void;
  export function it(name: string, fn: () => void): void;
  export const expect: any;
}
