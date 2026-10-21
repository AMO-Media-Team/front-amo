# Datos demo

Quince meses de operación verosímil (julio de 2025 → «hoy» de la carga) para mostrar AMO con tableros, mapas,
reportes, finanzas, accesos y auditoría llenos. Diseño completo: `docs/modelo-datos.md` §10.

Todo lo que se genera queda marcado `es_demo = true` (o cuelga de una fila que lo está) y se borra con la purga. **No
es para producción real**: los scripts exigen `--forzar` si `NEXT_PUBLIC_SITE_URL` no es local.

## Canal de ejecución

Los interruptores `amo.modo_carga`, `amo.reloj` y `amo.purga` solo tienen efecto con `session_user = postgres`. Por
PostgREST (incluso con la secret key) la sesión es `authenticator`, y el proyecto no tiene driver de Postgres. Por eso:

- **SQL** → MCP `execute_sql` sobre el proyecto (`zygfqfvqwfvhbirmjojp`), siempre dentro de
  `begin; set local amo.modo_carga = 'on'; set local statement_timeout = '110s'; …; commit;`.
- **Usuarios de Auth y Storage** → scripts TS con la Admin API (`pnpm demo:generar`, `pnpm demo:purgar`).

Nunca se usa `apply_migration`: los datos demo y su andamiaje no son migraciones.

## Archivos

| Archivo            | Contenido                                                                                                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `00_base.sql`      | Tablas de plan `private.demo_*` (control, usuarios, anunciantes, medios, cuentas, eventos y avisos en espera) y utilidades (`demo_hoy`, `demo_ip`, `demo_parche`…).     |
| `01_catalogos.sql` | `demo_catalogos()`: fija el «hoy» de la demo, vigencia anterior de tarifas, retención en la fuente demo y resoluciones DIAN con prefijo `DEMO`.                         |
| `02_actores.sql`   | `demo_actores(semilla)`: 40 anunciantes, 300 medios, cuentas sociales, audiencia por país, documentos y la vinculación de los usuarios con su rol y organización.       |
| `03_mes.sql`       | `demo_mes(mes, semilla)`: campañas, ofertas, vistas, aceptaciones, publicaciones, métricas, disputas y estados de un mes.                                               |
| `04_finanzas.sql`  | `demo_finanzas(mes, semilla)`: liquidaciones quincenales por medio (retenciones, documento soporte o factura del medio, dispersión y pago) y factura mensual con pagos. |
| `05_accesos.sql`   | `demo_accesos(semilla, dias)`: eventos de autenticación de los últimos 90 días con país, ciudad, lat/lon e intentos sospechosos.                                        |
| `06_cierre.sql`    | `demo_cierre`, `demo_volcar_bitacora(mes)`, `demo_volcar_avisos(dias)` y `demo_verificar()`.                                                                            |
| `99_limpieza.sql`  | Borra el andamiaje `private.demo_*` (funciones y tablas de plan). No toca datos.                                                                                        |
| `pasos/*.sql`      | Los escribe `pnpm demo:generar pasos`: una transacción por paso, en el orden de ejecución.                                                                              |

Si hay que corregir una función ya creada, `select private.demo_parche('<firma>', $v$viejo$v$, $n$nuevo$n$)` cambia
el cuerpo sin reenviar el archivo; el mismo cambio se aplica al `.sql` para que ambos queden iguales.

## Generar

Requisitos: migraciones y semillas de catálogos aplicadas, `.env.local` con las claves de Supabase y ningún dato demo
previo (si lo hay, primero «Purgar»).

1. **Usuarios** — `pnpm demo:generar usuarios [--forzar]`. Crea en Auth las 363 cuentas de `scripts/demo/cuentas.ts`,
   enrola TOTP en las tres internas con nombre y **agrega** a `.env.local` las credenciales `DEMO_*` (no las imprime).
   Es idempotente.
2. **Definiciones** — ejecutar por MCP `00_base.sql` … `06_cierre.sql`, en orden. Las funciones largas van una por
   llamada.
3. **Pasos** — `pnpm demo:generar pasos [--desde 2025-07] [--semilla 0.4242]` escribe `pasos/*.sql`. Se ejecutan por
   MCP **en orden de nombre, una llamada por archivo** (cada una tarda pocos segundos):

   | Paso                  | Llamada                               | Qué deja                                                         |
   | --------------------- | ------------------------------------- | ---------------------------------------------------------------- |
   | `10_catalogos`        | `demo_catalogos()`                    | «hoy» de la demo y catálogos                                     |
   | `11_actores`          | `demo_actores(semilla)`               | anunciantes, medios, cuentas, perfiles vinculados                |
   | `20_mes_AAAA-MM`      | `demo_mes(mes, semilla)`              | la operación de cada mes, en orden cronológico                   |
   | `40_finanzas_AAAA-MM` | `demo_finanzas(mes, semilla)`         | liquidaciones, documentos soporte, dispersiones, facturas, pagos |
   | `50_cierre`           | `demo_cierre(semilla)`                | suspensiones y eventos de configuración                          |
   | `51_accesos`          | `demo_accesos(semilla)`               | accesos de 90 días y `perfiles.ultimo_acceso_at`                 |
   | `60_bitacora_AAAA-MM` | `demo_volcar_bitacora(mes)`           | bitácora con origen `DEMO`, en orden cronológico                 |
   | `70_avisos`           | `demo_volcar_avisos()`                | notificaciones de los últimos 90 días                            |
   | `80_verificar`        | `demo_verificar()` (sin transacción)  | `{"ok": true, "errores": [], "volumenes": {…}}`                  |

   El orden importa: las finanzas necesitan la operación de **todos** los meses; `50` y `51` dejan eventos y avisos en
   espera que `60` y `70` vuelcan. Para conservar el resultado de cada paso se puede guardar en el control:

   ```sql
   begin;
   set local amo.modo_carga = 'on';
   set local statement_timeout = '110s';
   insert into private.demo_control (clave, valor)
   select 'fin_2026-09', private.demo_finanzas(date '2026-09-01', 0.4242)::text
   on conflict (clave) do update set valor = excluded.valor;
   commit;
   select valor from private.demo_control where clave = 'fin_2026-09';
   ```

4. **Remate** — `truncate private.demo_eventos, private.demo_avisos;` (ya vacías; libera su espacio) y `analyze` de
   `bitacora`, `accesos`, `notificaciones`, `asignaciones`, `liquidaciones` y `facturas`.
5. **Validar** — además de `demo_verificar()`, las RPC de analítica con los claims de un superadministrador dentro de
   `begin … rollback` (mismo patrón de `supabase/tests/humo_analitica.sql`).
6. **Andamiaje** — `99_limpieza.sql` es opcional tras generar: mientras exista, las tablas de plan conservan el perfil
   de conexión de cada usuario y los factores de cada medio (útiles para ajustar datos), e impiden generar dos veces
   (`demo_actores` y `demo_accesos` se niegan si ya hay datos). Vive en `private`, sin `EXECUTE` para ningún rol de la
   API.

### Qué dejó la carga del 6 de octubre de 2026

«Hoy» de la demo: 5-oct-2026 17:14 (Bogotá). Semilla 0.4242.

| Tabla                              | Filas demo | Tabla                 | Filas demo |
| ---------------------------------- | ---------: | --------------------- | ---------: |
| perfiles (cuentas demo)            |        363 | liquidaciones         |      2.326 |
| anunciantes                        |         40 | documentos_soporte    |      2.127 |
| medios                             |        300 | dispersiones          |        107 |
| cuentas_sociales                   |        594 | facturas              |        164 |
| campanas / ofertas                 |  217 / 382 | pagos_anunciante      |        142 |
| asignaciones                       |      5.396 | accesos               |     10.059 |
| publicaciones / metricas           | 3.897 / 11.537 | bitacora          |     88.803 |
| medio_audiencia_paises             |      1.022 | notificaciones        |      6.498 |

Base de datos: 146 MB (la bitácora ocupa 64 MB).

### Cuentas para entrar a la demo

Credenciales en `.env.local` (`DEMO_<ROL>_EMAIL`, `_PASSWORD` y, en las internas, `_TOTP_SECRET`):

| Correo                      | Rol         | Organización                                             |
| --------------------------- | ----------- | -------------------------------------------------------- |
| `demo.admin@amo.test`       | ADMIN       | —                                                        |
| `demo.operaciones@amo.test` | OPERACIONES | —                                                        |
| `demo.finanzas@amo.test`    | FINANZAS    | —                                                        |
| `demo.anunciante@amo.test`  | ANUNCIANTE  | Supermercados La Cosecha (el anunciante con más campañas) |
| `demo.medio@amo.test`       | MEDIO       | el medio «estrella» (verificado, nivel 2, capital grande) |

El resto (`@demo.amo.co`) solo da identidad a los actores históricos: su contraseña es aleatoria y no se guarda.

## Purgar

En este orden. Los tres primeros pasos son destructivos e irreversibles.

1. `pnpm demo:purgar storage [--forzar]` — borra de Storage los objetos de las entidades demo y
   `evidencias/muestras/`. Va **antes** del SQL: necesita las filas para saber qué carpetas `{tipo}/{id}` son demo.
2. **SQL por MCP** — `pnpm demo:purgar sql` imprime la transacción:

   ```sql
   begin;
   set local amo.modo_carga = 'on';
   set local amo.purga = 'on';
   set local statement_timeout = '110s';
   select private.purgar_demo();
   commit;
   ```

   y a continuación `99_limpieza.sql` (sin él no se puede volver a generar).
3. `pnpm demo:purgar usuarios [--forzar]` — borra de Auth las cuentas demo (cascada a `perfiles`). Se niega a correr si
   el paso 2 aún no desvinculó sus organizaciones. Después hay que borrar a mano las variables `DEMO_*` de `.env.local`.
4. `pnpm demo:purgar verificar` — cuenta lo que sigue marcado `es_demo`; termina con error si queda algo.

A tener en cuenta:

- **Las pruebas E2E también son `es_demo`.** `private.purgar_demo()` borra por esa marca, así que se lleva las
  organizaciones y los datos de las cuentas `e2e.*@amo.test` (las cuentas en sí no se tocan, pero quedan sin
  organización). Tras una purga hay que volver a aprovisionarlas (`pnpm bootstrap:e2e` y las cuentas de pista).
- **La purga no borra los catálogos que agregó `demo_catalogos`**: la vigencia de tarifas del 15-jun-2025, las dos
  filas de retención en la fuente, las tarifas de ReteICA y las resoluciones DIAN `DEMO`. Todas están marcadas
  `pendiente_validacion`; antes de operar de verdad hay que revisarlas y desactivar las resoluciones `DEMO`.

## Notas

- **Los jobs de `pg_cron` siguen corriendo sobre los datos demo**: vencen asignaciones, cierran ofertas y envían
  recordatorios reales (esas filas tienen origen `DB`, no `DEMO`). Es el comportamiento esperado de una demo viva.
- **Storage está vacío.** Las rutas de capturas, creativos y soportes apuntan a objetos que no se subieron
  (`evidencias/muestras/…` y prefijos por entidad): las vistas que firman una URL no encontrarán el archivo.
- **Accesos**: solo los últimos 90 días (la retención borra lo anterior a `retencion.accesos_dias`). ≈ 92 % de los
  ingresos desde Colombia, resueltos a departamento y municipio; el resto desde 14 países. Las ráfagas de intentos
  fallidos desde RU, CN y NG no llevan usuario (así las registra la aplicación), solo `email_hash`.
- **Bitácora**: las filas demo tienen ids mayores que los de la actividad real anterior a la carga, aunque sus fechas
  sean más antiguas. El orden por `created_at` es el correcto.
- **El «hoy» de la demo es fijo.** No hay generación incremental: para avanzar la fecha se purga y se genera de nuevo.
