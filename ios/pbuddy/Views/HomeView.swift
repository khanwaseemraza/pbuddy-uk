import SwiftUI

struct MainTabs: View {
    var body: some View {
        TabView {
            HomeTab()
                .tabItem { Label("Home", systemImage: "house.fill") }
            CarryView()
                .tabItem { Label("Carry", systemImage: "tram.fill") }
            AccountView()
                .tabItem { Label("Account", systemImage: "person.crop.circle") }
        }
    }
}

struct HomeTab: View {
    @EnvironmentObject private var store: ShipmentStore
    @State private var showNew = false

    private var routeSummary: String {
        switch store.corridors.count {
        case 0: return "UK RAIL"
        case 1: return store.corridors[0].routeLabel
        default: return "\(store.corridors.count) ROUTES"
        }
    }
    private var priceSummary: String {
        guard let min = store.corridors.map(\.priceGbp).min() else { return "same day" }
        return "from £\(String(format: "%.2f", min)) · same day"
    }

    private var active: [Shipment] { store.shipments.filter { $0.state != .DELIVERED && $0.state != .CANCELLED } }
    private var past: [Shipment] { store.shipments.filter { $0.state == .DELIVERED || $0.state == .CANCELLED } }
    private var co2Saved: Double {
        (store.shipments + store.carried).reduce(0) { $0 + ($1.co2eAvoidedKg ?? 0) }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 14) {
                    hero

                    if !store.identityVerified { VerifyBanner() }

                    if co2Saved > 0 || !past.isEmpty {
                        HStack(spacing: 12) {
                            StatCard(value: "\(past.filter { $0.state == .DELIVERED }.count)",
                                     label: "parcels delivered", symbol: "shippingbox.fill")
                            StatCard(value: co2Saved >= 1 ? String(format: "%.1f kg", co2Saved) : "\(Int(co2Saved * 1000)) g",
                                     label: "CO₂e avoided", symbol: "leaf.fill", color: Brand.eco)
                        }
                    }

                    if !active.isEmpty {
                        SectionHeader(title: "Active parcels")
                        ForEach(active) { shipment in
                            NavigationLink(value: shipment.id) { ShipmentCard(shipment: shipment) }
                                .buttonStyle(.plain)
                        }
                    }

                    if !past.isEmpty {
                        SectionHeader(title: "History")
                        ForEach(past) { shipment in
                            NavigationLink(value: shipment.id) { ShipmentCard(shipment: shipment) }
                                .buttonStyle(.plain)
                        }
                    }

                    if store.shipments.isEmpty {
                        howItWorks
                    }
                }
                .padding(.horizontal)
                .padding(.bottom, 24)
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("ParcelBuddy")
            .navigationDestination(for: String.self) { id in
                if let shipment = store.shipments.first(where: { $0.id == id }) {
                    ShipmentDetailView(shipment: shipment)
                }
            }
            .sheet(isPresented: $showNew) { NewShipmentView() }
            .task { await store.loadCorridors() }
        }
    }

    private var hero: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Where's it going today?")
                .font(.title2.bold())
                .tracking(-0.4)
                .foregroundStyle(.white)
            HStack(spacing: 8) {
                Text(routeSummary)
                    .font(.caption.weight(.bold).monospaced())
                    .padding(.horizontal, 8).padding(.vertical, 4)
                    .background(.white.opacity(0.12), in: Capsule())
                Text(priceSummary)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.white.opacity(0.85))
            }
            .foregroundStyle(.white)
            Button {
                showNew = true
            } label: {
                Label("Send a parcel", systemImage: "plus")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(.white, in: RoundedRectangle(cornerRadius: 12))
                    .foregroundStyle(Brand.action)
            }
            Label("Zero-van delivery — rides journeys already happening", systemImage: "leaf.fill")
                .font(.caption2)
                .foregroundStyle(.white.opacity(0.75))
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            LinearGradient(colors: [Brand.inkLight, Brand.ink],
                           startPoint: .topLeading, endPoint: .bottomTrailing),
            in: RoundedRectangle(cornerRadius: 20)
        )
        .padding(.top, 4)
    }

    private var howItWorks: some View {
        VStack(spacing: 10) {
            SectionHeader(title: "How it works")
            ForEach(steps, id: \.0) { step in
                HStack(spacing: 12) {
                    Image(systemName: step.0)
                        .font(.title3)
                        .foregroundStyle(Brand.action)
                        .frame(width: 34)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(step.1).font(.subheadline.weight(.semibold))
                        Text(step.2).font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                }
                .padding(12)
                .background(Color(.systemBackground), in: RoundedRectangle(cornerRadius: 14))
            }
        }
    }

    private let steps: [(String, String, String)] = [
        ("qrcode", "Get your code", "Create a parcel, pay, and get a drop-off QR."),
        ("storefront.fill", "Drop at a local shop", "Sealed, photographed, and safe at the counter."),
        ("tram.fill", "A verified traveller carries it", "Someone already making the journey — zero extra emissions."),
        ("checkmark.seal.fill", "Collected at the other end", "Your recipient picks it up with their code."),
    ]
}
