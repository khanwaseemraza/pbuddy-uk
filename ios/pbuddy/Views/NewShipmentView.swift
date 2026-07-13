import SwiftUI

struct NewShipmentView: View {
    @EnvironmentObject private var store: ShipmentStore
    @Environment(\.dismiss) private var dismiss

    @State private var itemCategory = "clothing"
    @State private var sizeCategory = "small"
    @State private var declaredValue = 20.0
    @State private var recipientName = ""
    @State private var recipientPhone = ""
    @State private var corridorId = ""
    @State private var busy = false
    @State private var error: String?
    @State private var issued: IssuedCode?

    private let categories = ["clothing", "books", "electronics", "gifts", "documents-excluded", "other"]

    private var selectedPrice: Double {
        store.corridors.first { $0.id == corridorId }?.priceGbp ?? 0
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Route") {
                    if store.corridors.isEmpty {
                        Text("Loading routes…").foregroundStyle(.secondary)
                    } else {
                        Picker("Route", selection: $corridorId) {
                            ForEach(store.corridors) { c in
                                Text("\(c.routeLabel) · £\(String(format: "%.2f", c.priceGbp))").tag(c.id)
                            }
                        }
                    }
                }
                Section("What are you sending?") {
                    Picker("Category", selection: $itemCategory) {
                        ForEach(categories.filter { $0 != "documents-excluded" }, id: \.self) {
                            Text($0.capitalized)
                        }
                    }
                    Picker("Size", selection: $sizeCategory) {
                        Text("Small (shoebox)").tag("small")
                        Text("Medium (backpack)").tag("medium")
                    }
                    LabeledContent("Declared value") {
                        Stepper("£\(Int(declaredValue))", value: $declaredValue, in: 5...100, step: 5)
                    }
                }
                Section("Who's collecting it?") {
                    TextField("Recipient name", text: $recipientName)
                        .textContentType(.name)
                    TextField("Recipient mobile (optional)", text: $recipientPhone)
                        .keyboardType(.phonePad)
                        .textContentType(.telephoneNumber)
                    Text("They'll get a tracking link and their pickup code — no app needed.")
                        .font(.caption).foregroundStyle(.secondary)
                }
                Section {
                    Text("No letters or correspondence. Prohibited items are checked at the shop — parcels must be sealed in a ParcelBuddy bag at the counter.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                if let error {
                    Section { Text(error).foregroundStyle(.red) }
                }
                Button(busy ? "Creating…" : "Get drop-off code") {
                    Task { await create() }
                }
                .disabled(busy || corridorId.isEmpty)
            }
            .navigationTitle("New parcel")
            .toolbar { Button("Cancel") { dismiss() } }
            .task {
                await store.loadCorridors()
                if corridorId.isEmpty { corridorId = store.corridors.first?.id ?? "" }
            }
            .sheet(item: Binding(get: { issued }, set: { _ in issued = nil; dismiss() })) {
                DepositCodeView(issued: $0)
            }
        }
    }

    private func create() async {
        busy = true; defer { busy = false }
        do {
            issued = try await store.createShipment(
                corridorId: corridorId,
                sizeCategory: sizeCategory,
                itemCategory: itemCategory,
                declaredValueGbp: declaredValue,
                recipientName: recipientName.trimmingCharacters(in: .whitespaces),
                recipientPhone: recipientPhone.trimmingCharacters(in: .whitespaces)
            )
        } catch {
            self.error = error.localizedDescription
        }
    }
}

extension IssuedCode: Identifiable {
    var id: String { shipmentId }
}
