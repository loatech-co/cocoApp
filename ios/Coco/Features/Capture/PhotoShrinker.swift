import Foundation
import UIKit

/// The photo the camera takes, at the size recommended by
/// `RECEIPTS_CONTRACT`: long side at 1600 px and JPEG at 0.85. Same as
/// `PhotoReducer`, but from a `UIImage` and correcting the EXIF
/// orientation: drawing the image leaves it at `.up`, so the OCR and the API receive
/// the receipt upright even if the phone was rotated.
enum PhotoShrinker {
    static func jpeg(_ image: UIImage, maxSide: CGFloat = 1600, quality: CGFloat = 0.85) -> Data? {
        // `size` already comes in points and oriented; `scale` turns it into pixels.
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

    /// Pure: shrinks proportionally and never enlarges.
    static func targetSize(width: CGFloat, height: CGFloat, maxSide: CGFloat) -> CGSize {
        let longSide = max(width, height)
        let factor = longSide > maxSide ? maxSide / longSide : 1
        return CGSize(width: (width * factor).rounded(.down), height: (height * factor).rounded(.down))
    }
}
