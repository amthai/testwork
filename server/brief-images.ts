import type { BriefImage } from "../src/lib/methodology.js"
import { AppError } from "./errors.js"

// Bound JPEG dimensions without decoding untrusted pixels on the server.
export function validateBriefImages(images: BriefImage[]) {
  for (const image of images) {
    const bytes = Buffer.from(image.dataUrl.slice("data:image/jpeg;base64,".length), "base64")
    let valid = false
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9) {
      let offset = 2
      while (offset + 4 < bytes.length) {
        if (bytes[offset++] !== 0xff) break
        while (bytes[offset] === 0xff) offset++
        const marker = bytes[offset++]
        if (marker === 0xda || marker === 0xd9 || offset + 2 > bytes.length) break
        const length = bytes.readUInt16BE(offset)
        if (length < 2 || offset + length > bytes.length) break
        if ([0xc0, 0xc1, 0xc2].includes(marker) && length >= 8) {
          const height = bytes.readUInt16BE(offset + 3), width = bytes.readUInt16BE(offset + 5)
          valid = width > 0 && height > 0 && width <= 2048 && height <= 2048
          break
        }
        offset += length
      }
    }
    if (!valid) throw new AppError(400, "invalid_brief_image", "Не удалось прочитать фото. Прикрепи его заново в формате JPG, PNG или WebP.")
  }
}
