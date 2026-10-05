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
            let camara = UIImagePickerController()
            camara.sourceType = .camera
            camara.cameraCaptureMode = .photo
            camara.delegate = context.coordinator
            return camara
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
        private let padre: CameraPicker

        init(_ padre: CameraPicker) {
            self.padre = padre
        }

        func imagePickerController(
            _ picker: UIImagePickerController,
            didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
        ) {
            if let image = info[.originalImage] as? UIImage {
                padre.onCapture(image)
            } else {
                padre.onCancel()
            }
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            padre.onCancel()
        }

        func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
            guard let provider = results.first?.itemProvider, provider.canLoadObject(ofClass: UIImage.self) else {
                padre.onCancel()
                return
            }
            let onCapture = padre.onCapture
            let onCancel = padre.onCancel
            provider.loadObject(ofClass: UIImage.self) { object, _ in
                DispatchQueue.main.async {
                    if let image = object as? UIImage { onCapture(image) } else { onCancel() }
                }
            }
        }
    }
}
