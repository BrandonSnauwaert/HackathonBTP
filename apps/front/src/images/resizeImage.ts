/** Plus grand côté d'une photo envoyée : suffisant à l'écran et à l'impression d'un devis. */
const MAX_SIDE = 1600;
const JPEG_QUALITY = 0.82;

/**
 * Réduit une photo avant l'envoi : une photo de téléphone (3 à 12 Mo) passe à ~200-400 Ko.
 * L'orientation EXIF est appliquée (photo prise en portrait). Renvoie un JPEG.
 */
export async function resizeImage(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Redimensionnement impossible sur ce navigateur");
    context.drawImage(bitmap, 0, 0, width, height);

    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Conversion de la photo impossible"))),
        "image/jpeg",
        JPEG_QUALITY,
      ),
    );
  } finally {
    bitmap.close();
  }
}
