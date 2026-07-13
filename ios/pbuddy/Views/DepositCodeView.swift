import SwiftUI

/// Sender's drop-off code, shown after creating a shipment.
struct DepositCodeView: View {
    let issued: IssuedCode

    var body: some View {
        CodeSheetView(
            title: "Show this at the shop counter",
            shipmentId: issued.shipmentId,
            code: issued.code,
            purpose: "deposit",
            footnote: "Or the shopkeeper can type this code.\nValid until \(issued.expiresAt.formatted(date: .abbreviated, time: .shortened))."
        )
    }
}
