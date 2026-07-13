import SwiftUI

/// "LON → BHM" route chip derived from the corridor id.
struct RouteBadge: View {
    let corridorId: String

    var body: some View {
        let parts = corridorId.split(separator: "-").map { $0.uppercased() }
        HStack(spacing: 5) {
            Image(systemName: "tram.fill").font(.caption2)
            Text(parts.first ?? "•")
            Image(systemName: "arrow.right").font(.caption2)
            Text(parts.count > 1 ? parts[1] : "•")
        }
        .font(.caption.weight(.bold).monospaced())
        .padding(.horizontal, 8).padding(.vertical, 4)
        .background(Brand.coral.opacity(0.14), in: Capsule())
        .foregroundStyle(Brand.action)
    }
}

/// Five-segment custody progress bar.
struct ProgressTrack: View {
    let state: CustodyState
    private let steps: [CustodyState] = [.CREATED, .DEPOSITED, .COLLECTED, .ARRIVED, .DELIVERED]

    var body: some View {
        let current = steps.firstIndex(of: state) ?? -1
        HStack(spacing: 4) {
            ForEach(steps.indices, id: \.self) { i in
                Capsule()
                    .fill(i <= current ? (state == .DELIVERED ? Brand.eco : Brand.coral) : Color(.systemGray5))
                    .frame(height: 5)
            }
        }
    }
}

/// The parcel card — the platform's core visual unit.
struct ShipmentCard: View {
    let shipment: Shipment

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                RouteBadge(corridorId: shipment.corridorId)
                Spacer()
                if let co2 = shipment.co2eAvoidedKg {
                    Label("−\(Int(co2 * 1000))g CO₂e", systemImage: "leaf.fill")
                        .font(.caption2.weight(.semibold))
                        .padding(.horizontal, 7).padding(.vertical, 3)
                        .background(Brand.eco.opacity(0.12), in: Capsule())
                        .foregroundStyle(Brand.eco)
                } else if shipment.state == .CREATED && !shipment.paid {
                    Label("Payment due", systemImage: "creditcard.fill")
                        .font(.caption2.weight(.bold))
                        .padding(.horizontal, 9).padding(.vertical, 5)
                        .background(Brand.signal, in: Capsule())
                        .foregroundStyle(.white)
                }
            }
            HStack {
                Image(systemName: shipment.state.systemImage)
                    .font(.title3)
                    .foregroundStyle(shipment.state == .DELIVERED ? Brand.eco : Brand.action)
                    .frame(width: 30)
                VStack(alignment: .leading, spacing: 2) {
                    Text(shipment.itemCategory.capitalized).font(.headline)
                    Text(shipment.state.label).font(.subheadline).foregroundStyle(.secondary)
                }
                Spacer()
                Image(systemName: "chevron.right").font(.caption).foregroundStyle(.tertiary)
            }
            if shipment.state != .CANCELLED {
                ProgressTrack(state: shipment.state)
            }
        }
        .padding(14)
        .background(Color(.systemBackground), in: RoundedRectangle(cornerRadius: 16))
        .shadow(color: .black.opacity(0.05), radius: 4, y: 2)
    }
}

/// Impact stat tile.
struct StatCard: View {
    let value: String
    let label: String
    let symbol: String
    var color: Color = Brand.action

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Image(systemName: symbol).font(.callout).foregroundStyle(color)
            Text(value)
                .font(.system(.title, design: .default).bold().monospacedDigit())
                .tracking(-0.5)
            Text(label)
                .font(.caption.weight(.medium))
                .foregroundStyle(.secondary)
                .textCase(.uppercase)
                .kerning(0.4)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Color(.systemBackground), in: RoundedRectangle(cornerRadius: 16))
        .shadow(color: .black.opacity(0.05), radius: 4, y: 2)
    }
}

/// Section header in the platform voice.
struct SectionHeader: View {
    let title: String
    var body: some View {
        Text(title)
            .font(.title3.bold())
            .tracking(-0.3)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.top, 8)
    }
}
