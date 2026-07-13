import SwiftUI

/// Traveller side: parcels assigned to me, codes wallet, earnings.
/// v0.1 matching is ops-manual — the jobs marketplace arrives post-pilot.
struct CarryView: View {
    @EnvironmentObject private var store: ShipmentStore

    private var delivered: Int { store.carried.filter { $0.state == .DELIVERED }.count }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 14) {
                    if !store.identityVerified { VerifyBanner() }

                    HStack(spacing: 12) {
                        StatCard(value: "\(delivered)", label: "parcels carried", symbol: "tram.fill")
                        StatCard(value: "£\(String(format: "%.2f", Double(delivered) * 2.20))",
                                 label: "earned", symbol: "sterlingsign.circle.fill", color: Brand.eco)
                    }

                    if !store.hasPayouts {
                        payoutPrompt
                    }

                    if store.carried.isEmpty {
                        emptyState
                    } else {
                        SectionHeader(title: "Your parcels")
                        ForEach(store.carried) { shipment in
                            NavigationLink(value: shipment.id) { ShipmentCard(shipment: shipment) }
                                .buttonStyle(.plain)
                        }
                    }
                }
                .padding(.horizontal)
                .padding(.bottom, 24)
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Carry")
            .navigationDestination(for: String.self) { id in
                if let shipment = store.carried.first(where: { $0.id == id }) {
                    CarryDetailView(shipment: shipment)
                }
            }
        }
    }

    @State private var payoutURL: URL?
    @State private var payoutBusy = false

    private var payoutPrompt: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Get paid for carrying", systemImage: "sterlingsign.circle")
                .font(.subheadline.weight(.semibold))
            Text("£2.20 per parcel, paid automatically on delivery. One-time setup with Stripe.")
                .font(.caption).foregroundStyle(.secondary)
            Button {
                Task {
                    payoutBusy = true; defer { payoutBusy = false }
                    payoutURL = try? await store.payoutOnboardingURL()
                }
            } label: {
                Text(payoutBusy ? "Opening…" : "Set up payouts")
                    .font(.subheadline.weight(.semibold))
                    .padding(.horizontal, 14).padding(.vertical, 8)
                    .background(Brand.action, in: Capsule())
                    .foregroundStyle(.white)
            }
            .disabled(payoutBusy)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.systemBackground), in: RoundedRectangle(cornerRadius: 16))
        .onAppear { payoutURL = nil }
        .sheet(item: Binding(get: { payoutURL.map(P.init) }, set: { _ in payoutURL = nil }), onDismiss: { payoutURL = nil }) {
            SafariView(url: $0.url).ignoresSafeArea()
        }
    }

    private var emptyState: some View {
        VStack(spacing: 8) {
            Image(systemName: "tram.fill").font(.system(size: 40)).foregroundStyle(Brand.coral)
            Text("Nothing to carry yet").font(.headline)
            Text("Already making a journey? When a parcel matches your route it appears here with your pickup codes.")
                .font(.caption).foregroundStyle(.secondary).multilineTextAlignment(.center)
        }
        .padding(.vertical, 40)
    }

    private struct P: Identifiable {
        let url: URL
        var id: String { url.absoluteString }
    }
}

struct CarryDetailView: View {
    @EnvironmentObject private var store: ShipmentStore
    let shipment: Shipment
    @State private var codes: (collection: String, drop: String)?
    @State private var showing: CarryCode?

    var body: some View {
        List {
            Section("Your job") {
                LabeledContent("Route") { RouteBadge(corridorId: shipment.corridorId) }
                LabeledContent("Item", value: shipment.itemCategory.capitalized)
                LabeledContent("Size", value: shipment.sizeCategory.capitalized)
                LabeledContent("Status", value: shipment.state.label)
                LabeledContent("You earn", value: "£2.20 on delivery")
            }

            Section("Your codes") {
                switch shipment.state {
                case .DEPOSITED:
                    Button("Show collection code (origin shop)", systemImage: "qrcode") {
                        if let codes { showing = CarryCode(kind: "collection", code: codes.collection) }
                    }
                    .disabled(codes == nil)
                case .COLLECTED:
                    Button("Show drop-off code (destination shop)", systemImage: "qrcode") {
                        if let codes { showing = CarryCode(kind: "drop", code: codes.drop) }
                    }
                    .disabled(codes == nil)
                case .ARRIVED, .DELIVERED:
                    Label("Done — parcel handed over. Thank you!", systemImage: "checkmark.seal")
                        .foregroundStyle(Brand.eco)
                default:
                    Text("Codes appear once the parcel is at the origin shop.")
                        .foregroundStyle(.secondary)
                }
            }

            Section {
                Text("Keep the parcel sealed. Hand it only to the shop counter — never to individuals.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
        }
        .navigationTitle("Carry")
        .task { codes = await store.travellerCodes(shipmentId: shipment.id) }
        .sheet(item: $showing) { item in
            CodeSheetView(
                title: item.kind == "collection"
                    ? "Show at the origin shop"
                    : "Show at the destination shop",
                shipmentId: shipment.id,
                code: item.code,
                purpose: item.kind,
                corridorId: shipment.corridorId,
                footnote: "The shopkeeper scans or types this to transfer custody."
            )
        }
    }
}

private struct CarryCode: Identifiable {
    let kind: String
    let code: String
    var id: String { kind }
}
