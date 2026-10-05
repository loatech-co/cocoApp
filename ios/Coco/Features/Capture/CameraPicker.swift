import PhotosUI
import SwiftUI
import UIKit

/// La cámara si la hay; si no —el simulador—, el selector de fotos del
/// sistema, para que la prueba de humo pueda adjuntar un recibo igual.
struct CameraPicker: UIViewControllerRepresentable {
    let onCapture: (UIImage) -> Void
    let onCancel: () -> Void

    static var hayCamara: Bool {
        UIImagePickerController.isSourceTypeAvailable(.camera)
    }

    func makeUIViewController(context: Context) -> UIViewController {
        if Self.hayCamara {
            let picker = UIImagePickerController()
            picker.sourceType = .camera
            picker.cameraCaptureMode = .photo
            picker.delegate = context.coordinator
            return picker
        }
        var configuration = PHPickerConfiguration()
        configuration.filter = .images
        configuration.selectionLimit = 1
        let selector = PHPickerViewController(configuration: configuration)
        selector.delegate = context.coordinator
        return selector
    }

    func updateUIViewController(_ controller: UIViewController, context: Context) {}

    func makeCoordinator() -> PickerCoordinator { PickerCoordinator(self) }

    final class PickerCoordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate,
        PHPickerViewControllerDelegate
    {
        private let parent: CameraPicker

        init(_ parent: CameraPicker) {
            self.parent = parent
        }

        func imagePickerController(
            _ picker: UIImagePickerController,
            didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
        ) {
            if let image = info[.originalImage] as? UIImage {
                parent.onCapture(image)
            } else {
                parent.onCancel()
            }
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            parent.onCancel()
        }

        func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
            guard let provider = results.first?.itemProvider, provider.canLoadObject(ofClass: UIImage.self) else {
                parent.onCancel()
                return
            }
            let onCapture = parent.onCapture
            let onCancel = parent.onCancel
            provider.loadObject(ofClass: UIImage.self) { object, _ in
                DispatchQueue.main.async {
                    if let image = object as? UIImage { onCapture(image) } else { onCancel() }
                }
            }
        }
    }
}
