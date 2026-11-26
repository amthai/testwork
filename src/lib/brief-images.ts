import { MAX_BRIEF_IMAGE_URL, type BriefImage } from "./methodology"

export const BRIEF_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp"
export const MAX_BRIEF_FILE_BYTES = 10 * 1024 * 1024

export function validateBriefFile(file: Pick<File, "type" | "size">) {
  if (!BRIEF_IMAGE_ACCEPT.split(",").includes(file.type)) throw new Error("Подойдут фотографии JPG, PNG или WebP. Другой формат нужно экспортировать в один из них.")
  if (!file.size || file.size > MAX_BRIEF_FILE_BYTES) throw new Error("Фото должно быть не больше 10 МБ. Выбери файл поменьше.")
}

export async function prepareBriefImage(file: File): Promise<BriefImage> {
  validateBriefFile(file)
  let bitmap: ImageBitmap
  try { bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }) }
  catch { throw new Error("Не удалось открыть фото. Попробуй другой файл JPG, PNG или WebP.") }
  try {
    const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext("2d")
    if (!context) throw new Error("Не удалось подготовить фото в этом браузере. Попробуй ещё раз.")
    context.fillStyle = "#fff"; context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    for (const quality of [0.9, 0.8, 0.65]) {
      const dataUrl = canvas.toDataURL("image/jpeg", quality)
      if (dataUrl.startsWith("data:image/jpeg;base64,") && dataUrl.length <= MAX_BRIEF_IMAGE_URL) return { id: crypto.randomUUID(), name: file.name.trim().slice(0, 160) || "Фото задания", dataUrl }
    }
    throw new Error("Фото слишком подробное для загрузки. Обрежь лишнее вокруг задания и добавь снова.")
  } finally { bitmap.close() }
}
