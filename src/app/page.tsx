import { redirect } from "next/navigation"

/** La raíz no tiene contenido propio: el panel vive en /inicio (el proxy exige sesión). */
export default function Raiz() {
  redirect("/inicio")
}
