// react-dom ships with the web build but not its types; this is the one function the app uses
// (StreamPanel.web.tsx). Adding @types/react-dom instead rewrites the lockfile on Windows.
declare module 'react-dom' {
  import type { ReactNode, ReactPortal } from 'react';

  export function createPortal(children: ReactNode, container: Element | DocumentFragment): ReactPortal;
}
