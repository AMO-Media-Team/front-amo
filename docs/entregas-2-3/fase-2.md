# Fase 2 — Anunciante, campañas, asistente de oferta, creativos y moderación (E2)

Requisitos: ANU-001…010, ANU-014, ADM-003 y ADM-005 (criterios de aceptación en
`context/requisitos/datos/requisitos.mjs`, módulos ANU y ADM). Lee primero [`README.md`](README.md): sus reglas
(propiedad de archivos, nada de build/E2E/commits, base local solo con `begin … rollback`) siguen vigentes.

## Lo que ya tiene la base

Migración `20261022193647_e2_anunciantes_ofertas` (aplicada en la base local; tipos regenerados en
`src/types/database.types.ts` y transiciones en `src/lib/negocio/transiciones.generated.ts`, 145):

| Objeto                                                                                                                    | Uso                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `anunciantes.enviado_verificacion_at` + `enviar_anunciante_a_verificacion_srv(p_anunciante_id, p_actor_id, p_session_id)` | El anunciante envía (o reenvía tras un rechazo, que lo devuelve a PENDIENTE) su empresa a la cola. Exige en Colombia RUT y Cámara de Comercio cargados (PENDIENTE o APROBADO y vigentes); en el exterior, Cámara de Comercio u «Otro». Error `AMO_CONFIG_INVALIDA` con `detail` «Antes de enviar carga: RUT, Cámara de Comercio.». `RECHAZADO→PENDIENTE` ya no se hace por `transicionar_srv`.                                                                                                                                                                                                                                                          |
| Identificación del anunciante                                                                                             | Mientras la empresa no esté VERIFICADA (o SUSPENDIDA), su usuario corrige NIT, DV, país, identificación extranjera y razón social; después solo el equipo AMO (`anunciantes.editar`). DV inválido → `AMO_CONFIG_INVALIDA`. Nueva restricción `anunciantes_identificacion_ext_chk`: fuera de Colombia la identificación extranjera es obligatoria.                                                                                                                                                                                                                                                                                                       |
| Verificar anunciante                                                                                                      | `transicionar_srv('anunciantes', id, 'VERIFICADO')` exige RUT y Cámara APROBADOS y vigentes (Colombia) o Cámara/Otro (exterior); el `detail` dice qué falta con nombres legibles. `PENDIENTE→RECHAZADO` con motivo (queda en `motivo_estado`); `VERIFICADO⇄SUSPENDIDO` con motivo y `anunciantes.suspender`. Documentos: `transicionar_srv('documentos_anunciante', id, 'APROBADO'                                                                                                                                                                                                                                                                      | 'RECHAZADO', …, motivo, {"fecha_vencimiento":"YYYY-MM-DD","observaciones":"…"})`. |
| Carga interna de documentos                                                                                               | Política nueva: con `anunciantes.editar` se inserta en `documentos_anunciante` y se sube a `documentos/anunciante/{id}/{tipo}/…`. Los internos no leen el bucket: confirmar y firmar como servicio después del DAL.                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Suspensión                                                                                                                | Un anunciante que no está VERIFICADO no recibe aceptaciones nuevas (`private.medio_elegible`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Equipo (ANU-002)                                                                                                          | `public.miembros_organizacion()` (ya existía): compañeros de la empresa con nombre, correo, rol, estado y último acceso. Invitar sigue siendo del equipo AMO.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Campañas                                                                                                                  | `BORRADOR→ACTIVA` exige empresa verificada con cualquier actor. Cambiar fechas no puede dejar fuera la ventana de ofertas en revisión o publicadas. `public.disponible_campana(p_campana_id, p_excluir_oferta default null) → numeric`: lo que queda para una oferta (el máximo de las ofertas en revisión o publicadas y lo comprometido de las vencidas o cerradas; borradores y devueltas no reservan). Cancelar una campaña cancela en cascada sus ofertas sin obligaciones (también EN_EJECUCION).                                                                                                                                                 |
| `oferta_historial`                                                                                                        | Cada cambio de estado de una oferta: `desde, hacia, actor_tipo (ANUNCIANTE\|ADMIN\|SISTEMA), actor_id, comentario, created_at`. Las devoluciones guardan su comentario. SELECT para el dueño y `ofertas.ver`.                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Envío a revisión                                                                                                          | `transicionar_srv('ofertas', id, 'EN_REVISION')`: si falla, `hint` = `envio_oferta:<paso>` con paso ∈ `que`, `quien`, `cuando`, `cuanto`, `creativo`, `envio` y `detail` legible (p. ej. «La fecha límite de aceptación debe quedar al menos 24 horas después del envío.»). Presupuesto por encima de lo disponible → `AMO_PRESUPUESTO_CAMPANA` con `hint` `envio_oferta:cuanto`.                                                                                                                                                                                                                                                                       |
| Transiciones de oferta                                                                                                    | Anunciante: `BORRADOR\|DEVUELTA→EN_REVISION`, `EN_REVISION→BORRADOR` (retirar), `BORRADOR\|DEVUELTA→CANCELADA`, `PUBLICADA→CANCELADA` (motivo; falla si hay asignaciones que consumen cupo). Moderación (`ofertas.moderar`): `EN_REVISION→PUBLICADA`, `→DEVUELTA` (motivo = comentario), `→CANCELADA` (rechazo, motivo), `PUBLICADA→CANCELADA` (motivo). Modo asistido (`ofertas.gestionar`): también `DEVUELTA→EN_REVISION` y `EN_REVISION→BORRADOR`. El cron devuelve las ofertas cuya fecha límite vence en revisión y cancela borradores o devueltas caducados (aviso `oferta.caducada`).                                                           |
| Estimador                                                                                                                 | `public.estimar_oferta(p_formato_id, p_departamentos, p_municipios, p_categorias, p_seguidores_minimos, p_cupos jsonb {franja_id: n}, p_exclusividad_dias default null, p_medios_excluidos uuid[] default '{}', p_publicaciones smallint default 1)` → por franja `medios_elegibles, precio_mediano, inversion_estimada, alcance_mediano_estimado`. Precio, inversión y alcance son `null` con menos de `ofertas.estimador_n_minimo` (3) medios: «Sin estimación». El mínimo efectivo de seguidores es `max(medios.umbral_seguidores, seguidores_minimos)`.                                                                                             |
| Exclusiones                                                                                                               | `public.medios_para_exclusion(p_texto default null, p_ids uuid[] default null, p_limite default 20)` → `id, nombre, municipio` (sin cifras). Con texto (≥ 3 caracteres) busca medios verificados por nombre; con `p_ids` devuelve los ya excluidos.                                                                                                                                                                                                                                                                                                                                                                                                     |
| Exclusividad                                                                                                              | `ofertas.exclusividad_dias` null o 1–90 (cero ya no es válido); el recargo es `precios.recargo_exclusividad`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Creativos                                                                                                                 | `creativos.activado_at`. En BORRADOR o DEVUELTA, insertar un creativo crea la versión nueva y la deja vigente al instante. En PUBLICADA, CUPOS_COMPLETOS o EN_EJECUCION nace pendiente (`vigente = false`, `activado_at = null`, una por oferta: índice `creativos_pendiente_key`), se le cargan archivos y `activar_creativo_srv(p_creativo_id, p_actor_id, p_session_id)` la pone vigente, deja la anterior sin vigencia y avisa a los medios con asignaciones. En EN_REVISION no se crean versiones («Retira la oferta de revisión…»). Se editan la vigente de una oferta sin publicar y la pendiente de una publicada; nunca la que ven los medios. |
| Archivos de creativo                                                                                                      | Cada `creativo_archivos` exige `sha256` (64 hex), `ancho` y `alto`, `duracion_segundos` si es video, MIME del formato, peso ≤ mín(`peso_max_mb` del formato, `archivos.max_creativo_mb`), relación de aspecto dentro de `archivos.tolerancia_aspecto` (2 %) de alguna de `formatos.requisitos.relaciones_aspecto`, cantidad ≤ `max_archivos` (1 si no se indica) y el objeto ya subido a Storage con el mismo tamaño. Los errores son `AMO_CONFIG_INVALIDA` con `detail` legible. El medio solo lee archivos de versiones activadas.                                                                                                                    |
| Configuración pública                                                                                                     | El anunciante puede leer `ofertas.anticipacion_minima_horas`, `ofertas.minimo_medios`, `ofertas.estimador_n_minimo`, `campanas.tope_porcentaje_por_medio`, `archivos.max_creativo_mb`, `archivos.tolerancia_aspecto`, `precios.recargo_exclusividad`, `metricas.cortes_requeridos` y `medios.umbral_seguidores` (`configuracion` con `es_publica`). En producción la configuración de prueba deja anticipación 0 h, corte `["H24"]` y 25 MB.                                                                                                                                                                                                            |

Matriz plataforma × formato (`formatos`, con `requisitos`): Instagram POST_FEED (1:1, 4:5, 1.91:1), CARRUSEL (1:1, 4:5,
hasta 10), REEL (9:16, ≤ 90 s, solo video), HISTORIA (9:16, ≤ 60 s); Facebook POST_FEED, VIDEO (16:9, 1:1, 4:5,
9:16, ≤ 600 s), REEL, HISTORIA; TikTok VIDEO (9:16, ≤ 600 s). Tipo de creativo: `IMAGEN` (un archivo de imagen),
`VIDEO` (videos) o `CARRUSEL` (solo en el formato CARRUSEL, 2–10 archivos).

## Lo que integró el líder (no lo toques; si necesitas otra cosa ahí, repórtalo)

- Navegación (`src/lib/auth/navegacion.ts`): en «Mi negocio» del anunciante, «Mis campañas» (`/campanas`,
  `campanas.gestionar_propias`, subpágina `nueva`) y «Mi empresa» (`/empresa`, `anunciantes.editar_propio`,
  subpáginas `documentos` y `equipo`); en Operación, «Moderación» (`/operacion/moderacion`, `ofertas.moderar`) y la
  sección oculta «Ofertas» (`/operacion/ofertas`, `ofertas.ver`, `enMenu: false`) para que la ficha
  `/operacion/ofertas/[id]` tenga migas. Las migas enlazan cada segmento intermedio: toda ruta intermedia que
  crees debe tener `page.tsx` (aunque solo redirija tras el DAL).
- `/ir/[entidad]/[id]` (`src/features/enlaces/destinos.ts`): el anunciante va a `/empresa`, `/empresa/documentos`,
  `/campanas/{id}` y `/campanas/{campanaId}/ofertas/{id}`; quien verifica anunciantes, a
  `/operacion/anunciantes/{id}?pestana=verificacion`; quien ve ofertas, a `/operacion/ofertas/{id}`. Esas rutas y
  parámetros son contrato.
- `src/lib/negocio/transicionar.ts` (`server-only`): `transicionar(contexto, { entidad, id, hacia, motivo?, datos? })`
  sobre `transicionar_srv`; `contexto` sale de `contextoDelActor(usuario)`. Úsalo en vez de copiar la llamada.
- E2E: proyecto `anunciante` (`PROYECTO_ANUNCIANTE`, `SPECS_ANUNCIANTE = /anunciante-.*\.spec\.ts/`, un worker) para
  las pruebas que escriben; `e2e/navegacion.spec.ts` ya espera el menú del anunciante («Inicio», «Reportes», «Mis
  campañas», «Mi empresa»).

Bloques que debes reutilizar: `src/components/asistente` (`Asistente`, `useAsistente`, `PieAsistente`, guardia de
salida; el asistente ya es un `<form>`), `src/components/archivos` (`useSubida`/`useSubidas`, `ZonaArchivos`,
`ListaSubidas`, `VisorArchivoFirmado`, `useUrlFirmada`), `src/lib/archivos` (validación, `sha256`, compresión: para
creativos NO se comprime), `src/lib/storage` (`carpetaCreativo`, `carpetaDocumentoAnunciante`, `carpetaLogo`,
`nuevaRuta`, `prepararSubidaFirmada`, `confirmarObjeto`, `archivoPerteneceA`, `firmarDescarga` como usuario o como
servicio), `src/components/territorio` (`SelectorTerritorio` modo `"segmentacion"`), `src/lib/negocio/acciones.ts`
(`accionesPermitidas`), `src/lib/errores-bd.ts` (`interpretarErrorBd` con `restriccionesExtra`),
`src/lib/colombia/nit.ts`, `src/features/configuracion/components/campos.tsx` (`CampoTexto`, `CampoCifra`,
`CampoFecha`, `CampoHora`, `CampoEtiquetas`…), `DialogoMotivo` (`src/features/usuarios/components/dialogo-motivo.tsx`,
con `sugerencias`), `DialogoConfirmacion` (`src/components/feedback`), las piezas de ficha de
`src/features/operacion/components` (`CabeceraFicha`, `PestanasFicha`, `Diferida`) y los patrones de la fase 1
(`src/features/documentos-medio` para documentos; `src/features/verificacion` para colas y expedientes;
`BarraGuardar` de `src/features/mi-medio/components/guardado.tsx`).

**Convenciones de la fase (obligatorias):**

- Rutas de archivo: documentos `documentos/anunciante/{anuncianteId}/{TIPO}/{uuid}.{ext}`; logo
  `avatares/anunciante/{anuncianteId}/logo-{uuid}.webp`; creativos `creativos/oferta/{ofertaId}/{creativoId}/{uuid}.{ext}`
  (siempre construidas en el servidor). Toda acción `confirmar…` es idempotente por ruta (las rutas son únicas).
- Creativos: originales sin recomprimir; el cliente calcula SHA-256, ancho, alto y duración; el servidor vuelve a
  validar contra `formatos.requisitos` antes del `insert` (la BD lo exige de nuevo). La fila `creativos` existe
  antes de subir archivos (la política de Storage la consulta).
- Errores de envío: traduce `hint` `envio_oferta:<paso>` a «Falta completar: <paso>» y lleva al paso del asistente.
- Fechas y horas de ofertas en `America/Bogota` (`src/lib/fechas.ts`); timestamptz en la BD.
- Móvil primero para el anunciante también (390 px sin scroll horizontal), tema claro y oscuro, WCAG 2.2 AA.

## Paquete EM — Mi empresa: datos, documentos, verificación y equipo (ANU-001, ANU-002, ADM-003 lado anunciante)

**Propiedad:** `src/features/empresa/**`, `src/features/documentos-anunciante/**`, `src/app/(app)/empresa/**`, y en
`src/features/gestion-anunciantes/components/campos-anunciante.tsx` (+ `campos-nit.tsx`) solo una prop nueva para
bloquear la identificación.

- `/empresa` (`requerirPermiso("anunciantes.editar_propio")`, id = `usuario.anuncianteId`): estado de verificación
  claro (PENDIENTE sin enviar → qué falta y «Enviar a verificación»; enviada → «En revisión desde…»; RECHAZADO →
  motivo y «Corrige y reenvía»; VERIFICADO; SUSPENDIDO con motivo); datos editables reutilizando `CamposAnunciante`
  con `identificacionBloqueada` (país, NIT/DV, identificación extranjera y razón social de solo lectura cuando está
  VERIFICADO o SUSPENDIDO), contacto (`anunciantes_privado`, insert/update propio), datos de facturación y logo
  (`avatares`). Acciones `editarMiEmpresa`, `guardarContactoEmpresa`, `subir/confirmarLogo`,
  `enviarEmpresaAVerificacion` (RPC con `contextoDelActor`).
- `/empresa/documentos`: lista de lo exigido (Colombia: RUT y Cámara de Comercio; exterior: Cámara u «Otro
  documento») y opcionales, con estado, observaciones de rechazo y vigencia; «Cargar»/«Reemplazar» (PDF o imagen;
  fotos comprimidas como en documentos del medio). Exporta para VA el catálogo
  `FICHAS_DOCUMENTO_ANUNCIANTE` y `documentosExigidos(pais)`.
- `/empresa/equipo`: compañeros (`miembros_organizacion()`), con estado y último acceso; explica que las cuentas
  nuevas las crea el equipo AMO.
- E2E `e2e/anunciante-empresa.spec.ts` con «Anunciante Nuevo E2E» (PENDIENTE, del paquete E0): edita datos, carga RUT y
  Cámara, envía a verificación, ve «En revisión»; con «Anunciante E2E» (VERIFICADO) la identificación es de solo
  lectura; equipo visible.

## Paquete VA — Verificación de anunciantes (ADM-003)

**Propiedad:** `src/features/verificacion-anunciantes/**`; en `src/features/verificacion/` solo lo necesario para
registrar la cola nueva (`colas.ts`, `presentacion.ts`, `queries.ts` → contadores, `components/cola-activa.tsx`,
`components/navegacion-colas.tsx` y sus pruebas); `src/app/(app)/operacion/verificacion/**`; en
`src/app/(app)/operacion/anunciantes/[id]/page.tsx` la pestaña `verificacion` y las acciones de cabecera.

- Cola `/operacion/verificacion?cola=anunciantes` (con `anunciantes.verificar`): anunciantes PENDIENTE enviados
  (`enviado_verificacion_at`, más antiguo primero) y los que tienen documentos PENDIENTE; contador en la navegación de
  colas. Un rol que solo verifica anunciantes cae en esta cola por defecto.
- Expediente en la ficha (`?pestana=verificacion`): datos clave (razón social, NIT con DV, país), documentos con
  visor firmado como servicio (queda `URL_FIRMADA` en bitácora), aprobar (con vigencia opcional) o rechazar (motivo)
  cada documento, «Verificar empresa» (el `detail` de la BD dice qué falta), «Rechazar» con motivo y sugerencias
  («RUT ilegible», «La Cámara de Comercio tiene más de 30 días», «El NIT no coincide con el RUT»…), y en la cabecera
  «Suspender»/«Reactivar» con motivo (`anunciantes.suspender`).
- Carga interna (con `anunciantes.editar`): «Cargar documento» por cuenta del anunciante (ruta construida en el
  servidor, confirmación como servicio tras el DAL, `insert` con la sesión).
- E2E `e2e/anunciante-verificacion.spec.ts` (sesión interna): con el estado que prepara E0
  (`prepararAnuncianteEnVerificacion()`), recorre la cola, rechaza un documento con motivo, aprueba los dos y
  verifica la empresa; verificar sin documentos explica lo que falta.

## Paquete CA — Campañas del anunciante e Inicio (ANU-002, ANU-003, ANU-014 campaña)

**Propiedad:** `src/features/campanas/**`, `src/app/(app)/campanas/page.tsx`, `src/app/(app)/campanas/nueva/**`,
`src/app/(app)/campanas/[id]/page.tsx`, `src/app/(app)/campanas/[id]/editar/**`,
`src/app/(app)/campanas/[id]/ofertas/page.tsx` (solo redirige a `?pestana=ofertas` tras el DAL),
`src/features/dashboard/anunciante/**`.

- `/campanas`: listado de las campañas de la empresa (RLS: los compañeros ven las mismas) con estado, fechas,
  presupuesto y ofertas por estado; búsqueda y filtro por estado en la URL; vacío con «Crear campaña».
- `/campanas/nueva` y `/campanas/[id]/editar`: nombre, objetivo, marca o producto, fechas y presupuesto total
  (BORRADOR o ACTIVA; el presupuesto no baja de lo comprometido; las fechas respetan las ofertas vivas). Insert y
  update con la sesión (RLS + bitácora).
- `/campanas/[id]`: cabecera con estado y acciones por `accionesPermitidas` (Activar, Editar, Cancelar con motivo,
  Archivar borrador), resumen (presupuesto total, disponible según `disponible_campana`, comprometido, fechas), pestaña «Ofertas» con cada oferta (formato, estado, fecha límite, presupuesto) enlazada a su ficha
  `/campanas/[id]/ofertas/[ofertaId]`, las devueltas destacadas, y «Nueva oferta» →
  `/campanas/[id]/ofertas/nueva`. Una empresa sin verificar ve por qué no puede activar.
- Inicio del anunciante (`src/features/dashboard/anunciante`): aviso de verificación (lee `anunciantes` con la
  sesión: estado, motivo, enviado), «Crear campaña», ofertas que requieren atención (devueltas, borradores con
  fecha límite cercana) y campañas activas, sin perder los indicadores actuales.
- E2E `e2e/anunciante-campanas.spec.ts` con «Anunciante E2E»: crea, edita y activa una campaña (nombre único por
  corrida), el presupuesto no baja de lo comprometido, cancela con motivo; con «Anunciante Nuevo E2E» activar está
  bloqueado y explicado.

## Paquete AO — Asistente de oferta (ANU-004, ANU-005, ANU-006, ANU-007, ANU-009 envío)

**Propiedad:** `src/features/asistente-oferta/**`, `src/app/(app)/campanas/[id]/ofertas/nueva/**`,
`src/app/(app)/campanas/[id]/ofertas/[ofertaId]/editar/**`.

- `Asistente` con `?paso=que|quien|cuando|cuanto|creativo|envio`:
  1. **Qué**: plataforma y formatos (multiselección; una oferta por formato; solo lo que admite cada plataforma),
     publicaciones por medio, título.
  2. **A quién**: departamentos y municipios (`SelectorTerritorio` segmentación), categorías de medio, mínimo de
     seguidores (muestra el mínimo efectivo con el umbral), exclusiones con buscador (`medios_para_exclusion`).
  3. **Cuándo**: ventana de publicación (dentro de las fechas de la campaña), fecha límite de aceptación (≥ ahora +
     anticipación, ≤ fin de la ventana), permanencia mínima, cortes (por defecto los de la configuración; se pueden
     quitar), exclusividad opcional en días con el recargo visible.
  4. **Cuánto**: presupuesto máximo (≤ `disponible_campana`), cupos por franja, tope por medio (15 % por defecto) y
     el estimador por franja y por formato («Sin estimación» cuando viene null), con avisos si la inversión
     estimada supera el presupuesto.
  5. **Paquete creativo**: monta `PanelCreativo` del paquete CR para cada oferta creada (pestañas por formato).
  6. **Revisión y envío**: resumen de todo, instrucciones y restricciones (la etiqueta de publicidad es
     obligatoria y se muestra fija), «Enviar a revisión» (si la BD devuelve `envio_oferta:<paso>`, lleva a ese paso
     con el mensaje) y «Guardar borrador».
- Persistencia: al salir del paso 4 (o con «Guardar borrador») crea los borradores (`ofertas` + `oferta_cupos`, uno por
  formato, con la sesión) y continúa en la misma URL con `?ofertas=<id1>,<id2>&paso=creativo`; los pasos
  siguientes actualizan esos borradores (solo BORRADOR o DEVUELTA). `/editar` es el mismo asistente para una sola
  oferta (BORRADOR o DEVUELTA) con sus datos cargados y los pasos completos marcados.
- Exporta `rutaAsistente(campanaId, ofertaId?)` para los botones de otros paquetes.
- E2E `e2e/anunciante-oferta.spec.ts` con «Anunciante E2E» y una campaña activa de E0: Reel de Instagram + Video de
  TikTok crean dos ofertas; historia no aparece en TikTok; mínimo de 20.000 muestra 30.000 efectivo; quitar el corte
  de 72 h; enviar sin creativo lleva al paso creativo con el mensaje; con el creativo cargado, la oferta queda en
  revisión.

## Paquete CR — Paquete creativo y versiones (ANU-008, ANU-010)

**Propiedad:** `src/features/creativos/**`; en `src/lib/archivos/**` y `src/components/archivos/**` las extensiones
necesarias (varias relaciones de aspecto por regla, reglas desde `formatos.requisitos`, subida sin compresión con
SHA-256 y medidas), con sus pruebas y sin romper a los usuarios actuales.

- Contratos (otros paquetes los importan; respeta las firmas):
  - `PanelCreativo({ ofertaId, formato, editable, alCambiar? })` (`"use client"`): tipo de creativo según el formato,
    carga múltiple con validación previa (MIME, peso, relación de aspecto, duración, cantidad) y mensajes claros
    («Un reel necesita video vertical 9:16; el tuyo es 16:9»), miniaturas, orden, quitar archivo, copy sugerido
    (≤ 2.200), hashtags, menciones y enlace de destino `https`. `alCambiar({ listo, archivos, faltan })` informa al
    asistente.
  - `VersionesCreativo({ ofertaId, versiones, puedeVersionar })`: versión vigente, pendiente e historial; en una oferta
    publicada, «Nueva versión» (crea la pendiente, carga archivos y «Activar versión» con `activar_creativo_srv`,
    avisando que los medios con asignaciones recibirán la nueva).
  - `VisorCreativo({ version })`: archivos (imagen o video con `VisorArchivoFirmado`), copy, hashtags, menciones,
    enlace; lo usan la ficha de la oferta y la moderación.
  - `creativosDeOferta(ofertaId)` (queries, `server-only`) → `VersionCreativo[]`; tipos en
    `src/features/creativos/tipos.ts` (`FormatoOferta`, `VersionCreativo`, `ArchivoCreativo`, `EstadoCreativo`).
- Acciones: guardar creativo (crea la fila si falta), preparar y confirmar archivo (idempotente por ruta; revalida
  contra el formato y el tope de configuración), quitar archivo, crear versión pendiente, activar versión, firmar
  archivo (como usuario: el dueño y quien tiene `ofertas.ver` leen el bucket).
- E2E `e2e/anunciante-creativo.spec.ts`: un video 16:9 para un reel se rechaza indicando 9:16; una imagen de unos 12 MB
  se guarda con la misma SHA-256 que el archivo local; en una oferta publicada de E0, la versión 2 queda pendiente
  hasta activarla y entonces la 1 deja de estar vigente.

## Paquete OM — Ficha de la oferta y moderación (ANU-009, ANU-014 oferta, ADM-005)

**Propiedad:** `src/features/ofertas/**`, `src/features/moderacion/**`,
`src/app/(app)/campanas/[id]/ofertas/[ofertaId]/page.tsx`, `src/app/(app)/operacion/moderacion/**`,
`src/app/(app)/operacion/ofertas/**` (incluida `page.tsx`, que redirige a la moderación tras el DAL), y en
`src/features/operacion/components/tarjeta-oferta.tsx` solo el enlace a `/operacion/ofertas/[id]`.

- `obtenerOferta(id)` (queries) con todo lo que muestran las dos fichas: campaña, formato, segmentación con nombres
  (departamentos, municipios, categorías, exclusiones vía `medios_para_exclusion(p_ids)`), fechas, presupuesto,
  cupos por franja, condiciones, historial (`oferta_historial`) y creativos (`creativosDeOferta` de CR).
  Componentes `ResumenOferta`, `HistorialOferta` (línea de tiempo con el comentario de cada devolución) y
  `AccionesOferta`.
- Ficha del anunciante `/campanas/[id]/ofertas/[ofertaId]`: estado con su explicación, devolución destacada con el
  comentario, resumen, creativos (`VersionesCreativo`), historial y acciones por `accionesPermitidas`: Editar
  (`rutaAsistente`), Enviar a revisión (con el mapeo de `envio_oferta:<paso>`), Retirar de revisión, Cancelar (motivo
  si está publicada; si ya tiene asignaciones, el mensaje lo dice).
- Moderación `/operacion/moderacion` (`ofertas.moderar`): cola de ofertas EN_REVISION (más antigua primero) con
  anunciante, campaña, formato, presupuesto, fecha límite (alerta si está cerca o vencida) y paginación en la URL.
- Ficha interna `/operacion/ofertas/[id]` (`ofertas.ver`; decidir exige `ofertas.moderar`): vista completa
  (segmentación, presupuesto y cupos, condiciones, creativos con `VisorCreativo`, historial) y «Publicar»,
  «Devolver» (comentario con sugerencias: copy inadecuado, falta la etiqueta de publicidad, enlace no seguro, fechas
  inconsistentes…), «Rechazar» (motivo) y «Cancelar» la publicada (motivo). Si la fecha límite ya pasó, publicar está
  bloqueado y se explica.
- E2E `e2e/anunciante-moderacion.spec.ts`: con una oferta en revisión de E0, el moderador la devuelve con comentario,
  el anunciante ve el comentario y el historial, la reenvía, el moderador la publica; una oferta con la fecha límite
  vencida no se puede publicar.

## Paquete E0 — Cuentas, fábricas y archivos de prueba; carrera de cupos

**Propiedad:** `scripts/bootstrap/**` (cuentas y aprovisionamiento), `scripts/pruebas/carrera/**`,
`e2e/utilidades/**` (solo agregar: `anunciantes.ts`, `negocio.ts`, `archivos.ts`), `e2e/fixtures/**`. Autorizado a
escribir en la base **local** solo mediante `pnpm bootstrap:e2e` y las fábricas que construyas (siempre fuera de
producción, con la guarda existente).

- Cuenta `E2E_ANUNCIANTE_NUEVO_EMAIL/PASSWORD`: usuario ANUNCIANTE ACTIVO de «Anunciante Nuevo E2E» (PENDIENTE,
  Colombia, NIT válido, sin documentos), con los términos vigentes aceptados; el aprovisionamiento lo reinicia en
  cada corrida. Mismas garantías que las cuentas existentes (idempotente, contraseñas generadas sin imprimirse).
- `e2e/utilidades/anunciantes.ts`: `ingresarComoAnunciante(page, { cuenta?, destino? })`,
  `restablecerAnuncianteNuevoE2E()`, `prepararAnuncianteEnVerificacion()` (RUT y Cámara PENDIENTE con archivos reales y
  enviado a verificación).
- `e2e/utilidades/negocio.ts`: fábricas por la API de servicio y RPC/transiciones con actor y sesión reales (sin SQL
  directo): `crearCampanaE2E({ estado })`, `crearOfertaE2E({ campanaId, formato, estado: 'BORRADOR' | 'EN_REVISION' |
'PUBLICADA', fechaLimite? })` con su creativo y un archivo real que cumpla el formato (objeto en Storage + SHA-256 +
  medidas). Nombres únicos por corrida; nada de esperas fijas.
- `e2e/utilidades/archivos.ts` (+ `scripts/bootstrap/archivos-prueba.ts`): imágenes de las dimensiones pedidas (PNG/JPEG,
  incluida una de ~12 MB) y videos MP4 vertical 9:16 y horizontal 16:9 de pocos segundos. No hay `ffmpeg`: genera los
  videos sin binarios de terceros (p. ej. un MP4 mínimo construido en Node o grabado en el navegador de Playwright) y
  comprueba que el Chromium de Playwright lee su `videoWidth`, `videoHeight` y `duration`.
- `scripts/pruebas/carrera/datos.ts`: el creativo de la carrera ahora debe subir un objeto real y declarar SHA-256 y
  medidas (la BD lo exige).
- Corre `pnpm bootstrap:e2e` dos veces contra la base local (idempotente) y deja constancia.

## Paquete SQ — Suite SQL de la fase 2

**Propiedad:** `supabase/tests/humo_e2_anunciantes_ofertas.sql` (sigue el patrón de `humo_e2_onboarding.sql`: un
`do` dentro de `begin … rollback`, resultado `jsonb` con una clave por comprobación). Se corre con
`pnpm db:suites local` (todas) o con `docker exec -i supabase_db_front-amo psql …` para iterar.

Cubre los criterios con la BD: anunciante PENDIENTE no envía ofertas (ANU-001); envío y reenvío a verificación,
verificación con RUT y Cámara aprobados, rechazo con motivo visible, extranjero con certificado bancario insuficiente,
suspensión que deja la oferta sin elegibles (ADM-003); compañeros ven las campañas y otra empresa no (ANU-002);
activar con empresa sin verificar falla también para un ADMIN, presupuesto total bajo lo comprometido (ANU-003);
fechas de campaña que dejarían fuera una oferta publicada; estimador con exclusión y «Sin estimación» con menos de 3
medios, mínimo efectivo de 30.000 (ANU-005/007); anticipación con el número de horas en el mensaje y exclusividad 0
rechazada (ANU-006); presupuesto mayor que el disponible (ANU-007); archivo con aspecto equivocado, sin SHA-256 o sin
objeto en Storage (ANU-008); envío sin creativo con `hint` `envio_oferta:creativo`, devolución con comentario en el
historial y reenvío (ANU-009); versión nueva pendiente, activación y aviso a medios (ANU-010); cancelación con
asignación viva y cascada sobre EN_EJECUCION (ANU-014); publicar, devolver, rechazar (sin aviso de rechazo en la
cascada) y fecha límite vencida (ADM-005); cron de revisión vencida y de borradores caducados. Si algo de la BD no se
comporta como dice este brief, **no edites la migración**: repórtalo con el caso y el SQL que propones.
