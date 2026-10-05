import Foundation
import UIKit

/// Lo que recomienda `CONTRATO_DE_SOPORTES`: lado mayor a 1600 px y JPEG al
/// 0,85. Una foto de doce megapíxeles pesa 4 MB y el OCR no lee mejor; a
/// 1600 px pesa 300 KB. Si los bytes no son una imagen se devuelven tal cual:
/// la cola no decide qué es un soporte, solo lo achica.
enum PhotoReducer {
    static let ladoMaximo: CGFloat = 1600
    static let calidad: CGFloat = 0.85

    static func jpeg(_ data: Data, ladoMaximo: CGFloat = PhotoReducer.ladoMaximo) -> Data {
        guard let imagen = UIImage(data: data) else { return data }
        let ancho = imagen.size.width * imagen.scale
        let alto = imagen.size.height * imagen.scale
        let mayor = max(ancho, alto)
        let factor = mayor > ladoMaximo ? ladoMaximo / mayor : 1
        let destination = CGSize(width: (ancho * factor).rounded(.down), height: (alto * factor).rounded(.down))
        let formato = UIGraphicsImageRendererFormat()
        formato.scale = 1
        let dibujada = UIGraphicsImageRenderer(size: destination, format: formato).image { _ in
            imagen.draw(in: CGRect(origin: .zero, size: destination))
        }
        return dibujada.jpegData(compressionQuality: calidad) ?? data
    }
}
