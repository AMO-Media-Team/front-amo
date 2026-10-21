# Fuentes de la interfaz

Archivos variables (un archivo por familia, eje de peso) que `src/app/layout.tsx` carga con
`next/font/local`. Se sirven desde el propio despliegue: ni el desarrollo ni la compilación dependen
de alcanzar Google Fonts, y la CSP (`font-src 'self'`) no necesita orígenes externos.

| Archivo                                     | Familia           | Pesos   | Uso              |
| ------------------------------------------- | ----------------- | ------- | ---------------- |
| `geist-latin-wght-normal.woff2`             | Geist             | 100–900 | Interfaz y texto |
| `geist-mono-latin-wght-normal.woff2`        | Geist Mono        | 100–900 | Cifras y código  |
| `plus-jakarta-sans-latin-wght-normal.woff2` | Plus Jakarta Sans | 200–800 | Títulos y marca  |

- **Subconjunto**: `latin`, que cubre el español (á é í ó ú ñ ü ¿ ¡) y los símbolos monetarios.
- **Origen**: [Fontsource](https://fontsource.org) (`cdn.jsdelivr.net/fontsource/fonts/<familia>:vf@latest/latin-wght-normal.woff2`),
  descargadas el 9 de octubre de 2026.
- **Licencia**: las tres familias se distribuyen bajo SIL Open Font License 1.1, que permite
  incluirlas y redistribuirlas con el software.

Para actualizar una familia, reemplaza su archivo por la versión nueva del mismo origen y comprueba
la app en ambos temas; el nombre del archivo y `layout.tsx` no cambian.
