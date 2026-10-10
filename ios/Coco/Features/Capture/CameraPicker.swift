import PhotosUI
import SwiftUI
import UIKit

/// The camera if there is one; if not —the simulator—, the system photo
/// picker, so that the smoke test can attach a receipt all the same.
struct CameraPicker: UIViewControllerRepresentable {
    let onCapture: @MainActor (UIImage) -> Void
    let onCancel: @MainActor () -> Void

    static var hasCamera: Bool {
        UIImagePickerController.isSourceTypeAvailable(.camera)
    }

    func makeUIViewController(context: Context) -> UIViewController {
        if Self.hasCamera {
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
                let image = object as? UIImage
                Task { @MainActor in
                    if let image { onCapture(image) } else { onCancel() }
                }
            }
        }
    }
}
