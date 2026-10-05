import SwiftUI

struct ContentView: View {
    var body: some View {
        VStack(spacing: 12) {
            Text("Coco").font(.largeTitle.bold())
            Text("Arrancando…").foregroundStyle(.secondary)
        }
        .padding()
    }
}

#Preview {
    ContentView()
}
