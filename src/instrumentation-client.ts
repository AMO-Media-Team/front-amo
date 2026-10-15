/**
 * Se ejecuta en el navegador antes de que arranque la aplicación (convención
 * `instrumentation-client` de Next), es decir, antes de que se evalúe el
 * primer módulo que declara un esquema.
 *
 * Zod compila sus validadores con `new Function` y, para saber si puede,
 * hace una prueba al construir el primer `z.object`. La CSP de AMO no admite
 * `unsafe-eval`: la prueba falla en silencio, pero el navegador la informa
 * como violación (un reporte a `/api/csp-report` por cada página cargada).
 * Con `jitless` zod no lo intenta y valida con su intérprete.
 */
import { config } from "zod/v4/core"

config({ jitless: true })
