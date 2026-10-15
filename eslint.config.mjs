import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"
import nextTs from "eslint-config-next/typescript"
import prettier from "eslint-config-prettier/flat"

/**
 * Únicos puntos de entrada permitidos para APIs que queremos centralizar.
 * `no-restricted-imports` no fusiona opciones entre bloques de configuración,
 * por eso cada excepción vuelve a declarar la regla completa sin su restricción.
 */
const ARCHIVOS_TABLA = ["src/components/data-table/**"]
const ARCHIVO_VIEW_TRANSITION = ["src/components/motion/transicion-vista.tsx"]

const MENSAJE_VIEW_TRANSITION =
  "Usa `TransicionVista`/`TransicionPagina` de `@/components/motion/transicion-vista` (tiene fallback y respeta reduced motion)."

/**
 * `ViewTransition` se vigila con selectores y no con `importNames`: esa opción
 * también rechaza `import * as React from "react"`, que usan los componentes de shadcn.
 */
const USOS_VIEW_TRANSITION = [
  {
    selector:
      "ImportDeclaration[source.value='react'] > ImportSpecifier[imported.name='ViewTransition']",
    message: MENSAJE_VIEW_TRANSITION,
  },
  {
    selector:
      ":matches(MemberExpression, JSXMemberExpression)[object.name='React'][property.name='ViewTransition']",
    message: MENSAJE_VIEW_TRANSITION,
  },
]

const PAQUETES_PROHIBIDOS = [
  {
    name: "framer-motion",
    message: "Usa `motion/react` (o `motion/react-m` con LazyMotion).",
  },
  {
    name: "vaul",
    message: "Usa el Drawer de Base UI (`@/components/ui/drawer`).",
  },
  { name: "clsx", message: "Usa `cn` desde `@/lib/utils`." },
  { name: "tailwind-merge", message: "Usa `cn` desde `@/lib/utils`." },
  {
    name: "recharts",
    message: "Los gráficos usan Chart.js (`@/components/charts`).",
  },
]

const RESTRICCION_TABLA = {
  name: "@tanstack/react-table",
  message:
    "TanStack Table solo se importa dentro de `src/components/data-table/**`; usa sus componentes.",
}

const PATRONES_PROHIBIDOS = [
  {
    group: ["@radix-ui/*"],
    message:
      "El proyecto usa Base UI (`@base-ui/react`) vía `@/components/ui`.",
  },
]

function reglaImportaciones({ permitirTabla = false } = {}) {
  const paths = permitirTabla
    ? PAQUETES_PROHIBIDOS
    : [...PAQUETES_PROHIBIDOS, RESTRICCION_TABLA]
  return ["error", { paths, patterns: PATRONES_PROHIBIDOS }]
}

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    name: "amo/importaciones-restringidas",
    rules: {
      "no-restricted-imports": reglaImportaciones(),
      "no-restricted-syntax": ["error", ...USOS_VIEW_TRANSITION],
    },
  },
  {
    name: "amo/importaciones-data-table",
    files: ARCHIVOS_TABLA,
    rules: {
      "no-restricted-imports": reglaImportaciones({ permitirTabla: true }),
    },
  },
  {
    name: "amo/importaciones-view-transition",
    files: ARCHIVO_VIEW_TRANSITION,
    rules: { "no-restricted-syntax": "off" },
  },
  {
    name: "amo/typescript",
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  // Desactiva reglas de estilo que chocan con Prettier (debe ir al final).
  prettier,
  globalIgnores([
    ".next/**",
    ".next-*/**",
    "out/**",
    "build/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
    "public/**",
    "context/**",
    "supabase/**",
    "src/types/database.types.ts",
    "src/lib/geo/diccionarios/**",
  ]),
])

export default eslintConfig
