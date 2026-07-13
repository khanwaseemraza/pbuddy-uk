import SwiftUI
import FirebaseAuth

struct AccountView: View {
    @EnvironmentObject private var store: ShipmentStore
    @State private var sheetURL: URL?
    @State private var busy = false

    private var carriedDelivered: Int { store.carried.filter { $0.state == .DELIVERED }.count }
    private var earnedGbp: Double { Double(carriedDelivered) * 2.20 }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack(spacing: 14) {
                        Image(systemName: "person.crop.circle.fill")
                            .font(.system(size: 44))
                            .foregroundStyle(Brand.ink)
                        VStack(alignment: .leading) {
                            Text(Auth.auth().currentUser?.phoneNumber ?? "Signed in")
                                .font(.headline)
                            if store.identityVerified {
                                Label("Verified", systemImage: "checkmark.seal.fill")
                                    .font(.caption).foregroundStyle(Brand.eco)
                            }
                        }
                    }
                }

                Section("Trust & payments") {
                    row(
                        done: store.identityVerified,
                        doneText: "Identity verified",
                        todoText: "Verify your identity",
                        symbol: "person.badge.shield.checkmark"
                    ) {
                        await open { try await store.identityVerificationURL() }
                    }
                    row(
                        done: store.hasPayouts,
                        doneText: "Payouts set up",
                        todoText: "Set up payouts",
                        symbol: "sterlingsign.circle"
                    ) {
                        await open { try await store.payoutOnboardingURL() }
                    }
                }

                Section("Your impact") {
                    LabeledContent("Parcels sent") {
                        Text("\(store.shipments.filter { $0.state == .DELIVERED }.count)")
                    }
                    LabeledContent("Parcels carried") { Text("\(carriedDelivered)") }
                    if earnedGbp > 0 {
                        LabeledContent("Earned carrying") { Text("£\(String(format: "%.2f", earnedGbp))") }
                    }
                }

                Section {
                    Button("Sign out", role: .destructive) {
                        try? Auth.auth().signOut()
                    }
                } footer: {
                    Text("ParcelBuddy · parcels that ride journeys already happening.\nPayment protection included on every parcel.")
                }
            }
            .navigationTitle("Account")
            .sheet(item: Binding(get: { sheetURL.map(U.init) }, set: { _ in sheetURL = nil }), onDismiss: { sheetURL = nil }) {
                SafariView(url: $0.url).ignoresSafeArea()
            }
            .onAppear { sheetURL = nil }
        }
    }

    @ViewBuilder
    private func row(done: Bool, doneText: String, todoText: String, symbol: String,
                     action: @escaping () async -> Void) -> some View {
        if done {
            Label(doneText, systemImage: "checkmark.circle.fill").foregroundStyle(Brand.eco)
        } else {
            Button { Task { await action() } } label: {
                Label(todoText, systemImage: symbol)
            }
            .disabled(busy)
        }
    }

    private func open(_ make: @escaping () async throws -> URL) async {
        busy = true; defer { busy = false }
        sheetURL = try? await make()
    }

    private struct U: Identifiable {
        let url: URL
        var id: String { url.absoluteString }
    }
}
