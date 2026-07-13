import SwiftUI
import CoreImage.CIFilterBuiltins

/// The handoff code as a boarding pass — ParcelBuddy's signature counter
/// moment. Navy header (route + step), white body (QR + digits), a
/// perforation between them. QR payload matches the shop page parser:
/// {"shipmentId":"...","code":"123456","purpose":"..."}
struct CodeSheetView: View {
    let title: String
    let shipmentId: String
    let code: String
    let purpose: String
    var corridorId: String = "lon-bhm"
    var footnote: String? = nil

    var body: some View {
        VStack(spacing: 0) {
            header
            perforation
            body(in: .white)
        }
        .padding(20)
        .presentationDetents([.medium, .large])
        .presentationBackground(Color(.systemGroupedBackground))
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("PARCELBUDDY")
                .font(.caption2.weight(.bold)).kerning(2)
                .foregroundStyle(.white.opacity(0.6))
            HStack {
                routeText
                Spacer()
                Image(systemName: "shippingbox.fill").foregroundStyle(Brand.signal)
            }
            Text(title.uppercased())
                .font(.caption.weight(.semibold)).kerning(0.5)
                .foregroundStyle(.white.opacity(0.85))
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Brand.ink)
        .clipShape(UnevenRoundedRectangle(topLeadingRadius: 20, topTrailingRadius: 20))
    }

    private var routeText: some View {
        let parts = corridorId.split(separator: "-").map { $0.uppercased() }
        return HStack(spacing: 8) {
            Text(parts.first ?? "•")
            Image(systemName: "arrow.right").font(.callout)
            Text(parts.count > 1 ? parts[1] : "•")
        }
        .font(.title2.bold().monospaced())
        .foregroundStyle(.white)
    }

    /// Notched perforation line — the boarding-pass tear.
    private var perforation: some View {
        ZStack {
            Rectangle().fill(Brand.ink).frame(height: 28)
            HStack {
                Circle().fill(Color(.systemGroupedBackground)).frame(width: 28, height: 28).offset(x: -14)
                Spacer()
                Circle().fill(Color(.systemGroupedBackground)).frame(width: 28, height: 28).offset(x: 14)
            }
            Line().stroke(style: StrokeStyle(lineWidth: 2, dash: [6, 5]))
                .foregroundStyle(.white.opacity(0.35)).frame(height: 1).padding(.horizontal, 22)
        }
    }

    private func body(in bg: Color) -> some View {
        VStack(spacing: 18) {
            if let qr = qrImage {
                Image(uiImage: qr)
                    .interpolation(.none).resizable().scaledToFit()
                    .frame(maxWidth: 220)
                    .padding(8)
            }
            VStack(spacing: 4) {
                Text("HANDOFF CODE").font(.caption2.weight(.semibold)).kerning(1.5).foregroundStyle(.secondary)
                Text(code)
                    .font(.system(size: 46, weight: .bold, design: .monospaced))
                    .kerning(8)
                    .foregroundStyle(Brand.ink)
            }
            if let footnote {
                Text(footnote)
                    .font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center)
            }
        }
        .padding(24)
        .frame(maxWidth: .infinity)
        .background(bg)
        .clipShape(UnevenRoundedRectangle(bottomLeadingRadius: 20, bottomTrailingRadius: 20))
    }

    private var qrImage: UIImage? {
        let payload = ["shipmentId": shipmentId, "code": code, "purpose": purpose]
        guard let data = try? JSONSerialization.data(withJSONObject: payload) else { return nil }
        let filter = CIFilter.qrCodeGenerator()
        filter.setValue(data, forKey: "inputMessage")
        guard let output = filter.outputImage?.transformed(by: .init(scaleX: 8, y: 8)),
              let cg = CIContext().createCGImage(output, from: output.extent) else { return nil }
        return UIImage(cgImage: cg)
    }
}

private struct Line: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: rect.minX, y: rect.midY))
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
        return p
    }
}
