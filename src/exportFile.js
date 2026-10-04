import { Capacitor } from "@capacitor/core"
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem"
import { Share } from "@capacitor/share"

// Laisse au navigateur le temps de lire le blob avant de le libérer :
// révoquer juste après click() annule le téléchargement sur certains navigateurs.
const REVOKE_DELAY_MS = 30_000

// Message de rejet du plugin Share (Android) quand la feuille est fermée sans choix.
const SHARE_CANCELED = "Share canceled"

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    // Data URL "data:<mime>;base64,<données>" : seul ce qui suit la virgule compte.
    reader.onload = () => resolve(reader.result.split(",", 2)[1])
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

// La WebView ignore <a download> : on écrit dans le cache (couvert par le
// FileProvider, cf. file_paths.xml) puis on ouvre la feuille de partage.
async function saveFileNative({ filename, data }) {
  const isText = typeof data === "string"
  const { uri } = await Filesystem.writeFile({
    path: filename,
    directory: Directory.Cache,
    data: isText ? data : await blobToBase64(data),
    // Sans encoding, le plugin décode du base64 (fichier binaire).
    ...(isText && { encoding: Encoding.UTF8 }),
  })

  try {
    await Share.share({ title: filename, files: [uri] })
  } catch (error) {
    if (error?.message !== SHARE_CANCELED) throw error
  }
}

function saveFileWeb({ filename, mimeType, data }) {
  const blob =
    typeof data === "string" ? new Blob([data], { type: mimeType }) : data
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS)
}

// data : string (texte, écrit en UTF-8) ou Blob (binaire). Lève en cas
// d'échec réel ; fermer la feuille de partage n'en est pas un.
export async function saveFile({ filename, mimeType, data }) {
  try {
    if (Capacitor.isNativePlatform()) {
      await saveFileNative({ filename, data })
    } else {
      saveFileWeb({ filename, mimeType, data })
    }
  } catch (error) {
    throw new Error(`Couldn't save ${filename}: ${error?.message ?? error}`, {
      cause: error,
    })
  }
}
