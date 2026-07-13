import SwiftUI

/// Identity-verification card, shown until the user is verified.
struct VerifyBanner: View {
    @EnvironmentObject private var store: ShipmentStore
    @State private var url: URL?
    @State private var busy = false

    var body: some View {
        if !store.identityVerified {
            VStack(alignment: .leading, spacing: 10) {
                Label(
                    store.identityStatus == "pending" ? "Finish your identity check"
                    : store.identityStatus == "requires_input" ? "Retry your identity check"
                    : "Verify your identity",
                    systemImage: "person.badge.shield.checkmark"
                )
                .font(.subheadline.weight(.semibold))
                Text("A one-time document check keeps every handoff between verified people. We never store your documents.")
                    .font(.caption).foregroundStyle(.secondary)
                Button {
                    Task {
                        busy = true; defer { busy = false }
                        url = try? await store.identityVerificationURL()
                    }
                } label: {
                    Text(busy ? "Opening…" : "Verify now")
                        .font(.subheadline.weight(.semibold))
                        .padding(.horizontal, 14).padding(.vertical, 8)
                        .background(Brand.action, in: Capsule())
                        .foregroundStyle(.white)
                }
                .disabled(busy)
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Brand.coral.opacity(0.10), in: RoundedRectangle(cornerRadius: 16))
            .onAppear { url = nil }
            .sheet(item: Binding(get: { url.map(V.init) }, set: { _ in url = nil }), onDismiss: { url = nil }) {
                SafariView(url: $0.url).ignoresSafeArea()
            }
        }
    }

    private struct V: Identifiable {
        let url: URL
        var id: String { url.absoluteString }
    }
}
