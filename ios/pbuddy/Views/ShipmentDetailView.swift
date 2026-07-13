import SwiftUI

struct ShipmentDetailView: View {
    @EnvironmentObject private var store: ShipmentStore
    let shipment: Shipment
    @State private var showCode = false
    @State private var error: String?
    @State private var corridor: Corridor?
    @State private var checkoutURL: URL?
    @State private var payBusy = false

    private let timeline: [CustodyState] = [.CREATED, .DEPOSITED, .COLLECTED, .ARRIVED, .DELIVERED]

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                summaryCard

                if shipment.state == .CREATED, corridor?.requirePayment == true, !shipment.paid {
                    payCard
                }

                journeyCard
                detailsCard

                if let co2 = shipment.co2eAvoidedKg {
                    HStack {
                        Label("\(Int(co2 * 1000))g CO₂e avoided vs a van delivery", systemImage: "leaf.fill")
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(Brand.eco)
                        Spacer()
                    }
                    .padding(14)
                    .background(Brand.eco.opacity(0.10), in: RoundedRectangle(cornerRadius: 16))
                }

                if let url = shipment.trackURL, shipment.state != .CANCELLED {
                    ShareLink(item: url) {
                        Label(shipment.recipientName.map { "Share tracking with \($0)" } ?? "Share tracking link",
                              systemImage: "square.and.arrow.up")
                            .font(.subheadline.weight(.medium))
                            .frame(maxWidth: .infinity).padding(.vertical, 12)
                            .background(Color(.systemBackground), in: RoundedRectangle(cornerRadius: 12))
                            .foregroundStyle(Brand.ink)
                    }
                }

                if shipment.state == .CREATED {
                    if CodeVault.load(shipmentId: shipment.id) != nil {
                        actionButton("Show drop-off code", "qrcode", filled: shipment.paid) { showCode = true }
                    }
                    Button(role: .destructive) {
                        Task {
                            do { try await store.cancelShipment(id: shipment.id) }
                            catch { self.error = error.localizedDescription }
                        }
                    } label: {
                        Text("Cancel parcel").font(.subheadline).frame(maxWidth: .infinity)
                    }
                    .padding(.top, 4)
                }

                if let error {
                    Text(error).foregroundStyle(Color(red: 0.70, green: 0.15, blue: 0.12)).font(.footnote)
                }
            }
            .padding(.horizontal)
            .padding(.bottom, 24)
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle("Parcel")
        .navigationBarTitleDisplayMode(.inline)
        .task { corridor = await store.corridor(id: shipment.corridorId) }
        .sheet(item: Binding(get: { checkoutURL.map(IdentifiedURL.init) }, set: { _ in checkoutURL = nil }), onDismiss: { checkoutURL = nil }) {
            SafariView(url: $0.url).ignoresSafeArea()
        }
        .sheet(isPresented: $showCode) {
            if let code = CodeVault.load(shipmentId: shipment.id) {
                DepositCodeView(issued: code)
            }
        }
    }

    private var summaryCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                RouteBadge(corridorId: shipment.corridorId)
                Spacer()
                Text(shipment.state.label)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(shipment.state == .DELIVERED ? Brand.eco : Brand.signal)
            }
            Text(shipment.itemCategory.capitalized)
                .font(.title2.bold()).tracking(-0.4)
            if shipment.state != .CANCELLED {
                ProgressTrack(state: shipment.state)
            }
        }
        .padding(16)
        .background(Color(.systemBackground), in: RoundedRectangle(cornerRadius: 18))
    }

    private var payCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Payment due", systemImage: "creditcard.fill")
                .font(.headline).foregroundStyle(Brand.ink)
            Text("The shop can only accept your parcel once it's paid. Payment protection up to your declared value is included.")
                .font(.caption).foregroundStyle(.secondary)
            Button {
                Task {
                    payBusy = true; defer { payBusy = false }
                    do { checkoutURL = try await store.checkoutURL(shipmentId: shipment.id) }
                    catch { self.error = error.localizedDescription }
                }
            } label: {
                Text(payBusy ? "Opening…" : "Pay £\(String(format: "%.2f", corridor?.priceGbp ?? 0)) to send")
                    .font(.headline)
                    .frame(maxWidth: .infinity).padding(.vertical, 13)
                    .background(Brand.signal, in: RoundedRectangle(cornerRadius: 12))
                    .foregroundStyle(.white)
            }
            .disabled(payBusy)
        }
        .padding(16)
        .background(Color(.systemBackground), in: RoundedRectangle(cornerRadius: 18))
    }

    private var journeyCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Journey").font(.headline).padding(.bottom, 6)
            ForEach(Array(timeline.enumerated()), id: \.element) { i, step in
                HStack(spacing: 12) {
                    VStack(spacing: 0) {
                        Circle()
                            .fill(reached(step) ? (shipment.state == .DELIVERED ? Brand.eco : Brand.signal) : Color(.systemGray4))
                            .frame(width: 12, height: 12)
                        if i < timeline.count - 1 {
                            Rectangle()
                                .fill(reached(timeline[i + 1]) ? Brand.signal : Color(.systemGray5))
                                .frame(width: 2, height: 26)
                        }
                    }
                    VStack(alignment: .leading, spacing: 1) {
                        Text(step.label)
                            .font(.subheadline.weight(reached(step) ? .semibold : .regular))
                            .foregroundStyle(reached(step) ? .primary : .secondary)
                    }
                    Spacer()
                    if step == shipment.state && step != .DELIVERED {
                        Text("NOW").font(.caption2.weight(.bold)).kerning(0.5).foregroundStyle(Brand.signal)
                    }
                }
                .padding(.bottom, i < timeline.count - 1 ? 0 : 0)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.systemBackground), in: RoundedRectangle(cornerRadius: 18))
    }

    private var detailsCard: some View {
        VStack(spacing: 10) {
            detailRow("Item", shipment.itemCategory.capitalized)
            Divider()
            detailRow("Size", shipment.sizeCategory.capitalized)
            Divider()
            detailRow("Declared value", "£\(Int(shipment.declaredValueGbp))")
            if shipment.paid {
                Divider()
                detailRow("Payment", "Protected up to £\(Int(shipment.declaredValueGbp))", valueColor: Brand.eco)
            }
        }
        .padding(16)
        .background(Color(.systemBackground), in: RoundedRectangle(cornerRadius: 18))
    }

    private func detailRow(_ label: String, _ value: String, valueColor: Color = .primary) -> some View {
        HStack {
            Text(label).font(.subheadline).foregroundStyle(.secondary)
            Spacer()
            Text(value).font(.subheadline.weight(.medium)).foregroundStyle(valueColor)
        }
    }

    private func actionButton(_ title: String, _ symbol: String, filled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(title, systemImage: symbol)
                .font(.headline)
                .frame(maxWidth: .infinity).padding(.vertical, 13)
                .background(filled ? Brand.ink : Color(.systemBackground), in: RoundedRectangle(cornerRadius: 12))
                .foregroundStyle(filled ? .white : Brand.ink)
        }
    }

    private struct IdentifiedURL: Identifiable {
        let url: URL
        var id: String { url.absoluteString }
    }

    private func reached(_ step: CustodyState) -> Bool {
        guard let current = timeline.firstIndex(of: shipment.state),
              let idx = timeline.firstIndex(of: step) else { return false }
        return idx <= current
    }
}
