import Foundation
import UIKit

/// La foto que toma la cámara, al tamaño que recomienda
/// `CONTRATO_DE_SOPORTES`: lado mayor a 1600 px y JPEG al 0,85. Igual que
/// `PhotoReducer`, pero desde un `UIImage` y corrigiendo la orientación
/// EXIF: dibujar la imagen la deja en `.up`, así que el OCR y la API reciben
/// el recibo derecho aunque el teléfono estuviera girado.
enum PhotoShrinker {
    static func jpeg(_ imagen: UIImage, ladoMaximo: CGFloat = 1600, calidad: CGFloat = 0.85) -> Data? {
        // `size` ya viene en puntos y orientada; `scale` la pasa a píxeles.
        let destino = tamanoDestino(
            ancho: imagen.size.width * imagen.scale, alto: imagen.size.height * imagen.scale, ladoMaximo: ladoMaximo)
        guard destino.width >= 1, destino.height >= 1 else { return nil }
        let formato = UIGraphicsImageRendererFormat()
        formato.scale = 1
        let dibujada = UIGraphicsImageRenderer(size: destino, format: formato).image { _ in
            imagen.draw(in: CGRect(origin: .zero, size: destino))
        }
        return dibujada.jpegData(compressionQuality: calidad)
    }

    /// Puro: encoge proporcionalmente y nunca agranda.
    static func tamanoDestino(ancho: CGFloat, alto: CGFloat, ladoMaximo: CGFloat) -> CGSize {
        let mayor = max(ancho, alto)
        let factor = mayor > ladoMaximo ? ladoMaximo / mayor : 1
        return CGSize(width: (ancho * factor).rounded(.down), height: (alto * factor).rounded(.down))
    }
}
