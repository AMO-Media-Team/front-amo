# Chuleta de APIs verificadas

> Snippets reales del corte vertical de referencia (`src/components/data-table`, `src/features/usuarios`,
> `src/app/(app)/administracion/usuarios`), compilados con `pnpm typecheck`, `pnpm lint`, `pnpm build`
> y probados con `e2e/usuarios.spec.ts` (Next 16.3.7, React 19.3, Base UI 1.8, TanStack Table 9.2.4,
> nuqs 2.10, RHF 7.89 + zod 4, @supabase/supabase-js 2.117). Cópialos; no los reescribas de memoria.

### 1. Base UI: `render` en lugar de `asChild`

```tsx
<EnlaceBoton href="/administracion/usuarios" variant="outline" size="sm">Usuarios</EnlaceBoton>
<DropdownMenuItem render={<Link href={rutaUsuario(id)} />}><Eye aria-hidden />Ver ficha</DropdownMenuItem>
<SheetTrigger render={<Button />}><UserPlus data-icon="inline-start" aria-hidden />Crear usuario</SheetTrigger>
<SheetClose render={<Button variant="ghost" size="icon-sm" aria-label="Cerrar" />}><X aria-hidden /></SheetClose>
<DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>Vista</DropdownMenuTrigger>
```

- **Un «botón» que navega es un enlace:** `EnlaceBoton` (`@/components/layout/enlace-boton`; `EnlaceBotonExterno`
  para `otpauth:`, `mailto:` o sitios externos). No uses `<Button render={<Link />} nativeButton={false}>`: Base UI
  le pone `role="button"` al `<a>` y el lector de pantalla anuncia un botón (verificado en el árbol de accesibilidad).
  `render={<Link />}` sí es correcto en `DropdownMenuItem`, `BreadcrumbLink` y `SidebarMenuButton`, que no cambian el rol.
- Los `Sheet`/`Dialog` de `components/ui` traen un botón de cierre con texto "Close": usa
  `showCloseButton={false}` y pon tu `SheetClose` con `aria-label="Cerrar"`.
- `Select` de Base UI muestra el _valor_ crudo en el trigger salvo que pases `items`:
  `<Select value={v} onValueChange={...} items={roles.map((r) => ({ value: r.id, label: r.nombre }))}>`.
  `onValueChange` puede entregar `null`: normaliza (`field.onChange(valor ?? "")`).
- `Checkbox`: `checked`, `indeterminate`, `onCheckedChange={(valor) => ...}`.
- `DropdownMenuCheckboxItem` no cierra el menú al marcar (`checked` + `onCheckedChange`).
- Iconos lucide v1: `CircleCheck` (no `CheckCircle`), `EllipsisVertical`, `ShieldEllipsis`, `MailClock`,
  `RotateCcwKey`; `Trash2`/`History`/`Fingerprint` existen como alias.

### 2. Tabla de datos (TanStack Table v9 + nuqs) — SOLO vía `@/components/data-table`

ESLint prohíbe importar `@tanstack/react-table` fuera de `src/components/data-table/**`.

```ts
// features/<dominio>/estado-tabla.ts — módulo puro, lo usan servidor y cliente
import {
  definirEstadoTabla,
  filtroDeIds,
  filtroDeOpciones,
} from "@/components/data-table/estado-url"
export const estadoTablaUsuarios = definirEstadoTabla({
  camposOrden: ["nombre", "email", "creado"] as const, // lista blanca = p_orden de la RPC
  ordenPorDefecto: { campo: "creado", descendente: true },
  filtros: {
    estado: filtroDeOpciones(Constants.public.Enums.perfil_estado),
    rol: filtroDeIds(),
  },
})
export type EstadoTablaUsuarios = EstadoTabla<typeof estadoTablaUsuarios>
// URL: ?q=ana&pagina=2&tamano=50&orden=nombre.asc&estado=ACTIVO,SUSPENDIDO
```

```tsx
// Server Component: mismos parsers que el cliente; searchParams es una promesa en Next 16
const estado = await estadoTablaUsuarios.cargar(searchParams)
const { filas, total } = await listarUsuarios(estado) // paginación en el servidor
return <TablaUsuarios filas={filas} total={total} />
```

```tsx
// Cliente ("use client"): columnas del dominio + TablaDatos
type UsuarioFila = { id: string; nombre: string | null; ... } // `type`, NO `interface` (RowData de TanStack)
const columna = crearColumnas<UsuarioFila>()
const columnas = useMemo(() => columna.columns([
  columna.accessor((f) => nombreVisible(f), {
    id: "usuario", header: "Usuario", enableHiding: false,
    meta: { titulo: "Usuario", campoOrden: "nombre", tarjeta: "titulo" },
    cell: ({ row }) => <CeldaUsuario fila={row.original} />,
  }),
  columna.accessor("email", { header: "Correo",
    meta: { titulo: "Correo", campoOrden: "email", ocultaPorDefecto: true, exportacion: "siempre" } }),
  columna.accessor((f) => f.creadoAt, { id: "creado", header: "Creado",
    meta: { titulo: "Creado", campoOrden: "creado", tarjeta: "oculta", formatoExportacion: "fecha" } }),
  columna.display({ id: ID_COLUMNA_ACCIONES, header: () => <span className="sr-only">Acciones</span>,
    meta: { titulo: "Acciones", exportacion: "nunca", alinear: "fin" }, cell: ({ row }) => <Menu ... /> }),
]), [deps])

<TablaDatos
  titulo="Usuarios de la plataforma"          // <caption>
  columnas={columnas} filas={filas} total={total} idFila={(f) => f.id}
  estadoTabla={estadoTablaUsuarios}
  filtros={[{ clave: "estado", titulo: "Estado", opciones: [{ valor: "ACTIVO", etiqueta: "Activo" }] }]}
  claveAlmacenamiento="usuarios"             // densidad y columnas en localStorage
  enlaceFila={(f) => `/administracion/usuarios/${f.id}` as Route}
  exportacion={{ nombre: "Usuarios AMO", onExportado: (r) => void registrarExportacion(r) }}
  accionesMasivas={({ ids, limpiar }) => <Button onClick={...}>Cerrar sesiones</Button>}
  vacio={{ icono: Users, titulo: "Aún no hay usuarios" }}
/>
```

- Página: `<LimiteErrorTabla recurso="los usuarios"><Suspense fallback={<EsqueletoTablaDatos columnas={6} filtros={4} />}>…</Suspense></LimiteErrorTabla>`.
- Núcleo TanStack (dentro de data-table): `useTable({ features: tableFeatures({ rowSortingFeature, rowPaginationFeature, columnVisibilityFeature, rowSelectionFeature, columnMeta: metaHelper<MetaColumna>() }), columns, data, getRowId, manualPagination: true, manualSorting: true, rowCount: total, state: {...}, on*Change })`, `table.FlexRender`, `functionalUpdate(updater, actual)`.
- La RPC debe devolver `total` aunque la página pedida no exista (ver `listar_usuarios`: ajusta el desplazamiento a la última página).

### 3. nuqs 2.10

```ts
// Cliente — tabla (navega al servidor, conserva la vista anterior mientras carga)
const [cargando, iniciar] = useTransition()
const [estado, fijar] = useQueryStates(definicion.parsers, {
  shallow: false,
  scroll: false,
  startTransition: iniciar,
})
fijar({ q: texto || null, pagina: null }, { limitUrlUpdates: debounce(350) }) // null = quitar de la URL
// Cliente — estado solo visual (pestañas): shallow por defecto, sin viaje al servidor
const [pestana, setPestana] = useQueryState(
  "pestana",
  parseAsStringLiteral(PESTANAS).withDefault("resumen")
)
```

- Parsers compartidos: impórtalos de `"nuqs/server"` en módulos puros (sirven en cliente y servidor).
- nuqs no codifica `@` en la URL (`?q=ana@amo.test`): en pruebas compara con `new URL(page.url()).searchParams.get("q")`.

### 4. Formulario: RHF + zod + Server Action + `setError`

```tsx
const esquema = useMemo(
  () => conReglasDeRol(esquemaCrearUsuario, rolesAsignables),
  [rolesAsignables]
)
const formulario = useForm({
  resolver: zodResolver(esquema),
  defaultValues: VALORES,
  mode: "onTouched",
})
const [pendiente, iniciar] = useTransition()
// Se envían los valores TAL COMO SE ESCRIBIERON: el servidor aplica el MISMO esquema (con transforms).
const enviar = formulario.handleSubmit(() =>
  iniciar(async () => {
    const resultado = await crearUsuario(formulario.getValues())
    if (!resultado.ok)
      return aplicarErroresServidor(formulario.setError, resultado, CAMPOS)
    toast.success("Usuario creado")
  })
)
// <FormProvider {...formulario}><form onSubmit={enviar} noValidate>…
// Error general: formulario.formState.errors.root?.servidor?.message
// Select/Radio de Base UI con <Controller name="rolId" render={({ field, fieldState }) => …} />
```

- No mandes `handleSubmit(datos)` (salida ya transformada: `celular: null` no pasa el esquema de entrada).
- Tipos: `EntradaX = z.input<typeof esquemaX>` para la acción; `useForm` infiere entrada/salida del resolver.

### 5. Server Action (patrón completo)

```ts
"use server"
import "server-only"
export async function suspenderUsuario(
  entrada: EntradaMotivo
): Promise<ResultadoAccion> {
  const actor = await requerirPermiso("usuarios.suspender") // 1. DAL (lo exige un test), fuera del try
  const validacion = esquemaMotivo.safeParse(entrada) // 2. mismo zod que el cliente
  if (!validacion.success) return desdeErrorZod(validacion.error)
  try {
    const contexto = await contextoDelActor(actor) // { actorId, sessionId, admin }
    const { error } = await contexto.admin.rpc("suspender_usuario_srv", {
      // 3. la BD revalida todo
      p_usuario_id: validacion.data.usuarioId,
      p_actor_id: contexto.actorId,
      p_session_id: contexto.sessionId,
      p_motivo: validacion.data.motivo,
    })
    if (error) return falloBd("suspender", error) // AMO_* → detalle en español; lo demás se loguea sin PII
    await fijarBloqueo(contexto, validacion.data.usuarioId, BLOQUEO_INDEFINIDO) // 4. Admin API DESPUÉS
    refresh() // 5. re-render en la misma respuesta
    return exito()
  } catch (error) {
    return falloInesperado("suspenderUsuario", error)
  }
}
```

- `ResultadoAccion<T>`: `exito(datos?)`, `fallo(mensaje, erroresCampo?)`, `desdeErrorZod(error)`; nunca lances errores esperados.
- Solo un `actions.ts` por dominio (`src/features/<dominio>/actions.ts`); cada export llama `requerirPermiso`/`requerirUsuario` directamente.
- Varios permisos: `requerirPermiso(["usuarios.eliminar", "usuarios.invitar"])` = al menos uno; exige combinaciones con `tieneAlgunPermiso`.
- Admin API de Auth (no pasa por triggers): primero `autorizar_gestion_usuario_srv(actor, sesión, objetivo, 'EDITAR'|'SUSPENDER'|'INVITAR'|'GENERAR_ENLACE'|'CERRAR_SESIONES')`.
- Escrituras de perfil con `crearClienteAdmin({ actorId })`: el trigger guardián ve al actor por `x-amo-actor` + `x-amo-srv`.
- Argumentos `null` en RPC: `argumentosRpc<"nombre_rpc">({ p_x: null, ... })` (los tipos generados los declaran no nulos).
- Enlaces y contraseñas se devuelven UNA vez en el resultado; en bitácora solo el tipo (`registrarEvento` de `@/lib/auth/registro`).
- `generateLink` y el correo de Supabase comparten token: si Auth envía el correo, no muestres además un enlace (invalida el del correo).

### 6. Consultas (`queries.ts`, `import "server-only"`)

```ts
const supabase = await crearClienteServidor()                     // JWT del usuario: RLS decide
const { data, error } = await supabase.rpc("listar_usuarios", argumentosListado(estado))
if (error) fallar("listar los usuarios", error)                   // se lanza → LimiteErrorTabla
const filas = data as ConNulos<Fila, "nombre" | "rol_id">[]       // las SRF generan columnas no nulas: corrígelo aquí
// Embebido de auto-referencia: usa la columna como pista
.select("…, rol:roles!perfiles_rol_id_fkey ( id, nombre ), invitador:invitado_por ( id, nombre, email )")
export const rolesAsignables = cache(async () => …)               // React.cache: una vez por solicitud
```

- Datos de `auth.*` (factores MFA, sesiones) solo vía SRF `security definer` que filtran `acceso_valido()` + permiso.
- Tabla aún inexistente en los tipos (M6): cliente sin tipos + zod (`listarOrganizaciones`), y `PGRST205`/`42P01` → lista vacía.

### 7. Páginas (`src/app/(app)/…/page.tsx`)

```tsx
export const metadata: Metadata = { title: "Usuarios" }
export default async function Pagina({
  searchParams,
}: PageProps<"/administracion/usuarios">) {
  const usuario = await requerirPermiso("usuarios.ver") // antes de cualquier consulta
  return (
    <ContenedorPagina>
      <EncabezadoPagina
        titulo="Usuarios"
        descripcion="…"
        acciones={
          tieneAlgunPermiso(usuario, ["usuarios.invitar"]) ? (
            <BotonCrearUsuario />
          ) : null
        }
      />
      <LimiteErrorTabla recurso="el resumen">
        <Suspense fallback={<EsqueletoKpis cantidad={5} />}>
          <SeccionMetricas />
        </Suspense>
      </LimiteErrorTabla>
      <LimiteErrorTabla recurso="los usuarios">
        <Suspense fallback={<EsqueletoTablaDatos />}>
          <SeccionTabla searchParams={searchParams} />
        </Suspense>
      </LimiteErrorTabla>
    </ContenedorPagina>
  )
}
```

- Detalle: `const { id } = await params; if (!UUID.test(id)) notFound()`. La última miga de la barra superior la nombra la
  propia página con `<TituloMiga titulo={nombre} />` (`@/components/layout/titulo-miga`; va en cualquier parte, también
  dentro de un Server Component): «Operación › Medios › Radio Pasto» en lugar de «Detalle». Las subpáginas con nombre fijo
  (los reportes) se registran en `subpaginas` de `src/lib/auth/navegacion.ts`.
- Rutas dinámicas con typedRoutes: `` `/administracion/usuarios/${id}` as Route ``. Tras crear una página: `pnpm typecheck` (corre `next typegen`).
- `loading.tsx` por ruta con el esqueleto fiel de la página; `LimiteErrorTabla` = `catchError` de `next/error` (`retry()`).
- Contexto de cliente compartido por la página (actor, roles asignables): Provider de cliente envolviendo Server Components (`ProveedorGestionUsuarios`).

### 8. Acción destructiva (UX)

```tsx
<DialogoMotivo abierto={accion === "suspender"} onAbiertoChange={cerrar} titulo={`¿Suspender a ${nombre}?`}
  descripcion="…" textoConfirmar="Suspender" destructivo
  onConfirmar={(motivo) => conAviso(suspenderUsuario({ usuarioId, motivo }), "Cuenta suspendida")} />
<DialogoConfirmacion abierto={accion === "eliminar"} textoVerificacion="ELIMINAR" destructivo
  onConfirmar={() => eliminarUsuario({ usuarioId, confirmacion: "ELIMINAR" })} ... />
```

- `onConfirmar` devuelve el `ResultadoAccion`: un fallo se muestra DENTRO del diálogo y lo deja abierto.
- Ofrece solo lo permitido (`accionesDisponibles`: permiso + estado + anti-escalada + no sobre sí mismo) y deja que la BD lo garantice.
- Toast al terminar; `refresh()` en la acción actualiza cifras (NumberFlow anima el cambio) y tabla.

### 9. Piezas compartidas (no las dupliques)

- **Periodo:** `SelectorPeriodo` (`@/components/filtros/selector-periodo`) es el único selector de periodo. No sabe de
  URL: recibe `rango`, `etiqueta`, `opciones` (`opcionesDePresets([...])`), `opcionActiva`, `onOpcion`, `onRango`,
  `describirRango` y, si aplica, `limite`, `nota`, `cargando`, `apariencia="barra"`. Cada módulo solo adapta su estado
  (`features/auditoria`, `operacion`, `dashboard`, `geo`). Para otro calendario usa `CLASES_CALENDARIO`,
  `claseCeldaCalendario` y `BotonOpcionPeriodo` del mismo archivo.
- **Cifras abreviadas:** una sola regla en `@/lib/format` — «mil», «M» (millones), «mil M» (miles de millones), «B»
  (billones), un decimal: `formatearCompacto`, `formatearCOPCompacto`, y `NumeroAnimado` con `formato="compacto"` /
  `"copCompacto"` (usa la misma `descomponerCompacto`). No uses `Intl` con `notation: "compact"`.
- **Bitácora desde la app:** `registrarEvento({ actorId, accion, entidad, entidadId, metadatos, admin? })` de
  `@/lib/auth/registro` (devuelve si quedó registrado). **Contexto de un `*_srv`:** `contextoDelActor(actor)` de
  `@/lib/auth/contexto-actor` → `{ actorId, sessionId, admin }`.
- **Enlaces al explorador:** `rutaExplorador({ metrica, departamento, nivel, periodo })` de `@/features/geo/rutas`.
- **URL firmadas:** `await vigenciaUrlFirmada()` de `@/lib/supabase/url-firmada` (lee la configuración; clave pública).
- **KPI que no se compara:** `<TarjetaKpi sinComparativo="Foto de hoy" />`; sin valor en un indicador a fecha de corte:
  `textoSinDatos="Sin datos a la fecha de corte"`.
- **Movimiento reducido:** las animaciones `animate-*` de marca se apagan solas en `globals.css` (sistema o preferencia
  de la cuenta); no hace falta `motion-reduce:animate-none`.

### 10. Trampas encontradas

- Colores resueltos en JS dentro de un componente que se pinta en el servidor (`style={{ background: tema.x }}`): el
  primer render del cliente debe ser idéntico al del servidor. `useTemaGraficos` ya lo garantiza (al hidratar repite
  la paleta del servidor y luego pinta el tema real); no leas tokens con `getComputedStyle` durante el render.
- React Compiler lint (`react-hooks/static-components`): no llames funciones que devuelven componentes en render (`const Icono = iconoPara(x)`); usa un mapa estático o un componente con `switch`.
- Tiempo relativo en componentes de cliente: `suppressHydrationWarning` en el `<time>` (SSR e hidratación pueden diferir un instante).
- Animación de entrada de filas con CSS (`animate-aparecer-arriba` + `animationDelay`), no con motion: se pinta en SSR sin esperar a hidratar.
- `pkill -f "next start"` no mata el servidor (el proceso se llama `next-server`): tras `pnpm build`, mata el PID que escucha en :3000 o servirá chunks borrados.
- Playwright: los toasts repiten textos de la página → acota con `getByRole("tabpanel", …)`/`dialog`; `<header>` dentro de `<main>` no es `banner`.
- TOTP en E2E: Supabase no acepta repetir el código de un periodo ya usado; espera al siguiente (`codigoNuevo`).
- Pruebas con reloj: un componente que tras hidratar lee la hora del dispositivo (`ProximasAcciones`, tiempos relativos)
  se prueba con el reloj fijado — `vi.useFakeTimers({ toFake: ["Date"] })` + `vi.setSystemTime(AHORA)` y
  `vi.useRealTimers()` al terminar —; con el reloj real pasa el día del fixture y falla al siguiente.
- Playwright, captura de página completa (`fullPage: true`): Chromium estrecha un instante la ventana, las tablas cruzan
  el corte `md` y sus filas repiten la animación de entrada (salen a medio aparecer). Usa `animations: "disabled"`.
- Transición de vista descartada (el teléfono gira o pliega su barra de direcciones al navegar): React lo publica como
  error global y `GuardiaTransiciones` lo marca como atendido; no lo captures en cada página. Un `TimeoutError` de la
  transición («timeout in DOM update») sí es un fallo real y se deja ver.
- Playwright, estructura de la suite: todos los specs importan `test`/`expect` de `e2e/utilidades/prueba.ts`, cuya
  guardia hace fallar la prueba ante una violación de la CSP, un error de consola o un aviso de hidratación (lo
  provocado a propósito se declara con `guardia.permitir(respuestaConEstado(503))`). Las pruebas de solo lectura usan las
  sesiones que abre una vez `e2e/preparacion.setup.ts` (`test.use({ storageState: sesion("interno") })`, también
  `"anunciante"` y `"medio"`) y corren en escritorio, tablet y móvil; lo que cambia una cuenta prepara la suya con
  `prepararCuentaMfa` + `abrirSesionMfa` y corre solo en escritorio.
- Playwright contra el Supabase remoto: `workers: 2` y `fullyParallel: false` (dos archivos a la vez; dentro de cada
  uno, en orden). Con tres navegadores a la vez sobre paneles y reportes las RPC analíticas llegan al
  `statement_timeout` (8 s) y los bloques muestran su error (`57014` en el log del servidor).
  Por lo mismo: para probar un cambio de periodo usa uno corto («Últimos 7 días», no «Este año») y no abandones una
  página pesada recién abierta (`goto` + `reload` seguidos): sus consultas no se cancelan y compiten con las siguientes.
- axe con animaciones de entrada: un texto a medio aparecer (opacidad < 1) da un `color-contrast` falso. Analiza con
  `reducedMotion: "reduce"` (ver `e2e/accesibilidad.spec.ts`).
- zod y la CSP: `z.object` prueba `new Function` al construirse y el navegador lo informa como violación aunque zod
  lo capture. `src/instrumentation-client.ts` fija `jitless` antes de que cargue ningún esquema; no lo quites.
- `upgrade-insecure-requests` solo se emite por HTTPS: en `http://localhost` Chromium pasaba a https el destino de un
  `fetch` redirigido por el proxy (prefetch de `/ingresar` con sesión) y la solicitud fallaba.
- PostgREST, inserción en bloque (`insert([...])`): las columnas que una fila omite llegan como `NULL`, no con su valor
  por defecto. Da a todas las filas las mismas claves.
- Un BRIN sobre la fecha no sirve un `order by fecha desc limit n` (ni filtra nada si las filas no están físicamente
  en orden, como tras la carga demo): la línea de tiempo de la bitácora leía la tabla entera (4,7 s). La paginación por
  conjunto necesita un B-tree en su mismo orden (`bitacora_created_at_id_idx`, migración 14).
