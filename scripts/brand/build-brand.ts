/**
 * Genera los activos de marca de AMO a partir de la geometría del isotipo y
 * de los contornos de Plus Jakarta Sans (la salida no depende de fuentes).
 *
 *   pnpm brand:build
 *
 * Salidas:
 *  - public/brand/*.svg y *.png      → isotipo, logos, icono de app, PNG del manifiesto
 *  - src/app/icon.svg y favicon.ico  → iconos del navegador
 *  - src/components/brand/trazos.ts  → trazados para los componentes React
 *  - scripts/brand/salida/*.png      → lámina de verificación y diagrama de construcción
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { format, resolveConfig } from "prettier"

import {
  AURORA,
  AURORA_ICONO,
  AURORA_PROFUNDA,
  TINTA,
  type ParadaGradiente,
} from "../../src/components/brand/colores"
import {
  centroOptico,
  colocarIsotipo,
  lockupHorizontal,
  lockupVertical,
  type IsotipoColocado,
  type Lockup,
} from "./composicion"
import { svgConstruccion } from "./construccion"
import { codificarIco } from "./ico"
import {
  construirIsotipo,
  ISOTIPO_COMPACTO,
  ISOTIPO_PRINCIPAL,
  type PiezasIsotipo,
} from "./isotipo"
import { construirLamina } from "./lamina"
import { cargarFuente, construirPalabra } from "./logotipo"
import { crearRasterizador } from "./render"
import {
  diagonalAscendente,
  documentoSvg,
  gradienteSvg,
  type Capa,
  type GradienteLineal,
} from "./svg"
import { formatearNumero, serializar, type Caja } from "./trazado"

const RAIZ = join(__dirname, "..", "..")
const DIR_MARCA = join(RAIZ, "public", "brand")
const DIR_APP = join(RAIZ, "src", "app")
const DIR_COMPONENTES = join(RAIZ, "src", "components", "brand")
const DIR_SALIDA = join(__dirname, "salida")
const FUENTES = join(__dirname, "fuentes")

const BLANCO = "#FFFFFF"
const LADO_ICONO = 512

/** Alto del isotipo respecto al lado del icono (el maskable respeta la zona segura del 80 %). */
const PROPORCION_ICONO = {
  redondeado: 0.6,
  completo: 0.58,
  maskable: 0.5,
  pequeno: 0.8,
}
/** Radio de esquina de los iconos redondeados, relativo al lado. */
const RADIO_ICONO = 0.225

type Tono = "oscuro" | "claro"
type Relleno = "gradiente" | "gradiente-profundo" | "mono"

// --- SVG ---------------------------------------------------------------------

type PiezasVisibles = Pick<IsotipoColocado, "pin" | "arcos">

const trazadosIsotipo = (isotipo: PiezasVisibles) => [
  isotipo.pin,
  ...isotipo.arcos,
]

function capaIsotipo(isotipo: PiezasVisibles, relleno: string): Capa {
  return { trazados: trazadosIsotipo(isotipo), relleno }
}

function gradiente(
  id: string,
  caja: Caja,
  paradas: readonly ParadaGradiente[]
): GradienteLineal {
  return { id, paradas, ...diagonalAscendente(caja) }
}

/**
 * Cada archivo lleva su propio id de gradiente (`id`): si alguien pega dos SVG
 * en el mismo documento HTML, ids repetidos harían que uno pinte con el otro.
 */
function svgIsotipo(
  piezas: PiezasIsotipo,
  relleno: Relleno,
  id: string
): string {
  if (relleno === "mono") {
    return documentoSvg({
      caja: piezas.caja,
      capas: [capaIsotipo(piezas, "currentColor")],
      titulo: "AMO",
    })
  }
  const paradas = relleno === "gradiente" ? AURORA : AURORA_PROFUNDA
  return documentoSvg({
    caja: piezas.caja,
    capas: [capaIsotipo(piezas, `url(#${id})`)],
    gradientes: [gradiente(id, piezas.caja, paradas)],
    titulo: "AMO",
  })
}

function capasTexto(
  lockup: Lockup,
  palabra: string,
  descriptor: string
): Capa[] {
  return [
    { trazados: [lockup.palabra], relleno: palabra },
    ...(lockup.descriptor
      ? [{ trazados: [lockup.descriptor], relleno: descriptor }]
      : []),
    ...(lockup.separador
      ? [{ trazados: [lockup.separador], relleno: descriptor, opacidad: 0.45 }]
      : []),
  ]
}

function svgLockup(lockup: Lockup, tono: Tono | "mono", id: string): string {
  if (tono === "mono") {
    return documentoSvg({
      caja: lockup.caja,
      capas: [
        capaIsotipo(lockup.isotipo, "currentColor"),
        ...capasTexto(lockup, "currentColor", "currentColor"),
      ],
      titulo: "AMO",
    })
  }
  const tinta = tono === "oscuro" ? TINTA.sobreOscuro : TINTA.sobreClaro
  const paradas = tono === "oscuro" ? AURORA : AURORA_PROFUNDA
  return documentoSvg({
    caja: lockup.caja,
    capas: [
      capaIsotipo(lockup.isotipo, `url(#${id})`),
      ...capasTexto(lockup, tinta.palabra, tinta.descriptor),
    ],
    gradientes: [gradiente(id, lockup.isotipo.caja, paradas)],
    titulo: "AMO",
  })
}

/** Isotipo centrado ópticamente en un cuadrado de `LADO_ICONO`. */
function isotipoEnIcono(
  piezas: PiezasIsotipo,
  proporcion: number
): IsotipoColocado {
  const escala = (LADO_ICONO * proporcion) / piezas.caja.alto
  const [ox, oy] = centroOptico(piezas)
  const mitad = LADO_ICONO / 2
  return colocarIsotipo(piezas, {
    escala,
    dx: mitad - ox * escala,
    dy: mitad - oy * escala,
  })
}

/** Icono de app: isotipo blanco sobre cuadrado Aurora (radio 0 = sangrado completo). */
function svgIconoApp(
  piezas: PiezasIsotipo,
  proporcion: number,
  radio: number,
  id: string
): string {
  const caja: Caja = { x: 0, y: 0, ancho: LADO_ICONO, alto: LADO_ICONO }
  return documentoSvg({
    caja,
    fondo: { relleno: `url(#${id})`, radio: LADO_ICONO * radio },
    capas: [capaIsotipo(isotipoEnIcono(piezas, proporcion), BLANCO)],
    gradientes: [gradiente(id, caja, AURORA_ICONO)],
    titulo: "AMO",
  })
}

/** Favicon: isotipo compacto que cambia de gradiente con `prefers-color-scheme`. */
function svgFavicon(piezas: PiezasIsotipo): string {
  const lado = Math.max(piezas.caja.ancho, piezas.caja.alto)
  const caja: Caja = {
    x: piezas.caja.x - (lado - piezas.caja.ancho) / 2,
    y: piezas.caja.y - (lado - piezas.caja.alto) / 2,
    ancho: lado,
    alto: lado,
  }
  const defs =
    gradienteSvg(gradiente("amo-favicon-claro", piezas.caja, AURORA_PROFUNDA)) +
    gradienteSvg(gradiente("amo-favicon-oscuro", piezas.caja, AURORA))
  const d = trazadosIsotipo(piezas).map(serializar).join("")
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox(caja)}">` +
    "<style>path{fill:url(#amo-favicon-claro)}@media (prefers-color-scheme:dark){path{fill:url(#amo-favicon-oscuro)}}</style>" +
    `<defs>${defs}</defs><path d="${d}"/></svg>\n`
  )
}

// --- Módulo TS para los componentes ----------------------------------------------

const viewBox = (c: Caja) =>
  [c.x, c.y, c.ancho, c.alto].map(formatearNumero).join(" ")

const proporcion = (c: Caja) => Number((c.ancho / c.alto).toFixed(4))

function datosIsotipo(isotipo: PiezasVisibles & { caja: Caja }) {
  const g = diagonalAscendente(isotipo.caja)
  return {
    pin: serializar(isotipo.pin),
    arcos: isotipo.arcos.map(serializar),
    gradiente: [...g.desde, ...g.hasta].map((v) => Number(formatearNumero(v))),
  }
}

function datosLockup(lockup: Lockup) {
  return {
    viewBox: viewBox(lockup.caja),
    proporcion: proporcion(lockup.caja),
    isotipo: datosIsotipo(lockup.isotipo),
    palabra: serializar(lockup.palabra),
    descriptor: lockup.descriptor ? serializar(lockup.descriptor) : null,
    separador: lockup.separador ? serializar(lockup.separador) : null,
  }
}

function datosIconoApp(piezas: PiezasIsotipo) {
  const isotipo = isotipoEnIcono(piezas, PROPORCION_ICONO.completo)
  return {
    viewBox: `0 0 ${LADO_ICONO} ${LADO_ICONO}`,
    d: trazadosIsotipo(isotipo).map(serializar).join(""),
  }
}

async function moduloTrazos(
  principal: PiezasIsotipo,
  compacto: PiezasIsotipo,
  lockups: Record<string, Lockup>,
  ruta: string
): Promise<string> {
  const isotipo = (p: PiezasIsotipo) => ({
    viewBox: viewBox(p.caja),
    proporcion: proporcion(p.caja),
    ...datosIsotipo(p),
    contornoPin: serializar(p.contornoPin),
  })
  const logos = Object.fromEntries(
    Object.entries(lockups).map(([clave, lockup]) => [
      clave,
      datosLockup(lockup),
    ])
  )
  const constante = (nombre: string, valor: unknown) =>
    `export const ${nombre} = ${JSON.stringify(valor)} as const\n`
  const codigo =
    "// Archivo generado por scripts/brand/build-brand.ts (pnpm brand:build). No editar a mano.\n" +
    "// Trazados en unidades de viewBox; `gradiente` = [x1, y1, x2, y2] con gradientUnits=userSpaceOnUse.\n\n" +
    constante("ISOTIPO", isotipo(principal)) +
    constante("ISOTIPO_COMPACTO", isotipo(compacto)) +
    "\n/** Isotipo principal colocado en un cuadrado de 512 para iconos a sangre (apple-icon). */\n" +
    constante("ICONO_APP", datosIconoApp(principal)) +
    constante("LOGOS", logos)
  const opciones = await resolveConfig(ruta)
  return format(codigo, { ...opciones, filepath: ruta })
}

// --- Principal -----------------------------------------------------------------

function escribir(ruta: string, contenido: string | Buffer) {
  writeFileSync(ruta, contenido)
  console.log("  ✓", ruta.replace(`${RAIZ}/`, ""))
}

async function main() {
  mkdirSync(DIR_MARCA, { recursive: true })
  mkdirSync(DIR_SALIDA, { recursive: true })

  const extraBold = cargarFuente(join(FUENTES, "PlusJakartaSans-ExtraBold.ttf"))
  const semiBold = cargarFuente(join(FUENTES, "PlusJakartaSans-SemiBold.ttf"))
  const principal = construirIsotipo(ISOTIPO_PRINCIPAL)
  const compacto = construirIsotipo(ISOTIPO_COMPACTO)
  const palabra = construirPalabra(extraBold)

  const lockups = {
    horizontal: lockupHorizontal(principal, palabra, semiBold, false),
    horizontalDescriptor: lockupHorizontal(principal, palabra, semiBold, true),
    vertical: lockupVertical(principal, palabra, semiBold, false),
    verticalDescriptor: lockupVertical(principal, palabra, semiBold, true),
  }

  const svgs = {
    isotipo: svgIsotipo(principal, "gradiente", "amo-isotipo"),
    isotipoProfundo: svgIsotipo(
      principal,
      "gradiente-profundo",
      "amo-isotipo-profundo"
    ),
    isotipoMono: svgIsotipo(principal, "mono", "amo-isotipo-mono"),
    isotipoCompacto: svgIsotipo(compacto, "gradiente", "amo-isotipo-compacto"),
    horizontalOscuro: svgLockup(
      lockups.horizontal,
      "oscuro",
      "amo-logo-h-oscuro"
    ),
    horizontalClaro: svgLockup(lockups.horizontal, "claro", "amo-logo-h-claro"),
    horizontalDescriptorOscuro: svgLockup(
      lockups.horizontalDescriptor,
      "oscuro",
      "amo-logo-hd-oscuro"
    ),
    horizontalDescriptorClaro: svgLockup(
      lockups.horizontalDescriptor,
      "claro",
      "amo-logo-hd-claro"
    ),
    verticalOscuro: svgLockup(lockups.vertical, "oscuro", "amo-logo-vs-oscuro"),
    verticalClaro: svgLockup(lockups.vertical, "claro", "amo-logo-vs-claro"),
    verticalDescriptorOscuro: svgLockup(
      lockups.verticalDescriptor,
      "oscuro",
      "amo-logo-v-oscuro"
    ),
    verticalDescriptorClaro: svgLockup(
      lockups.verticalDescriptor,
      "claro",
      "amo-logo-v-claro"
    ),
    mono: svgLockup(lockups.horizontal, "mono", "amo-logo-mono"),
    appIcon: svgIconoApp(
      principal,
      PROPORCION_ICONO.redondeado,
      RADIO_ICONO,
      "amo-app-icon"
    ),
    // En 16–48 px el isotipo compacto ocupa más superficie para no empastarse.
    appIconPequeno: svgIconoApp(
      compacto,
      PROPORCION_ICONO.pequeno,
      RADIO_ICONO,
      "amo-app-icon-pequeno"
    ),
    maskable: svgIconoApp(
      principal,
      PROPORCION_ICONO.maskable,
      0,
      "amo-app-icon-maskable"
    ),
    favicon: svgFavicon(compacto),
  }

  console.log("SVG:")
  const archivos: Record<string, string> = {
    "amo-isotipo.svg": svgs.isotipo,
    "amo-isotipo-profundo.svg": svgs.isotipoProfundo,
    "amo-isotipo-mono.svg": svgs.isotipoMono,
    "amo-isotipo-compacto.svg": svgs.isotipoCompacto,
    "amo-logo-horizontal-oscuro.svg": svgs.horizontalOscuro,
    "amo-logo-horizontal-claro.svg": svgs.horizontalClaro,
    "amo-logo-horizontal-descriptor-oscuro.svg":
      svgs.horizontalDescriptorOscuro,
    "amo-logo-horizontal-descriptor-claro.svg": svgs.horizontalDescriptorClaro,
    "amo-logo-vertical-oscuro.svg": svgs.verticalDescriptorOscuro,
    "amo-logo-vertical-claro.svg": svgs.verticalDescriptorClaro,
    "amo-logo-vertical-simple-oscuro.svg": svgs.verticalOscuro,
    "amo-logo-vertical-simple-claro.svg": svgs.verticalClaro,
    "amo-logo-mono.svg": svgs.mono,
    "amo-app-icon.svg": svgs.appIcon,
  }
  for (const [nombre, svg] of Object.entries(archivos)) {
    escribir(join(DIR_MARCA, nombre), svg)
  }
  escribir(join(DIR_APP, "icon.svg"), svgs.favicon)
  const rutaTrazos = join(DIR_COMPONENTES, "trazos.ts")
  escribir(
    rutaTrazos,
    await moduloTrazos(principal, compacto, lockups, rutaTrazos)
  )

  console.log("PNG:")
  const raster = await crearRasterizador()
  try {
    const png = (svg: string, lado: number) => raster.svgAPng(svg, lado, lado)
    escribir(join(DIR_MARCA, "amo-icon-192.png"), await png(svgs.appIcon, 192))
    escribir(join(DIR_MARCA, "amo-icon-512.png"), await png(svgs.appIcon, 512))
    escribir(
      join(DIR_MARCA, "amo-icon-maskable-512.png"),
      await png(svgs.maskable, 512)
    )

    const tamanosIco = [16, 32, 48]
    const pngsIco = await Promise.all(
      tamanosIco.map((t) => png(svgs.appIconPequeno, t))
    )
    escribir(
      join(DIR_APP, "favicon.ico"),
      codificarIco(tamanosIco.map((tamano, i) => ({ tamano, png: pngsIco[i] })))
    )

    const lamina = construirLamina({
      svgs,
      pixeles: {
        favicon16: await png(svgs.favicon, 16),
        favicon32: await png(svgs.favicon, 32),
        ico16: pngsIco[0],
        ico32: pngsIco[1],
      },
    })
    escribir(
      join(DIR_SALIDA, "lamina.png"),
      await raster.htmlAPng(lamina, 1400)
    )

    const construccion = svgConstruccion(principal, ISOTIPO_PRINCIPAL)
    escribir(
      join(DIR_SALIDA, "construccion.png"),
      await raster.svgAPng(construccion, 900, 900)
    )
  } finally {
    await raster.cerrar()
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
