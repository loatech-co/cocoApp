import PhotosUI
import SwiftUI
import UIKit

/// La cámara si la hay; si no —el simulador—, el selector de fotos del
/// sistema, para que la prueba de humo pueda adjuntar un recibo igual.
struct TomaDeFoto: UIViewControllerRepresentable {
    let alCapturar: (UIImage) -> Void
    let alCancelar: () -> Void

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
        var configuracion = PHPickerConfiguration()
        configuracion.filter = .images
        configuracion.selectionLimit = 1
        let selector = PHPickerViewController(configuration: configuracion)
        selector.delegate = context.coordinator
        return selector
    }

    func updateUIViewController(_ controlador: UIViewController, context: Context) {}

    func makeCoordinator() -> Coordinador { Coordinador(self) }

    final class Coordinador: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate, PHPickerViewControllerDelegate {
        private let padre: TomaDeFoto

        init(_ padre: TomaDeFoto) {
            self.padre = padre
        }

        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            if let imagen = info[.originalImage] as? UIImage {
                padre.alCapturar(imagen)
            } else {
                padre.alCancelar()
            }
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            padre.alCancelar()
        }

        func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
            guard let proveedor = results.first?.itemProvider, proveedor.canLoadObject(ofClass: UIImage.self) else {
                padre.alCancelar()
                return
            }
            let alCapturar = padre.alCapturar
            let alCancelar = padre.alCancelar
            proveedor.loadObject(ofClass: UIImage.self) { objeto, _ in
                DispatchQueue.main.async {
                    if let imagen = objeto as? UIImage { alCapturar(imagen) } else { alCancelar() }
                }
            }
        }
    }
}
