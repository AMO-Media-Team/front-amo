/**
 * Video MP4 de muestra (módulo puro) para las pruebas de creativos: H.264
 * Constrained Baseline dentro de un contenedor ISO BMFF, construido byte a
 * byte sin ffmpeg ni dependencias. El navegador lo reproduce y lee su
 * `videoWidth`, `videoHeight` y `duration` como los de un video real
 * (`scripts/bootstrap/comprobar-archivos-prueba.ts` lo comprueba en Chromium).
 *
 * El truco que lo hace pequeño y sin codificador: el primer cuadro (IDR) lleva
 * cada macrobloque como I_PCM, es decir, las muestras YCbCr tal cual (H.264
 * §7.3.5), y los demás cuadros son P con todos los macrobloques omitidos
 * (`mb_skip_run`), que repiten el anterior. Pesa unos 384 bytes por macrobloque
 * del primer cuadro más unos bytes por cuadro: 360 × 640 son ~350 KB y
 * 1080 × 1920, ~3 MB. La imagen es la misma muestra que `pngDeMuestra`: una
 * franja en el 20 % superior sobre un fondo.
 */
import type { ColorRgb } from "./archivos-prueba"
import { EscritorBits } from "./escritor-bits"

/** Cuadros por segundo del video (los P omitidos casi no pesan). */
export const CUADROS_POR_SEGUNDO = 10
/** Unidades de tiempo por segundo del contenedor (milisegundos). */
const ESCALA_TIEMPO = 1000

const PERFIL_BASELINE = 66
/** constraint_set0_flag y constraint_set1_flag: Constrained Baseline. */
const RESTRICCIONES = 0b1100_0000
const LOG2_MAX_FRAME_NUM = 8
const MB_TYPE_I_PCM = 25
const SLICE_I = 7
const SLICE_P = 5
const NAL_SLICE = 1
const NAL_IDR = 5
const NAL_SPS = 7
const NAL_PPS = 8
const LADO_MB = 16
const LADO_MB_CROMA = 8
/** El ancho y el alto se recortan de a 2 píxeles en 4:2:0 (H.264 §7.4.2.1.1). */
const UNIDAD_RECORTE = 2
/** SMPTE 170M (BT.601 de 525 líneas) en las tablas E-3, E-4 y E-5. */
const COLOR_BT601 = 6

/** Niveles de H.264 (Tabla A-1): macrobloques por segundo y por cuadro. */
const NIVELES: readonly (readonly [
  nivel: number,
  mbPorSegundo: number,
  mbPorCuadro: number,
])[] = [
  [10, 1_485, 99],
  [11, 3_000, 396],
  [12, 6_000, 396],
  [13, 11_880, 396],
  [20, 11_880, 396],
  [21, 19_800, 792],
  [22, 20_250, 1_620],
  [30, 40_500, 1_620],
  [31, 108_000, 3_600],
  [32, 216_000, 5_120],
  [40, 245_760, 8_192],
  [42, 522_240, 8_704],
  [50, 589_824, 22_080],
  [51, 983_040, 36_864],
]

export interface OpcionesVideo {
  /** Píxeles visibles; pares (4:2:0). */
  ancho: number
  alto: number
  /** Duración; se redondea al cuadro (décimas de segundo). */
  segundos: number
  fondo: ColorRgb
  franja: ColorRgb
}

export class ErrorVideoPrueba extends RangeError {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = "ErrorVideoPrueba"
  }
}

/** Cuadros que dura un video de `segundos` (al menos uno). */
export function cuadrosDeVideo(segundos: number): number {
  if (!Number.isFinite(segundos) || segundos <= 0) {
    throw new ErrorVideoPrueba("La duración del video debe ser positiva.")
  }
  return Math.max(1, Math.round(segundos * CUADROS_POR_SEGUNDO))
}

/**
 * Nivel mínimo de H.264 que admite el tamaño de cuadro y la tasa de
 * macrobloques (`level_idc`: 40 = 4.0).
 */
export function nivelH264(mbAncho: number, mbAlto: number): number {
  const porCuadro = mbAncho * mbAlto
  const elegido = NIVELES.find(
    ([, porSegundo, maximo]) =>
      porCuadro <= maximo &&
      porCuadro * CUADROS_POR_SEGUNDO <= porSegundo &&
      Math.max(mbAncho, mbAlto) <= Math.sqrt(8 * maximo)
  )
  if (!elegido) {
    throw new ErrorVideoPrueba("El video es demasiado grande para H.264.")
  }
  return elegido[0]
}

/**
 * RGB → YCbCr BT.601 de rango limitado (16–235), lo que asume un decodificador
 * sin VUI. Nunca 0: las primeras versiones de H.264 lo prohibían en I_PCM.
 */
export function yCbCrLimitado([rojo, verde, azul]: ColorRgb): [
  y: number,
  cb: number,
  cr: number,
] {
  const acotar = (valor: number) =>
    Math.min(254, Math.max(1, Math.round(valor)))
  return [
    acotar(16 + (65.481 * rojo + 128.553 * verde + 24.966 * azul) / 255),
    acotar(128 + (-37.797 * rojo - 74.203 * verde + 112 * azul) / 255),
    acotar(128 + (112 * rojo - 93.786 * verde - 18.214 * azul) / 255),
  ]
}

/**
 * Inserta los bytes de prevención de emulación (0x03 tras dos 0x00 seguidos
 * de un byte ≤ 3) para que el contenido no imite un código de inicio (§7.4.1).
 */
export function conPrevencionEmulacion(rbsp: Uint8Array): Buffer {
  const salida: number[] = []
  let ceros = 0
  for (const byte of rbsp) {
    if (ceros >= 2 && byte <= 3) {
      salida.push(3)
      ceros = 0
    }
    salida.push(byte)
    ceros = byte === 0 ? ceros + 1 : 0
  }
  return Buffer.from(salida)
}

/** Unidad NAL: cabecera (`nal_ref_idc`, `nal_unit_type`) y carga protegida. */
function nal(tipo: number, referencia: number, rbsp: Buffer): Buffer {
  return Buffer.concat([
    Buffer.of((referencia << 5) | tipo),
    // La carga I_PCM ocupa megas: el bucle de bytes basta (se genera una vez).
    conPrevencionEmulacion(rbsp),
  ])
}

interface Geometria {
  ancho: number
  alto: number
  mbAncho: number
  mbAlto: number
  nivel: number
}

function geometria(ancho: number, alto: number): Geometria {
  for (const [nombre, valor] of [
    ["ancho", ancho],
    ["alto", alto],
  ] as const) {
    if (!Number.isInteger(valor) || valor < 2 || valor % 2 !== 0) {
      throw new ErrorVideoPrueba(
        `El ${nombre} del video debe ser un entero par positivo (4:2:0).`
      )
    }
  }
  const mbAncho = Math.ceil(ancho / LADO_MB)
  const mbAlto = Math.ceil(alto / LADO_MB)
  return { ancho, alto, mbAncho, mbAlto, nivel: nivelH264(mbAncho, mbAlto) }
}

function conjuntoSecuencia(g: Geometria): Buffer {
  const recorteDerecha = (g.mbAncho * LADO_MB - g.ancho) / UNIDAD_RECORTE
  const recorteAbajo = (g.mbAlto * LADO_MB - g.alto) / UNIDAD_RECORTE
  const recorta = recorteDerecha > 0 || recorteAbajo > 0
  const e = new EscritorBits()
    .bits(PERFIL_BASELINE, 8)
    .bits(RESTRICCIONES, 8)
    .bits(g.nivel, 8)
    .ue(0) // seq_parameter_set_id
    .ue(LOG2_MAX_FRAME_NUM - 4)
    .ue(2) // pic_order_cnt_type: orden de salida = orden de decodificación
    .ue(1) // max_num_ref_frames
    .bit(0) // gaps_in_frame_num_value_allowed_flag
    .ue(g.mbAncho - 1)
    .ue(g.mbAlto - 1)
    .bit(1) // frame_mbs_only_flag
    .bit(1) // direct_8x8_inference_flag
    .bit(recorta)
  if (recorta) e.ue(0).ue(recorteDerecha).ue(0).ue(recorteAbajo)
  // VUI (Anexo E): color BT.601 explícito (sin él, Chromium supone BT.709 en
  // HD y la muestra cambia de tono) y la cadencia de cuadros.
  e.bit(1) // vui_parameters_present_flag
    .bit(0) // aspect_ratio_info_present_flag
    .bit(0) // overscan_info_present_flag
    .bit(1) // video_signal_type_present_flag
    .bits(5, 3) // video_format: sin especificar
    .bit(0) // video_full_range_flag: rango limitado
    .bit(1) // colour_description_present_flag
    .bits(COLOR_BT601, 8) // colour_primaries
    .bits(COLOR_BT601, 8) // transfer_characteristics
    .bits(COLOR_BT601, 8) // matrix_coefficients
    .bit(0) // chroma_loc_info_present_flag
    .bit(1) // timing_info_present_flag
    .bits(1, 32) // num_units_in_tick
    .bits(2 * CUADROS_POR_SEGUNDO, 32) // time_scale (dos campos por cuadro)
    .bit(1) // fixed_frame_rate_flag
    .bit(0) // nal_hrd_parameters_present_flag
    .bit(0) // vcl_hrd_parameters_present_flag
    .bit(0) // pic_struct_present_flag
    .bit(0) // bitstream_restriction_flag
  return nal(NAL_SPS, 3, e.cerrarRbsp().aBuffer())
}

function conjuntoImagen(): Buffer {
  const e = new EscritorBits()
    .ue(0) // pic_parameter_set_id
    .ue(0) // seq_parameter_set_id
    .bit(0) // entropy_coding_mode_flag: CAVLC
    .bit(0) // bottom_field_pic_order_in_frame_present_flag
    .ue(0) // num_slice_groups_minus1
    .ue(0) // num_ref_idx_l0_default_active_minus1
    .ue(0) // num_ref_idx_l1_default_active_minus1
    .bit(0) // weighted_pred_flag
    .bits(0, 2) // weighted_bipred_idc
    .se(0) // pic_init_qp_minus26
    .se(0) // pic_init_qs_minus26
    .se(0) // chroma_qp_index_offset
    .bit(1) // deblocking_filter_control_present_flag
    .bit(0) // constrained_intra_pred_flag
    .bit(0) // redundant_pic_cnt_present_flag
  return nal(NAL_PPS, 3, e.cerrarRbsp().aBuffer())
}

/** Cuadro IDR: un corte I con todos sus macrobloques I_PCM. */
function cuadroIdr(g: Geometria, fondo: ColorRgb, franja: ColorRgb): Buffer {
  const altoFranja = Math.ceil(g.alto * 0.2)
  const [colorFondo, colorFranja] = [
    yCbCrLimitado(fondo),
    yCbCrLimitado(franja),
  ]
  // La muestra solo cambia por filas: un valor por fila de luma y de croma.
  const filaLuma = (y: number) => (y < altoFranja ? colorFranja : colorFondo)[0]
  const filaCroma = (y: number, plano: 1 | 2) =>
    (y * 2 < altoFranja ? colorFranja : colorFondo)[plano]

  const e = new EscritorBits()
    .ue(0) // first_mb_in_slice
    .ue(SLICE_I)
    .ue(0) // pic_parameter_set_id
    .bits(0, LOG2_MAX_FRAME_NUM) // frame_num
    .ue(0) // idr_pic_id
    .bit(0) // no_output_of_prior_pics_flag
    .bit(0) // long_term_reference_flag
    .se(0) // slice_qp_delta
    .ue(1) // disable_deblocking_filter_idc: sin filtro
  const luma = new Uint8Array(LADO_MB * LADO_MB)
  const croma = new Uint8Array(LADO_MB_CROMA * LADO_MB_CROMA)
  for (let mbY = 0; mbY < g.mbAlto; mbY += 1) {
    for (let y = 0; y < LADO_MB; y += 1) {
      luma.fill(filaLuma(mbY * LADO_MB + y), y * LADO_MB, (y + 1) * LADO_MB)
    }
    for (let mbX = 0; mbX < g.mbAncho; mbX += 1) {
      e.ue(MB_TYPE_I_PCM).alinear(0).bytes(luma)
      for (const plano of [1, 2] as const) {
        for (let y = 0; y < LADO_MB_CROMA; y += 1) {
          croma.fill(
            filaCroma(mbY * LADO_MB_CROMA + y, plano),
            y * LADO_MB_CROMA,
            (y + 1) * LADO_MB_CROMA
          )
        }
        e.bytes(croma)
      }
    }
  }
  return nal(NAL_IDR, 3, e.cerrarRbsp().aBuffer())
}

/** Cuadro P que repite el anterior: todos los macrobloques omitidos. */
function cuadroRepetido(g: Geometria, numero: number): Buffer {
  const e = new EscritorBits()
    .ue(0) // first_mb_in_slice
    .ue(SLICE_P)
    .ue(0) // pic_parameter_set_id
    .bits(numero % 2 ** LOG2_MAX_FRAME_NUM, LOG2_MAX_FRAME_NUM) // frame_num
    .bit(0) // num_ref_idx_active_override_flag
    .bit(0) // ref_pic_list_modification_flag_l0
    .bit(0) // adaptive_ref_pic_marking_mode_flag
    .se(0) // slice_qp_delta
    .ue(1) // disable_deblocking_filter_idc
    .ue(g.mbAncho * g.mbAlto) // mb_skip_run
  // Referencia (nal_ref_idc 2): con pic_order_cnt_type 2 no pueden seguirse
  // dos cuadros que no lo sean.
  return nal(NAL_SLICE, 2, e.cerrarRbsp().aBuffer())
}

// ── Contenedor ISO BMFF ──────────────────────────────────────────────────────

function u8(valor: number): Buffer {
  return Buffer.of(valor)
}

function u16(valor: number): Buffer {
  const b = Buffer.alloc(2)
  b.writeUInt16BE(valor)
  return b
}

function u32(valor: number): Buffer {
  const b = Buffer.alloc(4)
  b.writeUInt32BE(valor)
  return b
}

function ceros(cantidad: number): Buffer {
  return Buffer.alloc(cantidad)
}

function caja(tipo: string, ...contenido: Buffer[]): Buffer {
  const cuerpo = Buffer.concat(contenido)
  return Buffer.concat([
    u32(8 + cuerpo.length),
    Buffer.from(tipo, "ascii"),
    cuerpo,
  ])
}

function cajaCompleta(
  tipo: string,
  version: number,
  banderas: number,
  ...contenido: Buffer[]
): Buffer {
  return caja(tipo, u32((version << 24) | banderas), ...contenido)
}

/** Matriz identidad de transformación (16.16 y 2.30). */
const MATRIZ = Buffer.concat(
  [0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000].map(u32)
)

/** Idioma «und» empaquetado en tres letras de 5 bits (ISO 639-2/T). */
const IDIOMA_INDEFINIDO = 0x55c4

function entradaAvc1(g: Geometria, sps: Buffer, pps: Buffer): Buffer {
  const nombre = Buffer.alloc(32)
  const compresor = "AMO E2E H.264"
  nombre[0] = compresor.length
  nombre.write(compresor, 1, "ascii")
  const avcC = caja(
    "avcC",
    u8(1), // configurationVersion
    u8(PERFIL_BASELINE),
    u8(RESTRICCIONES),
    u8(g.nivel),
    u8(0xff), // 6 bits reservados + lengthSizeMinusOne = 3
    u8(0xe1), // 3 bits reservados + un SPS
    u16(sps.length),
    sps,
    u8(1),
    u16(pps.length),
    pps
  )
  return caja(
    "avc1",
    ceros(6),
    u16(1), // data_reference_index
    ceros(16), // pre_defined y reservados
    u16(g.ancho),
    u16(g.alto),
    u32(0x00480000), // 72 ppp
    u32(0x00480000),
    u32(0),
    u16(1), // frame_count
    nombre,
    u16(0x0018), // profundidad de color
    u16(0xffff), // pre_defined = −1
    avcC
  )
}

function indice(
  g: Geometria,
  sps: Buffer,
  pps: Buffer,
  tamanos: readonly number[],
  inicioDatos: number
): Buffer {
  const duracion = (tamanos.length * ESCALA_TIEMPO) / CUADROS_POR_SEGUNDO
  const delta = ESCALA_TIEMPO / CUADROS_POR_SEGUNDO
  const tablaMuestras = caja(
    "stbl",
    cajaCompleta("stsd", 0, 0, u32(1), entradaAvc1(g, sps, pps)),
    cajaCompleta("stts", 0, 0, u32(1), u32(tamanos.length), u32(delta)),
    cajaCompleta("stss", 0, 0, u32(1), u32(1)), // solo el IDR es de sincronía
    cajaCompleta("stsc", 0, 0, u32(1), u32(1), u32(tamanos.length), u32(1)),
    cajaCompleta(
      "stsz",
      0,
      0,
      u32(0),
      u32(tamanos.length),
      ...tamanos.map(u32)
    ),
    cajaCompleta("stco", 0, 0, u32(1), u32(inicioDatos))
  )
  const medios = caja(
    "mdia",
    cajaCompleta(
      "mdhd",
      0,
      0,
      u32(0),
      u32(0),
      u32(ESCALA_TIEMPO),
      u32(duracion),
      u16(IDIOMA_INDEFINIDO),
      u16(0)
    ),
    cajaCompleta(
      "hdlr",
      0,
      0,
      u32(0),
      Buffer.from("vide", "ascii"),
      ceros(12),
      Buffer.from("AMO E2E video\0", "ascii")
    ),
    caja(
      "minf",
      cajaCompleta("vmhd", 0, 1, ceros(8)),
      caja(
        "dinf",
        cajaCompleta("dref", 0, 0, u32(1), cajaCompleta("url ", 0, 1))
      ),
      tablaMuestras
    )
  )
  const pista = caja(
    "trak",
    cajaCompleta(
      "tkhd",
      0,
      0x000003, // habilitada y en la película
      u32(0),
      u32(0),
      u32(1), // track_ID
      u32(0),
      u32(duracion),
      ceros(8),
      u16(0), // layer
      u16(0), // alternate_group
      u16(0), // volumen (video)
      u16(0),
      MATRIZ,
      u32(g.ancho * 0x10000),
      u32(g.alto * 0x10000)
    ),
    medios
  )
  return caja(
    "moov",
    cajaCompleta(
      "mvhd",
      0,
      0,
      u32(0),
      u32(0),
      u32(ESCALA_TIEMPO),
      u32(duracion),
      u32(0x00010000), // velocidad 1.0
      u16(0x0100), // volumen 1.0
      ceros(10),
      MATRIZ,
      ceros(24), // pre_defined
      u32(2) // next_track_ID
    ),
    pista
  )
}

/** Muestra MP4: cada NAL con su largo de 4 bytes (lengthSizeMinusOne = 3). */
function muestra(unidad: Buffer): Buffer {
  return Buffer.concat([u32(unidad.length), unidad])
}

/**
 * MP4 de `segundos` (a 10 cuadros por segundo) con la muestra de `fondo` y
 * `franja`. El índice (`moov`) va antes de los datos: se puede leer mientras
 * se descarga, como lo deja un editor con «inicio rápido».
 */
export function mp4DeMuestra(opciones: OpcionesVideo): Buffer {
  const g = geometria(opciones.ancho, opciones.alto)
  const cuadros = cuadrosDeVideo(opciones.segundos)
  const sps = conjuntoSecuencia(g)
  const pps = conjuntoImagen()
  const muestras = [
    muestra(cuadroIdr(g, opciones.fondo, opciones.franja)),
    ...Array.from({ length: cuadros - 1 }, (_, i) =>
      muestra(cuadroRepetido(g, i + 1))
    ),
  ]
  const tamanos = muestras.map((m) => m.length)
  const tipoArchivo = caja(
    "ftyp",
    Buffer.from("isom", "ascii"),
    u32(0x200),
    Buffer.from("isomiso2avc1mp41", "ascii")
  )
  // El tamaño del índice no depende del desplazamiento: se calcula una vez
  // con 0 y otra con el valor real.
  const largoIndice = indice(g, sps, pps, tamanos, 0).length
  const inicioDatos = tipoArchivo.length + largoIndice + 8
  return Buffer.concat([
    tipoArchivo,
    indice(g, sps, pps, tamanos, inicioDatos),
    caja("mdat", ...muestras),
  ])
}
