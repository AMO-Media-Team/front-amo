import "server-only"

/**
 * Archivos del documento soporte que genera el servidor (LIQ-004): el PDF y el archivo genérico para el
 * proveedor tecnológico. No es una acción (no lleva `"use server"`): la llaman `emitirDocumentoSoporte`,
 * `generarArchivosDocumentoSoporte` y `registrarCuds` después de autorizar con el DAL.
 *
 * 1. `datos_documento_soporte` con la sesión (exige `liquidaciones.ver`).
 * 2. Si el documento ya tiene su archivo `AMO-DS-1`, ese es el que se transmitió: se descarga como servicio
 *    y de él sale el PDF nuevo, que solo añade el CUDS. No se vuelve a revelar nada ni se reemplaza el
 *    archivo (`p_archivo_proveedor_path` en `null`), aunque el medio haya cambiado su titular, su documento
 *    o su dirección después de la emisión. Solo si ese objeto no existe en Storage (datos demo) se generan
 *    los dos como en la emisión.
 * 3. En la emisión: `revelar_privado_srv('medios_privado', …)` con el actor (exige `datos_sensibles.ver` y
 *    deja `REVELAR_DATO` en la bitácora) y el número de documento se descifra aquí: solo viaja dentro de los
 *    archivos, nunca en la respuesta ni en los logs. PDF (jsPDF) y JSON `AMO-DS-1`.
 * 4. Los archivos se suben como servicio a `soportes/documento_soporte/{id}/` (cada vez un objeto nuevo:
 *    nunca se sobrescribe) y `adjuntar_archivos_documento_soporte_srv` comprueba que existan y los guarda
 *    en la fila.
 */
import { descifrarNumeroDocumento } from "@/features/mi-medio/cifrado-pago"
import type { ContextoActor } from "@/lib/auth/contexto-actor"
import { ErrorCifrado } from "@/lib/cifrado"
import { MENSAJE_INESPERADO } from "@/lib/errores-bd"
import { construirDocumentoSoportePdf } from "@/lib/export/documento-soporte-pdf"
import { LOGO_DOCUMENTOS } from "@/lib/export/logo-documentos.generated"
import { exito, fallo, type ResultadoAccion } from "@/lib/result"
import { estadoDeError, informarStorage } from "@/lib/storage/cliente"
import {
  asegurarRutaSegura,
  carpetaSoporte,
  nuevaRuta,
  perteneceA,
} from "@/lib/storage/rutas"
import { subirComoServicio } from "@/lib/storage/subidas-servidor"
import { argumentosRpc } from "@/lib/supabase/rpc"
import { crearClienteServidor } from "@/lib/supabase/server"

import {
  CAMPOS_VENDEDOR,
  componerModelo,
  type DatosDocumentoSoporteBd,
  DocumentoNoEmitido,
  esquemaDatosDocumentoSoporte,
  esquemaVendedorRevelado,
  type VendedorDocumento,
} from "./datos"
import { interpretarErrorDocumento, MENSAJES_DOCUMENTO } from "./errores"
import {
  type ArchivoProveedorDs,
  archivoProveedorDocumentoSoporte,
  datosPdfDesdeArchivoProveedor,
  datosPdfDocumentoSoporte,
  esquemaArchivoProveedor,
  MIME_ARCHIVO_PROVEEDOR,
  serializarArchivoProveedor,
} from "./salidas"

/** Log de servidor sin datos personales: operación y código. */
export function informar(operacion: string, error: unknown): void {
  const codigo =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : error instanceof Error
        ? error.name
        : "desconocido"
  console.error(`[documento-soporte] ${operacion} falló (${codigo})`)
}

export interface ArchivosGenerados {
  /** Número del documento («DS1234»), para el aviso de la interfaz. */
  numero: string
}

function falloBd(
  operacion: string,
  error: Parameters<typeof interpretarErrorDocumento>[0]
) {
  const interpretado = interpretarErrorDocumento(error, "generar")
  if (!interpretado.esperado) informar(operacion, error)
  return fallo(interpretado.mensaje)
}

/** Titular, documento y dirección del medio, con el número ya en claro. */
async function vendedorDescifrado(
  contexto: ContextoActor,
  medioId: string
): Promise<ResultadoAccion<VendedorDocumento>> {
  const { data, error } = await contexto.admin.rpc(
    "revelar_privado_srv",
    argumentosRpc<"revelar_privado_srv">({
      p_tabla: "medios_privado",
      p_id: medioId,
      p_actor_id: contexto.actorId,
      p_session_id: contexto.sessionId,
      p_campos: [...CAMPOS_VENDEDOR],
    })
  )
  if (error) return falloBd("revelar los datos del vendedor", error)
  const lectura = esquemaVendedorRevelado.safeParse(data)
  if (!lectura.success) {
    informar("leer los datos del vendedor", lectura.error)
    return fallo(MENSAJES_DOCUMENTO.datosIlegibles)
  }
  const revelado = lectura.data
  let numeroDocumento: string | null = null
  if (revelado?.numero_documento_cifrado) {
    try {
      numeroDocumento = descifrarNumeroDocumento(
        medioId,
        revelado.numero_documento_cifrado
      )
    } catch (causa) {
      informar("descifrar el documento del vendedor", causa)
      return fallo(
        causa instanceof ErrorCifrado
          ? MENSAJES_DOCUMENTO.documentoIlegible
          : MENSAJE_INESPERADO
      )
    }
  }
  return exito({
    titular: revelado?.titular_nombre ?? null,
    tipoDocumento: revelado?.tipo_documento ?? null,
    numeroDocumento,
    direccion: revelado?.direccion ?? null,
  })
}

/** Lo que lleva el documento según la BD (documento, resolución, liquidación, líneas, retenciones). */
async function leerDatos(
  documentoId: string
): Promise<ResultadoAccion<DatosDocumentoSoporteBd>> {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.rpc("datos_documento_soporte", {
    p_documento_id: documentoId,
  })
  if (error) return falloBd("leer los datos del documento", error)
  if (data === null) return fallo(MENSAJES_DOCUMENTO.noEncontrado)
  const lectura = esquemaDatosDocumentoSoporte.safeParse(data)
  if (!lectura.success) {
    informar("validar los datos del documento", lectura.error)
    return fallo(MENSAJES_DOCUMENTO.datosIlegibles)
  }
  return exito(lectura.data)
}

/** storage-js responde `400` con `statusCode: "404"` cuando el objeto no existe. */
function objetoInexistente(error: unknown): boolean {
  const codigo =
    error && typeof error === "object" && "statusCode" in error
      ? String(error.statusCode)
      : null
  return codigo === "404" || estadoDeError(error) === 404
}

/**
 * El archivo `AMO-DS-1` ya guardado del documento, descargado como servicio (el equipo no lee el bucket;
 * la ruta sale de la fila). `null` si el objeto no existe (los datos demo apuntan a archivos que nunca se
 * subieron); un archivo ilegible o de otro documento es un fallo.
 */
async function archivoProveedorGuardado(
  contexto: ContextoActor,
  documentoId: string,
  ruta: string
): Promise<ResultadoAccion<ArchivoProveedorDs | null>> {
  if (!perteneceA(ruta, carpetaSoporte("documento_soporte", documentoId))) {
    informar("leer el archivo para el proveedor", new Error("ruta ajena"))
    return fallo(MENSAJES_DOCUMENTO.archivoProveedorIlegible)
  }
  const { data, error } = await contexto.admin.storage
    .from("soportes")
    .download(asegurarRutaSegura(ruta))
  if (error) {
    if (objetoInexistente(error)) return exito(null)
    informarStorage("descargar el archivo para el proveedor", error)
    return fallo(MENSAJES_DOCUMENTO.archivoProveedorIlegible)
  }
  let contenido: unknown
  try {
    contenido = JSON.parse(await data.text())
  } catch (causa) {
    informar("leer el archivo para el proveedor", causa)
    return fallo(MENSAJES_DOCUMENTO.archivoProveedorIlegible)
  }
  const lectura = esquemaArchivoProveedor.safeParse(contenido)
  if (!lectura.success || lectura.data.documento.id !== documentoId) {
    informar(
      "validar el archivo para el proveedor",
      lectura.error ?? new Error("documento ajeno")
    )
    return fallo(MENSAJES_DOCUMENTO.archivoProveedorIlegible)
  }
  return exito(lectura.data)
}

async function subirPdf(
  contexto: ContextoActor,
  documentoId: string,
  pdf: Awaited<ReturnType<typeof construirDocumentoSoportePdf>>
) {
  return subirComoServicio({
    cliente: contexto.admin,
    destino: nuevaRuta(
      carpetaSoporte("documento_soporte", documentoId),
      "application/pdf"
    ),
    contenido: new Uint8Array(pdf.output("arraybuffer")),
    tipo: "application/pdf",
  })
}

async function adjuntar(
  contexto: ContextoActor,
  documentoId: string,
  rutas: { pdf: string; archivoProveedor: string | null }
): Promise<ResultadoAccion> {
  const { error } = await contexto.admin.rpc(
    "adjuntar_archivos_documento_soporte_srv",
    argumentosRpc<"adjuntar_archivos_documento_soporte_srv">({
      p_documento_id: documentoId,
      p_pdf_path: rutas.pdf,
      // `null` conserva el que ya tiene la fila (la función usa `coalesce`).
      p_archivo_proveedor_path: rutas.archivoProveedor,
      p_actor_id: contexto.actorId,
      p_session_id: contexto.sessionId,
    })
  )
  return error ? falloBd("adjuntar los archivos", error) : exito()
}

/** Solo el PDF, desde el archivo ya guardado y con el CUDS de la fila. */
async function pdfDesdeArchivoGuardado(
  contexto: ContextoActor,
  datos: DatosDocumentoSoporteBd,
  archivo: ArchivoProveedorDs,
  ahora: Date
): Promise<ResultadoAccion<ArchivosGenerados>> {
  const documentoId = datos.documento.id
  const pdf = await construirDocumentoSoportePdf(
    datosPdfDesdeArchivoProveedor(archivo, datos.documento.cuds, ahora),
    LOGO_DOCUMENTOS
  )
  const subida = await subirPdf(contexto, documentoId, pdf)
  if (!subida.ok) return subida
  const adjuntado = await adjuntar(contexto, documentoId, {
    pdf: subida.datos.ruta,
    archivoProveedor: null,
  })
  if (!adjuntado.ok) return adjuntado
  return exito({ numero: archivo.documento.numero })
}

/** Los dos archivos con los datos vigentes del medio (la emisión, o un documento sin archivo guardado). */
async function archivosDesdeDatosVigentes(
  contexto: ContextoActor,
  datos: DatosDocumentoSoporteBd,
  ahora: Date
): Promise<ResultadoAccion<ArchivosGenerados>> {
  const documentoId = datos.documento.id
  const vendedor = await vendedorDescifrado(contexto, datos.medio.id)
  if (!vendedor.ok) return vendedor
  const modelo = componerModelo(datos, vendedor.datos)

  const pdf = await construirDocumentoSoportePdf(
    datosPdfDocumentoSoporte(modelo, ahora),
    LOGO_DOCUMENTOS
  )
  const json = serializarArchivoProveedor(
    archivoProveedorDocumentoSoporte(modelo, ahora)
  )

  const [subidaPdf, subidaJson] = await Promise.all([
    subirPdf(contexto, documentoId, pdf),
    subirComoServicio({
      cliente: contexto.admin,
      destino: nuevaRuta(
        carpetaSoporte("documento_soporte", documentoId),
        MIME_ARCHIVO_PROVEEDOR
      ),
      contenido: json,
      tipo: MIME_ARCHIVO_PROVEEDOR,
    }),
  ])
  if (!subidaPdf.ok) return subidaPdf
  if (!subidaJson.ok) return subidaJson

  const adjuntado = await adjuntar(contexto, documentoId, {
    pdf: subidaPdf.datos.ruta,
    archivoProveedor: subidaJson.datos.ruta,
  })
  if (!adjuntado.ok) return adjuntado
  return exito({ numero: modelo.documento.numero })
}

/**
 * Genera y guarda los archivos de un documento EMITIDO. Idempotente en efecto: cada llamada sube objetos
 * nuevos y la fila apunta a los últimos (la bitácora guarda cada cambio). Con el archivo para el proveedor
 * ya guardado, solo se rehace el PDF a partir de él.
 */
export async function generarArchivosDocumento(
  contexto: ContextoActor,
  documentoId: string,
  ahora: Date = new Date()
): Promise<ResultadoAccion<ArchivosGenerados>> {
  try {
    const lectura = await leerDatos(documentoId)
    if (!lectura.ok) return lectura
    const datos = lectura.datos
    if (datos.documento.estado !== "EMITIDO") {
      return fallo(MENSAJES_DOCUMENTO.documentoNoEmitido)
    }

    const guardado = datos.documento.archivo_proveedor_path
    if (guardado) {
      const archivo = await archivoProveedorGuardado(
        contexto,
        documentoId,
        guardado
      )
      if (!archivo.ok) return archivo
      if (archivo.datos) {
        return await pdfDesdeArchivoGuardado(
          contexto,
          datos,
          archivo.datos,
          ahora
        )
      }
      // El objeto no existe: no hay un archivo transmitido que respetar.
    }
    return await archivosDesdeDatosVigentes(contexto, datos, ahora)
  } catch (error) {
    if (error instanceof DocumentoNoEmitido) {
      return fallo(MENSAJES_DOCUMENTO.documentoNoEmitido)
    }
    informar("generar los archivos del documento", error)
    return fallo(MENSAJE_INESPERADO)
  }
}
