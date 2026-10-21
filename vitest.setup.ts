import "@testing-library/jest-dom/vitest"
import "vitest-canvas-mock"

import { cleanup } from "@testing-library/react"
import { afterEach } from "vitest"

// Con `globals: false` Testing Library no registra su limpieza automática.
afterEach(() => {
  cleanup()
})

// jsdom no implementa matchMedia (lo usan next-themes, motion y los hooks de UI).
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })
}
