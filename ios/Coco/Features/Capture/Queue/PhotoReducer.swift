import Foundation
import UIKit

/// Lo que recomienda `CONTRATO_DE_SOPORTES`: lado mayor a 1600 px y JPEG al
/// 0,85. Una foto de doce megapíxeles pesa 4 MB y el OCR no lee mejor; a
/// 1600 px pesa 300 KB. Si los bytes no son una imagen se devuelven tal cual:
/// la cola no decide qué es un soporte, solo lo achica.
enum PhotoReducer {
    static let maxSide: CGFloat = 1600
    static let quality: CGFloat = 0.85

    static func jpeg(_ data: Data, maxSide: CGFloat = PhotoReducer.maxSide) -> Data {
        guard let image = UIImage(data: data) else { return data }
        let width = image.size.width * image.scale
        let height = image.size.height * image.scale
        let mayor = max(width, height)
        let factor = mayor > maxSide ? maxSide / mayor : 1
        let destination = CGSize(width: (width * factor).rounded(.down), height: (height * factor).rounded(.down))
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let rendered = UIGraphicsImageRenderer(size: destination, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: destination))
        }
        return rendered.jpegData(compressionQuality: quality) ?? data
    }
}
