import SwiftUI
import SafariServices

/// In-app browser sheet — payment stays inside pbuddy instead of bouncing
/// to Safari. (Native PaymentSheet arrives with the publishable key.)
struct SafariView: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> SFSafariViewController {
        let vc = SFSafariViewController(url: url)
        vc.dismissButtonStyle = .close
        return vc
    }

    func updateUIViewController(_ vc: SFSafariViewController, context: Context) {}
}
