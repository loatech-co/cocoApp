import Foundation
import UIKit

/// La foto que toma la cámara, al tamaño que recomienda
/// `CONTRATO_DE_SOPORTES`: lado mayor a 1600 px y JPEG al 0,85. Igual que
/// `PhotoReducer`, pero desde un `UIImage` y corrigiendo la orientación
/// EXIF: dibujar la imagen la deja en `.up`, así que el OCR y la API reciben
/// el recibo derecho aunque el teléfono estuviera girado.
enum PhotoShrinker {
    static func jpeg(_ image: UIImage, maxSide: CGFloat = 1600, quality: CGFloat = 0.85) -> Data? {
        // `size` ya viene en puntos y orientada; `scale` la pasa a píxeles.
        let destination = targetSize(
            width: image.size.width * image.scale, height: image.size.height * image.scale, maxSide: maxSide)
        guard destination.width >= 1, destination.height >= 1 else { return nil }
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let rendered = UIGraphicsImageRenderer(size: destination, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: destination))
        }
        return rendered.jpegData(compressionQuality: quality)
    }

    /// Puro: encoge proporcionalmente y nunca agranda.
    static func targetSize(width: CGFloat, height: CGFloat, maxSide: CGFloat) -> CGSize {
        let longSide = max(width, height)
        let factor = longSide > maxSide ? maxSide / longSide : 1
        return CGSize(width: (width * factor).rounded(.down), height: (height * factor).rounded(.down))
    }
}
