import Foundation
import FirebaseFirestore

/// Mirrors functions/src/custody.ts — the five protocol states plus CANCELLED.
enum CustodyState: String, Codable, CaseIterable {
    case CREATED, DEPOSITED, COLLECTED, ARRIVED, DELIVERED, CANCELLED

    var label: String {
        switch self {
        case .CREATED: "Waiting for drop-off"
        case .DEPOSITED: "At origin shop"
        case .COLLECTED: "Travelling"
        case .ARRIVED: "Ready for collection"
        case .DELIVERED: "Delivered"
        case .CANCELLED: "Cancelled"
        }
    }

    var systemImage: String {
        switch self {
        case .CREATED: "qrcode"
        case .DEPOSITED: "shippingbox"
        case .COLLECTED: "tram"
        case .ARRIVED: "mappin.and.ellipse"
        case .DELIVERED: "checkmark.seal.fill"
        case .CANCELLED: "xmark.circle"
        }
    }
}

struct Shipment: Identifiable {
    let id: String
    let state: CustodyState
    let corridorId: String
    let sizeCategory: String
    let itemCategory: String
    let declaredValueGbp: Double
    let createdAt: Date
    let co2eAvoidedKg: Double?
    let paid: Bool
    let recipientName: String?
    let trackToken: String?

    var trackURL: URL? {
        trackToken.flatMap { URL(string: "https://pbuddy-uk.web.app/track.html?t=\($0)") }
    }

    init?(doc: DocumentSnapshot) {
        guard let data = doc.data(),
              let stateRaw = data["state"] as? String,
              let state = CustodyState(rawValue: stateRaw) else { return nil }
        self.id = doc.documentID
        self.state = state
        self.corridorId = data["corridorId"] as? String ?? ""
        self.sizeCategory = data["sizeCategory"] as? String ?? ""
        self.itemCategory = data["itemCategory"] as? String ?? ""
        self.declaredValueGbp = data["declaredValueGbp"] as? Double ?? 0
        self.createdAt = (data["createdAt"] as? Timestamp)?.dateValue() ?? .distantPast
        self.co2eAvoidedKg = data["co2eAvoidedKg"] as? Double
        self.paid = data["paid"] as? Bool ?? false
        self.recipientName = data["recipientName"] as? String
        self.trackToken = data["trackToken"] as? String
    }
}

struct Corridor {
    let paymentLink: String?
    let priceGbp: Double?
    let requirePayment: Bool
}

/// A selectable corridor for creating a shipment.
struct CorridorOption: Identifiable {
    let id: String        // e.g. "lon-mcr"
    let name: String      // "London ↔ Manchester"
    let priceGbp: Double

    /// "LON → MCR" from the id.
    var routeLabel: String {
        let parts = id.split(separator: "-").map { $0.uppercased() }
        return parts.count > 1 ? "\(parts[0]) → \(parts[1])" : id.uppercased()
    }
}

/// Deposit code returned by createShipment — kept on-device only (the server
/// stores only its hash).
struct IssuedCode: Codable {
    let shipmentId: String
    let code: String
    let expiresAt: Date
}
