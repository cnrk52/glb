/**
 * Client-side image compression (HTML5 Canvas).
 * Resizes to a max width and re-encodes as JPEG so that base64 payloads stay
 * far below Firestore's 1 MB document limit.
 */
export const MAX_IMAGE_WIDTH = 800;
export const JPEG_QUALITY = 0.7;

export function compressImage(
  file: File,
  maxWidth: number = MAX_IMAGE_WIDTH,
  quality: number = JPEG_QUALITY
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Lütfen geçerli bir görsel dosyası seçin."));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Dosya okunamadı."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Görsel çözümlenemedi."));
      img.onload = () => {
        const scale = img.width > maxWidth ? maxWidth / img.width : 1;
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas desteklenmiyor."));
          return;
        }
        // White background so transparent PNGs don't turn black in JPEG
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
