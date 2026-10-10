import Foundation
import UIKit

/// What `CONTRATO_DE_SOPORTES` recommends: long side at 1600 px and JPEG at
/// 0.85. A twelve-megapixel photo weighs 4 MB and the OCR does not read better; at
/// 1600 px it weighs 300 KB. If the bytes are not an image they are returned as is:
/// the queue does not decide what a receipt is, it only shrinks it.
enum PhotoReducer {
    static let maxSide: CGFloat = 1600
    static let quality: CGFloat = 0.85

    static func jpeg(_ data: Data, maxSide: CGFloat = PhotoReducer.maxSide) -> Data {
        guard let image = UIImage(data: data) else { return data }
        let width = image.size.width * image.scale
        let height = image.size.height * image.scale
        let longSide = max(width, height)
        let factor = longSide > maxSide ? maxSide / longSide : 1
        let destination = CGSize(width: (width * factor).rounded(.down), height: (height * factor).rounded(.down))
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let rendered = UIGraphicsImageRenderer(size: destination, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: destination))
        }
        return rendered.jpegData(compressionQuality: quality) ?? data
    }
}
