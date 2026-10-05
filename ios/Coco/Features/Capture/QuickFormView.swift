import SwiftUI

/// Una pantalla: monto, concepto, nota y foto. Guardar encola y cierra sin
/// esperar a la red; lo que pase después lo cuenta la cola por aviso.
struct QuickFormView: View {
    @Bindable var modelo: FormModel
    let abrirCamaraAlEntrar: Bool
    let alCerrar: () -> Void

    @State private var camaraAbierta = false
    @State private var buscadorAbierto = false

    init(modelo: FormModel, abrirCamaraAlEntrar: Bool, alCerrar: @escaping () -> Void) {
        self.modelo = modelo
        self.abrirCamaraAlEntrar = abrirCamaraAlEntrar
        self.alCerrar = alCerrar
    }

    private var fecha: Binding<Date> {
        Binding(get: { modelo.fecha }, set: { modelo.cambiarFecha($0) })
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    AmountField(texto: $modelo.monto)
                } header: {
                    Text("Monto").textCase(nil)
                }

                Section {
                    filaDeConcepto
                } header: {
                    Text("Concepto").textCase(nil)
                }

                Section {
                    DatePicker("Fecha", selection: fecha, displayedComponents: .date)
                    if let comercio = modelo.comercio, !comercio.isEmpty {
                        LabeledContent("Comercio", value: comercio)
                    }
                    TextField("Nota (opcional)", text: $modelo.nota, axis: .vertical)
                        .lineLimit(1...3)
                } header: {
                    Text("Detalles").textCase(nil)
                }

                Section {
                    seccionDeFoto
                } header: {
                    Text("Recibo").textCase(nil)
                }

                if let error = modelo.error {
                    Section {
                        Label(error, systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("Nuevo gasto")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { alCerrar() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Guardar") {
                        // Encola y cierra: la cola avisa cuando se envíe.
                        Task { await modelo.confirmar() }
                        alCerrar()
                    }
                    .disabled(!modelo.puedeConfirmar || modelo.leyendo)
                }
            }
            .sheet(isPresented: $buscadorAbierto) {
                ConceptSearchView(modelo: modelo)
            }
            .fullScreenCover(isPresented: $camaraAbierta) {
                CameraPicker(
                    alCapturar: { imagen in
                        camaraAbierta = false
                        Task { await modelo.leerFoto(imagen) }
                    },
                    alCancelar: { camaraAbierta = false }
                )
                .ignoresSafeArea()
            }
            .onChange(of: modelo.abrirBuscador) { _, abrir in
                if abrir {
                    modelo.abrirBuscador = false
                    buscadorAbierto = true
                }
            }
            .task {
                if abrirCamaraAlEntrar { camaraAbierta = true }
            }
        }
    }

    @ViewBuilder
    private var filaDeConcepto: some View {
        Button {
            buscadorAbierto = true
        } label: {
            HStack {
                if let concepto = modelo.concepto {
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 6) {
                            Text(concepto.nombre)
                            if modelo.conceptoSugerido {
                                Text("sugerido")
                                    .font(.caption)
                                    .padding(.horizontal, 6)
                                    .padding(.vertical, 2)
                                    .background(.tint.opacity(0.15), in: Capsule())
                            }
                        }
                        Text(concepto.rutaLegible)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                } else {
                    Text("Elegir concepto").foregroundStyle(.secondary)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.footnote)
                    .foregroundStyle(.tertiary)
            }
        }
        .tint(.primary)
        if modelo.concepto != nil {
            Button("Quitar concepto", role: .destructive) { modelo.quitarConcepto() }
        }
    }

    @ViewBuilder
    private var seccionDeFoto: some View {
        if let foto = modelo.foto {
            Image(uiImage: foto)
                .resizable()
                .scaledToFit()
                .frame(maxHeight: 220)
                .clipShape(RoundedRectangle(cornerRadius: 10))
        }
        if modelo.leyendo {
            HStack(spacing: 8) {
                ProgressView()
                Text("Leyendo el recibo…").foregroundStyle(.secondary)
            }
        } else if modelo.sinRed {
            Label("Sin conexión: escribe los datos; la foto se adjuntará igual", systemImage: "wifi.slash")
                .foregroundStyle(.secondary)
        }
        Button {
            camaraAbierta = true
        } label: {
            Label(
                modelo.foto == nil ? (CameraPicker.hayCamara ? "Tomar foto" : "Elegir foto") : "Cambiar foto",
                systemImage: "camera")
        }
        if modelo.foto != nil {
            Button("Quitar foto", role: .destructive) { modelo.quitarFoto() }
        }
    }
}
