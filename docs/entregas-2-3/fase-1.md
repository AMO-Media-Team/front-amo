# Fase 1 — Alta y verificación del medio (E2)

Requisitos: AUT-012, MED-001…007, ADM-001, ADM-006 y NOT-003 (notificaciones de alta). Lee primero
[`README.md`](README.md). La base ya tiene (migraciones `20261022030524_e2_onboarding_medio` y
`20261022030525_e2_notificaciones_negocio`; tipos regenerados en `src/types/database.types.ts`):

| Objeto                                                                              | Uso                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public.terminos_pendientes()`                                                      | Versiones vigentes que el usuario externo aún no acepta (id, tipo, version, vigente_desde, hash_sha256, contenido_md). Aceptar = `insert` en `aceptaciones_terminos (perfil_id, termino_version_id)` con el cliente de sesión (el trigger fija IP, agente y huella del correo).                                                                                                                                                                                                                                                                                                                      |
| `solicitudes_vinculacion`                                                           | Cola de MED-001 (select interno con `medios.verificar`). `crear_solicitud_vinculacion_srv(p_datos jsonb, p_ip_hash text)` (service_role; `p_datos`: nombre_medio, tipo?, contacto_nombre, email, celular?, municipio_codigo, cuentas `[{plataforma, usuario, seguidores?}]` 1–6, mensaje?, autoriza_datos=true; error `AMO_LIMITE_SOLICITUDES`; duplicados se absorben en silencio). `resolver_solicitud_vinculacion_srv(p_id, p_actor_id, p_session_id, p_estado 'INVITADA'\|'DESCARTADA', p_medio_id?, p_motivo?)`.                                                                                |
| `guardar_datos_pago_medio_srv(p_medio_id, p_actor_id, p_session_id, p_datos jsonb)` | MED-004. Claves admitidas: titular_nombre, tipo_documento (`CC`,`CE`,`PPT`,`PASAPORTE`,`NIT`), numero_documento_cifrado, numero_documento_hash, numero_documento_resumen, metodo_pago (`BANCARIO`,`BILLETERA`), datos_pago_cifrados, datos_pago_resumen, es_declarante, obligado_facturar, responsable_iva, celular, email_contacto, direccion. Clave ausente = se conserva. Cifrado con `cifrar()` y huella con `huella()` de `src/lib/cifrado.ts` (formato `v<n>:…`); pago completo = método + cifrado + resumen juntos. Unicidad del documento: error `medios_privado_numero_documento_hash_key`. |
| `enviar_medio_a_verificacion_srv(p_medio_id, p_actor_id, p_session_id)`             | MED-002: el medio envía su perfil a la cola (exige cuenta social, documentos y datos de pago; si estaba RECHAZADO vuelve a PENDIENTE). `medios.enviado_verificacion_at`.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `documentos_medio.metodo` (`ARCHIVO`\|`VIDEOLLAMADA`)                               | `registrar_verificacion_videollamada_srv(p_medio_id, p_actor_id, p_session_id, p_observaciones)` aprueba una prueba de vida sin imagen. `transicionar_srv('documentos_medio', id, 'APROBADO', …, p_datos {"fecha_vencimiento":"YYYY-MM-DD"})` fija la vigencia.                                                                                                                                                                                                                                                                                                                                      |
| Verificar medio                                                                     | `transicionar_srv('medios', id, 'VERIFICADO', actor, sesión, null, {"nivel": n})` desde PENDIENTE (valida documentos del nivel + certificado del medio de pago + una cuenta vigente; el `detail` lista lo que falta); VERIFICADO→VERIFICADO con otro nivel exige motivo; PENDIENTE→RECHAZADO con motivo.                                                                                                                                                                                                                                                                                             |
| Cuentas sociales                                                                    | `cuentas_sociales` (el medio inserta/actualiza `plataforma, handle, url, tarifa_referencia`); `verificaciones_cuenta` método MANUAL la inserta el medio (captura en `documentos/medio/{id}/cuenta_social/{cuenta}/…`); método CODIGO_HISTORIA la crea el servidor (service_role) con `codigo_hash` sha256 hex y `codigo_expira_at` = ahora + `medios.codigo_verificacion_minutos`; aprobar con `transicionar_srv('verificaciones_cuenta', id, 'APROBADA', …, {"seguidores_verificados": n})`. Reverificación: `private.cuenta_vigente`, avisos del cron `cuenta.reverificacion_pendiente`.           |
| Pertinencia (ADM-006)                                                               | `medio_pertinencia_geografica (medio_id, municipio_codigo, multiplicador 0.500–1.500, notas)` con `medios.clasificar_pertinencia`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Notificaciones                                                                      | Nuevos tipos: `medio.*`, `documento.*`, `anunciante.*`, `cola.*` (avisos a colas internas), `asignacion.aceptada/publicada/verificada`, `liquidacion.aprobada/anulada`, `factura.*`, `campana.finalizada`, `disputa.mensaje`, `oferta.rechazada/vencida`. Todas con `url = null`: el destino lo resuelve `/ir/[entidad]/[id]`.                                                                                                                                                                                                                                                                       |

**El líder ya integró** (no lo toques; si necesitas otra cosa ahí, repórtalo):

- Navegación: grupo «Mi negocio» con «Mi medio» (`/mi-medio`, tipo MEDIO, `medios.editar_propio`, subpáginas
  perfil, documentos, pago, cuentas y nivel) y «Verificación» en Operación (`/operacion/verificacion`,
  `medios.verificar` o `anunciantes.verificar`).
- `/vincular` en `RUTAS_PUBLICAS` y `registrarSolicitudVinculacion` de `src/features/vinculacion/actions.ts` en
  `ACCIONES_PUBLICAS` (hoy ese archivo es un stub del líder que el paquete VI reemplaza completo).
- Resolvedor `/ir/[entidad]/[id]` (`src/features/enlaces/destinos.ts`): las notificaciones sin `url` enlazan ahí
  y llevan al MEDIO a `/mi-medio`, `/mi-medio/documentos` y `/mi-medio/cuentas`, y al equipo AMO a
  `/operacion/verificacion?cola=documentos|cuentas|solicitudes`. Esas rutas y parámetros son contrato: respétalos.
- Categorías de notificación `verificacion` y `pendientes`.
- Tipos de la BD regenerados con todo lo de la tabla de arriba (`documentos_medio.archivo_path` ahora admite null).

Usa los bloques de la fase 0: `src/lib/archivos`, `src/components/archivos`, `src/lib/storage`,
`src/components/territorio` (`SelectorTerritorio`, solo municipios activos), `src/components/asistente`,
`src/components/tiempo`, `src/lib/cifrado.ts`, `src/lib/errores-bd.ts`, `src/lib/negocio/acciones.ts`,
`src/lib/redes/url-post.ts`, y de gestión `src/features/gestion-medios` (registrar medio) y la hoja
`BotonCrearUsuario({ organizacion })` de `src/features/usuarios`.

**Pruebas E2E:** cada paquete con pantallas escribe `e2e/<paquete>.spec.ts` (TE → `terminos`, VI → `vinculacion`,
MM/MD/MC → `onboarding-medio-<paquete>`, VM → `verificacion-medios`) siguiendo los specs existentes y
`e2e/utilidades/`, con las cuentas del paquete E0 (`E2E_MEDIO_*`, `E2E_MEDIO_NUEVO_*`, `E2E_ADMIN_*`). **No los
ejecutes** (lo hace el líder con la app compilada); que sean deterministas, sin esperas fijas, con selectores por
rol y nombre accesible, y que limpien o aíslen lo que crean.

**Convenciones fijadas por el líder (obligatorias):**

- **Cifrado:** `contexto` = `"<tabla>:<id de la fila>:<columna>"` (p. ej. `medios_privado:<medio_id>:datos_pago_cifrados`).
  Cifrar, descifrar tras `revelar_privado_srv` y descifrar en la dispersión usan exactamente ese valor.
- **Huella del documento:** `huella(\`${tipoDocumento}:${numero}\`)`con el número normalizado (solo dígitos y letras,
en mayúsculas): el mismo número con dos tipos distintos no choca en`medios_privado_numero_documento_hash_key`.
- **Resumen:** `ultimos4()` de `cifrado.ts` (`•••• 1234`); el resumen de pago, `«<proveedor o banco> •••• 1234»`,
  nunca más de 60 caracteres (`medios_privado_datos_pago_resumen_chk`).
- **Archivos:** toda acción `confirmar…` sigue la pauta de `src/lib/archivos` (esquema `esquemaArchivoSubido`,
  `archivoPerteneceA`, `confirmarObjeto`) y es idempotente por ruta: `documentos_medio.archivo_path` y
  `documentos_anunciante.archivo_path` son únicos (insertar con `on conflict` o leer la fila si ya existe). En
  `documentos` y `soportes` los internos no tienen SELECT sobre `storage.objects`: autorizan con el DAL, leen la fila
  con la sesión y firman o confirman como servicio.

## Paquete TE — Compuerta de términos (AUT-012)

**Propiedad:** `src/features/terminos/**`, `src/app/(auth)/aceptar-terminos/**`, y en exclusiva durante esta fase
`src/lib/auth/compuertas.ts`, `src/lib/auth/dal.ts`, `src/lib/auth/perfil-sesion.ts` (+ sus pruebas).

- Paso nuevo `aceptar-terminos` en `resolverCompuertas`, después del cambio de contraseña y de la configuración de
  MFA, solo para roles ANUNCIANTE y MEDIO cuando `terminos_pendientes()` devuelve filas (una consulta por
  solicitud, cacheada con `cache` de React). Ruta `/aceptar-terminos?next=`.
- Pantalla móvil primero: cada documento pendiente con su texto (`VistaMarkdown` de
  `src/features/configuracion/components/vista-markdown.tsx`), versión y fecha, desplazamiento completo o casilla
  explícita por documento, botón «Aceptar y continuar» (inserta las aceptaciones), «Salir». Si no hay versión
  publicada de algún tipo, no bloquea (el cliente aún no carga sus textos).
- Pruebas de `resolverCompuertas` con el paso nuevo.

## Paquete VI — Solicitud pública de vinculación y su cola (MED-001)

**Propiedad:** `src/features/vinculacion/**`, `src/app/(auth)/vincular/**`.

- Formulario público breve y bonito a 390 px (`/vincular`, enlazado desde «Ingresar» como «¿Tienes un medio?
  Pide unirte»): nombre del medio, tipo, nombre de contacto, correo, celular, municipio (selector de territorio),
  1–6 cuentas (plataforma, usuario, seguidores aproximados), mensaje, autorización de datos (Ley 1581, enlace a la
  política vigente si existe) y campo trampa oculto. Acción pública (`registrarSolicitudVinculacion`, sin DAL;
  queda en `ACCIONES_PUBLICAS`): valida con zod, descarta silenciosamente si el campo trampa trae algo, calcula
  `ip_hash` = sha256 de la IP de `headers()` con sal `AMO_SERVIDOR_SECRET`, llama a la RPC con el cliente admin y
  responde SIEMPRE el mismo mensaje genérico de éxito (salvo errores de validación y el límite por IP).
- Cola interna: componente `ColaSolicitudes` (lo monta el paquete VM en `/operacion/verificacion?cola=solicitudes`)
  con tarjetas/tabla, detalle de cuentas declaradas, «Invitar» (un clic: registra el medio con los datos de la
  solicitud reutilizando la acción del paquete de registro de medios de la fase 0, abre la invitación con la
  organización fija y, al crearla, marca la solicitud INVITADA) y «Descartar» con motivo (`DialogoMotivo`).
  Acciones en `src/features/vinculacion/actions.ts` con `requerirPermiso("medios.verificar")`.

## Paquete MM — Mi medio: perfil, pago, nivel y lista de alta (MED-002, MED-004, MED-007)

**Propiedad:** `src/features/mi-medio/**`, `src/app/(app)/mi-medio/page.tsx`, `src/app/(app)/mi-medio/{perfil,pago,nivel}/**`,
`src/features/dashboard/medio/**`.

- `/mi-medio`: hub con el estado de verificación (PENDIENTE, en revisión desde `enviado_verificacion_at`,
  VERIFICADO Nn, RECHAZADO con motivo, SUSPENDIDO) y la lista de alta (perfil, documentos, pago, cuentas, términos)
  con progreso y botón «Enviar a verificación» (`enviar_medio_a_verificacion_srv`).
- Perfil: nombre, tipo, municipio (solo activos), categorías, descripción y origen geográfico de la audiencia
  (`medio_audiencia_paises`, suma ≤ 100 %, fuente DECLARADA). Escritura con el cliente de sesión (RLS propia).
- Pago y condición tributaria: titular, tipo y número de documento, método (cuenta bancaria: banco, tipo y número;
  billetera: proveedor y número), declarante, obligado a facturar, responsable de IVA. El servidor cifra, calcula
  huella y resumen (`•••• 1234`) y llama a la RPC; la interfaz nunca vuelve a mostrar el número completo (para
  cambiarlo se escribe de nuevo). Explica por qué se piden y que van cifrados.
- Nivel: nivel actual, tope anual, consumo y porcentaje (`kpis_medio`), documentos exigidos por nivel
  (`niveles_verificacion.documentos_requeridos` + certificado según el método de pago) con su estado, y la guía
  para subir de nivel (tramitar el RUT, qué cargar). Aviso visible desde el 80 %.
- Inicio del medio (`src/features/dashboard/medio`): mientras no esté VERIFICADO, la lista de alta reemplaza los
  indicadores vacíos.

## Paquete MD — Documentos del medio (MED-003)

**Propiedad:** `src/features/documentos-medio/**`, `src/app/(app)/mi-medio/documentos/**`.

- Lista de los documentos que exige su nivel objetivo (y los opcionales), con estado, observaciones de rechazo,
  vigencia y «Cargar»/«Reemplazar» (una carga nueva sustituye a la anterior en la interfaz). Subida directa con
  `useSubida` (compresión en el celular a WebP para fotos, PDF tal cual, cámara con `capture`, reintentos y
  reanudación), ruta `documentos/medio/{id}/{tipo}/{uuid}.{ext}` construida en el servidor, confirmación e
  `insert` en `documentos_medio` con el cliente de sesión.
- Prueba de vida: explica que es facultativa (dato biométrico) y ofrece la alternativa de videollamada con el
  equipo AMO (solo informativa para el medio).

## Paquete MC — Cuentas sociales y verificación de control (MED-005, MED-006)

**Propiedad:** `src/features/cuentas-medio/**`, `src/app/(app)/mi-medio/cuentas/**`.

- Alta y edición de cuentas (Facebook, Instagram, TikTok; usuario o URL validados por plataforma; tarifa de
  referencia informativa) y su estado: verificada con seguidores y franja, vigencia y días para reverificar, en
  revisión, rechazada.
- Verificación por código: el servidor genera el código (6–8 caracteres legibles), guarda su sha256 y vencimiento
  con el cliente admin y lo muestra UNA vez con cuenta regresiva e instrucciones («publícalo en una historia y
  carga la captura antes de que venza»); carga de la captura (comprimida). Verificación manual: captura del panel
  de seguidores con fecha visible y seguidores reportados. Reverificación con el mismo flujo.

## Paquete VM — Verificación de medios y pertinencia (ADM-001, ADM-006)

**Propiedad:** `src/features/verificacion/**`, `src/app/(app)/operacion/verificacion/**`, y en
`src/app/(app)/operacion/medios/[id]/page.tsx` solo las pestañas nuevas (coordinado con lo de la fase 0).

- `/operacion/verificacion?cola=medios|cuentas|documentos|solicitudes` con contadores: medios enviados a
  verificación (orden por `enviado_verificacion_at`), cuentas por verificar, documentos pendientes y solicitudes
  (`ColaSolicitudes` del paquete VI).
- Revisión de un medio: perfil, documentos (visor con URL firmada como servicio, que queda en bitácora), datos de
  pago enmascarados (revelado con `PanelPrivado`), cuentas y verificaciones; aprobar o rechazar cada documento (con
  vigencia y observaciones), aprobar cuentas con seguidores verificados, registrar videollamada, y decidir el medio:
  aprobar con nivel (el `detail` de la BD dice qué falta), rechazar con motivo o cambiar de nivel.
- Pertinencia geográfica en la ficha del medio: tabla de municipios con multiplicador 0,500–1,500 y notas.

## Paquete E0 — Cuentas E2E de medio y registro de organizaciones (fase 0)

**Propiedad:** `scripts/bootstrap/usuarios-e2e.ts`, `scripts/bootstrap/provision-e2e.ts` (+ pruebas),
`e2e/utilidades/**` (solo agregar), `e2e/registro-organizaciones.spec.ts`. Autorizado a escribir en la base
**local** solo mediante `pnpm bootstrap:e2e`.

- Dos cuentas nuevas en el aprovisionamiento idempotente, con las mismas garantías que las existentes (nunca en
  producción, contraseñas generadas que se agregan a `.env.local` sin imprimirse):
  - `E2E_MEDIO_EMAIL/PASSWORD`: usuario MEDIO ACTIVO de un medio **VERIFICADO nivel 1** («Medio E2E»,
    municipio activo, categoría) con una cuenta de Instagram verificada de 40.000 seguidores (franja que
    corresponda), datos de pago completos (cifrados con `src/lib/cifrado.ts` y la convención de contexto del
    brief) y documentos de nivel 1 aprobados y vigentes; sin MFA (rol externo).
  - `E2E_MEDIO_NUEVO_EMAIL/PASSWORD`: usuario MEDIO ACTIVO de un medio PENDIENTE recién registrado, sin cuentas,
    documentos ni pago (para recorrer la lista de alta). El aprovisionamiento lo **reinicia** a ese estado en cada
    corrida (borra lo que el spec de alta le haya agregado), para que los E2E sean repetibles.
  - Todo por la Admin API y RPC/transiciones con actor superadministrador, como lo existente (nada de SQL directo).
- `e2e/utilidades/`: ayudantes para ingresar como medio y para localizar al medio E2E.
- `e2e/registro-organizaciones.spec.ts` (fase 0, pantallas ya construidas en `src/features/gestion-medios` y
  `gestion-anunciantes`): el ADMIN registra un medio (con `?registrar=1` desde el aviso de «Crear usuario»), lo edita,
  invita a un usuario desde su ficha con la organización fija; registra un anunciante colombiano con NIT y DV
  (DV errado rechazado en el campo) y uno extranjero; nombres únicos por corrida.
- Corre `pnpm bootstrap:e2e` contra la base local (dos veces: debe ser idempotente) y deja constancia del resultado.
