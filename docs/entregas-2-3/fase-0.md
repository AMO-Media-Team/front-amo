# Fase 0 — Desbloqueo y cimientos

Objetivo: que el equipo AMO registre anunciantes y medios y los invite (hoy el cliente no puede crear ni un
medio), y dejar listos los bloques que usarán todas las fases siguientes. Lee primero
[`README.md`](README.md) (reglas de propiedad y verificación).

Ya hecho por el líder (no lo rehagas):

- Migración `supabase/migrations/20261022024336_e2_desbloqueo.sql`: ROL-008 (`private.puede_gestionar` ignora
  los permisos «propios» de los roles externos) y la validación del NIT (`private.digito_verificacion_nit`,
  trigger `trg_anunciantes_b_identificacion`: DV obligatorio y correcto para Colombia, error
  `AMO_CONFIG_INVALIDA` con `detail` en español; NIT/DV/identificación extranjera/país solo los cambia quien
  tenga `anunciantes.editar`, error `AMO_NO_AUTORIZADO`).
- `BotonCrearUsuario` (`src/features/usuarios/components/hoja-crear-usuario.tsx`) acepta
  `organizacion?: OrganizacionFija` (`{ tipo: "ANUNCIANTE" | "MEDIO"; id; nombre }` de
  `src/features/usuarios/tipos.ts`), `texto?` y `variante?`. Necesita `<ProveedorGestionUsuarios
datos={await cargarDatosGestion(usuario)}>` (`src/features/usuarios/components/contexto-gestion.tsx`,
  `src/features/usuarios/gestion.ts`) alrededor.
- El aviso de la hoja de usuarios ya enlaza a `/operacion/medios?registrar=1` y
  `/operacion/anunciantes?registrar=1`: esos parámetros deben abrir la hoja de registro al llegar.

## Paquete RM — Registrar y editar medio (equipo AMO)

**Propiedad:** `src/features/gestion-medios/**` (nuevo: `actions.ts`, `schemas.ts`, `queries.ts`, `components/`,
pruebas), `src/app/(app)/operacion/medios/page.tsx`, `src/app/(app)/operacion/medios/[id]/page.tsx`.

- Botón «Registrar medio» en el encabezado del listado (`EncabezadoPagina acciones`), visible con
  `medios.editar`. Hoja lateral (patrón `HojaLateral`/`FormularioHoja` de
  `src/features/configuracion/components/hoja-lateral.tsx` o el de la hoja de usuarios, con confirmación al
  descartar) con: nombre (2–120), tipo (`TIPOS_MEDIO` de `src/features/operacion/estados.ts`), municipio
  (`SelectorMunicipio` de `src/features/configuracion/components/selector-municipio.tsx`; la BD rechaza
  municipios inactivos con `AMO_CONFIG_INVALIDA`), descripción de la audiencia (opcional, ≤ 1000) y categorías
  temáticas (varias, de `categorias` activas y no borradas; `medio_categorias`).
- Escritura con el cliente de sesión (`crearClienteServidor`): `insert` en `medios` (RLS exige `medios.editar`;
  nace PENDIENTE; la bitácora registra al actor) y luego `medio_categorias`. Si falla lo segundo, informa sin
  dejar datos a medias (borra lo insertado o usa un orden que no lo requiera). Errores con `mensajeErrorBd`.
- `?registrar=1` abre la hoja al llegar (y limpia el parámetro al cerrarla).
- Al crear: toast y navegación a la ficha `/operacion/medios/[id]`, que ofrece invitar a su equipo.
- Ficha (`[id]/page.tsx`): en `CabeceraFicha` (`lateral`) los botones «Editar datos» (misma hoja en modo
  edición: nombre, tipo, municipio, descripción y categorías, con bloqueo optimista por `updated_at`) e
  «Invitar usuario» (`BotonCrearUsuario` con `organizacion` fija, `texto="Invitar usuario"`,
  `variante="outline"`, solo con `usuarios.invitar`). Añade una pestaña «Usuarios» con las personas
  vinculadas (`perfiles` con ese `medio_id`: nombre, correo, rol, estado y enlace a
  `/administracion/usuarios/[id]`), visible con `usuarios.ver`; estado vacío que invita a crear el primero.
- Pruebas: esquema zod (límites, categorías únicas) y la lógica pura que extraigas.

## Paquete RA — Registrar y editar anunciante (equipo AMO)

**Propiedad:** `src/features/gestion-anunciantes/**`, `src/lib/colombia/nit.ts` (+ prueba),
`src/app/(app)/operacion/anunciantes/page.tsx`, `src/app/(app)/operacion/anunciantes/[id]/page.tsx`.

- `src/lib/colombia/nit.ts`: `digitoVerificacion(nit: string): string` (DIAN, módulo 11, pesos
  3,7,13,17,19,23,29,37,41,43,47,53,59,67,71 de derecha a izquierda; residuo 0 o 1 → ese dígito, si no 11 −
  residuo), `nitValido(nit, dv)`, `normalizarNit(texto)` (quita puntos, espacios y el guion del DV) y
  `formatearNit(nit, dv)` → `900.123.456-8`. Casos: 999000001→2, 900123456→8, 860002183→9.
- Botón «Registrar anunciante» (con `anunciantes.editar`) y hoja con: razón social (2–200), nombre comercial
  (2–120), sector (`sectores` activos), país (`paises`, Colombia por omisión). Colombia: NIT (6–15 dígitos) y DV
  (sugerido en vivo; si el usuario escribe otro, error claro antes de enviar) y municipio (`SelectorMunicipio`).
  Extranjero: identificación tributaria (2–40) y ciudad (≤ 120), sin NIT ni municipio. Correo de facturación
  opcional en `datos_facturacion.email_facturacion`.
- Escritura con el cliente de sesión (`insert` en `anunciantes`; nace PENDIENTE). Los errores del trigger del NIT
  llegan con `detail` en español: muéstralos en el campo NIT.
- `?registrar=1`, toast + navegación a la ficha, «Editar datos» (incluye NIT/DV: el equipo AMO sí puede) e
  «Invitar usuario» y pestaña «Usuarios», igual que RM.
- En la ficha y el listado muestra el NIT con `formatearNit` donde hoy se muestre crudo, si es sencillo y está
  dentro de tus archivos.
- Pruebas: `nit.test.ts` y esquema zod (Colombia vs extranjero).

## Paquete F1 — Archivos: subida directa a Storage y descarga firmada

**Propiedad:** `src/lib/archivos/**`, `src/components/archivos/**`, `src/lib/storage/**` (nuevos).

- `src/lib/archivos/` (puro, sin React): `validarArchivo(archivo, reglas)` con
  `{ mimes, maxBytes, aspecto?: { relacion, tolerancia }, duracionMaxSeg? }` → resultado con mensaje en
  español; `sha256Hex(archivo)` (Web Crypto, por bloques para archivos de hasta 50 MB);
  `comprimirImagen(archivo, { maxLado, calidad })` → WebP con `browser-image-compression` cargado de forma
  diferida desde `/vendor/browser-image-compression.js` (mira cómo lo hace
  `src/features/cuenta/components/procesar-avatar.ts`) y `generarMiniatura(archivo)` (≤ 320 px);
  `leerDimensiones(archivo)` (imagen o video) y `leerDuracionVideo(archivo)`. Pruebas de lo que sea puro.
- `src/lib/storage/` (servidor, `server-only`): constructores de rutas por bucket según
  `docs/modelo-datos.md` §8 (`documentos/medio/{id}/{tipo}/…`, `documentos/anunciante/{id}/{tipo}/…`,
  `creativos/oferta/{oferta}/{creativo}/…`, `evidencias/asignacion/{id}/publicacion|metrica/…`,
  `evidencias/disputa/{id}[/interno]/…`, `soportes/…`) que rechazan `..`, `/` inicial y `//`, con nombre de
  archivo `uuid + extensión`; `prepararSubidaFirmada({ cliente, bucket, ruta })` → `{ ruta, token }`
  (`createSignedUploadUrl`); `confirmarObjeto({ cliente, bucket, ruta })` (existe); `firmarDescarga`
  como usuario o como servicio (este último registra `URL_FIRMADA` con `registrarEvento`, igual que
  `firmarEvidencias` en `src/features/operacion/actions.ts`) usando `vigenciaUrlFirmada()` de
  `src/lib/supabase/url-firmada.ts`. Nada de Server Actions aquí: son utilidades que cada feature usa en su
  `actions.ts`.
- `src/components/archivos/` (cliente): `useSubida({ preparar, confirmar, comprimir?, reintentos })` →
  `{ subir, progreso, estado, error, cancelar }` con reintentos con espera creciente, pausa mientras
  `navigator.onLine` es falso y reanudación; para archivos > 6 MB usa TUS (`tus-js-client`, ya instalado) contra
  `${NEXT_PUBLIC_SUPABASE_URL}/storage/v1/upload/resumable` con el JWT de la sesión del navegador (RLS de
  Storage) y `chunkSize` de 6 MB; para el resto `uploadToSignedUrl`. Componentes: `ZonaArchivos`
  (`react-dropzone`, accesible, `capture` opcional para la cámara del celular, mensajes de rechazo),
  `ListaSubidas` (progreso, reintentar, quitar) y `VisorArchivoFirmado` (imagen, PDF en pestaña nueva, video
  con `<video>`; renueva la URL antes de que venza, como `useFirmas`). Todo en español, accesible y móvil.

## Paquete F2 — Asistente por pasos, territorio y cuenta regresiva

**Propiedad:** `src/components/asistente/**`, `src/components/territorio/**`, `src/components/tiempo/**`,
`src/features/territorio/**` (nuevo: `actions.ts`, `queries.ts`), y el import en
`src/features/roles/components/*` que use `use-guardia-salida` (solo esa línea).

- `src/components/asistente/`: `Asistente` (pasos con id, título y validación; paso actual en la URL con
  `nuqs`), `IndicadorPasos` (lista ordenada accesible, `aria-current="step"`, compacta en 390 px), `PieAsistente`
  fijo abajo (Atrás / Siguiente / Guardar borrador / Enviar, estados de carga) y `use-guardia-salida.ts`
  movido desde `src/features/roles/components/` (deja la versión de roles importándolo desde aquí).
- `src/components/territorio/selector-territorio.tsx`: modo `municipio` (departamento → municipio, solo
  activos) y modo `segmentacion` (varios departamentos y municipios como fichas). Los datos activos los da
  `src/features/territorio/actions.ts` (`listarDepartamentosActivos()`, `listarMunicipiosActivos(departamento)`;
  `requerirUsuario`, lectura de `departamentos`/`municipios` con RLS) con caché en el cliente (TanStack Query).
- `src/components/tiempo/cuenta-regresiva.tsx`: extrae `useAhora` de
  `src/features/dashboard/medio/components/proximas-acciones.tsx` a `src/components/tiempo/use-ahora.ts` (y
  cambia ese import en `proximas-acciones.tsx`, solo esa línea) y crea `CuentaRegresiva` («Vence en 4 h 12 min»,
  tono por urgencia, `aria-live` cortés, respeta movimiento reducido).
- Pruebas de la lógica pura (formato de la cuenta regresiva, navegación de pasos).

## Paquete F3 — Cifrado, errores de BD, URL de publicaciones y transiciones

**Propiedad:** `src/lib/cifrado.ts` (+ prueba), `src/lib/errores-bd.ts` (+ prueba),
`src/features/usuarios/errores.ts` (solo para re-exportar), `src/lib/redes/**`, `src/lib/negocio/**`,
`scripts/db/transiciones-ts.ts`.

- `src/lib/cifrado.ts` (`server-only`): AES-256-GCM con la llave de `AMO_CIFRADO_KEY` (formato `k<n>:<base64 de
32 bytes>`, ver `src/lib/env-esquema.ts`) y `AMO_CIFRADO_KEY_ANTERIOR` opcional para rotar. API:
  `cifrar(texto) → "v<n>:<iv>:<ct>:<tag>"` (base64url), `descifrar(valor)` (elige la llave por versión),
  `huella(texto)` (HMAC-SHA256 hex con subllave HKDF, para unicidad sin revelar), `ultimos4(texto)`. Lee el
  CHECK de `medios_privado` en la migración `20260930222842_negocio_actores.sql` y respeta su formato
  (hoy `^v1:`; si exige algo distinto a lo anterior, adáptate y repórtalo).
- `src/lib/errores-bd.ts`: mueve aquí `mensajeErrorBd`, `codigoNegocio`, `MENSAJE_INESPERADO` y amplía
  `MENSAJES_NEGOCIO` con todos los códigos `AMO_*` que lanzan las migraciones
  (`grep -o "AMO_[A-Z_]*" supabase/migrations/*.sql | sort -u`), con textos claros para la persona;
  `mensajeErrorBd(error, restriccionesExtra?)`. `src/features/usuarios/errores.ts` re-exporta lo movido para no
  romper a nadie.
- `src/lib/redes/url-post.ts`: `validarUrlPost(plataforma, url)` para FACEBOOK, INSTAGRAM y TIKTOK (dominios y
  rutas de post, reel, historia o video), alineado con las expresiones de la BD (busca `url_post` y `~*` en las
  migraciones) → `{ ok } | { ok: false, mensaje, ejemplo }`; `normalizarUrlPost(url)` (sin parámetros de rastreo
  ni barra final). Pruebas con casos reales.
- `scripts/db/transiciones-ts.ts` (`pnpm db:transiciones <entorno>`, el líder añade el script): lee
  `private.transiciones_estado` con la conexión de `scripts/db/entorno-db.ts` (solo `select`) y escribe
  `src/lib/negocio/transiciones.generated.ts` (arreglo tipado y ordenado, cabecera «generado, no editar»).
  Genéralo una vez contra **producción en solo lectura** (`.env.db.produccion` existe; mismo esquema).
  `src/lib/negocio/acciones.ts`: `transicionesDesde(entidad, estado, tipoActor)` y
  `accionesPermitidas(entidad, estado, tipoActor, permisos)` → destinos con `requiereMotivo` y descripción.
  Pruebas.
