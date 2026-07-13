import SwiftUI
import FirebaseAuth

/// Phone-number sign-in — the first layer of the trust stack (PRODUCT.md):
/// every sender and traveller is a verified phone number, not an anonymous
/// session. Real SMS to UK (+44) and Pakistan (+92) numbers — so Muniba can
/// use the app from Lahore during the build phase.
///
/// Full-bleed branded front door: navy hero over a light entry sheet.
struct PhoneSignInView: View {
    @State private var phone = "+44"
    @State private var code = ""
    @State private var verificationID: String?
    @State private var busy = false
    @State private var error: String?
    @FocusState private var focused: Bool

    var body: some View {
        ZStack {
            Brand.ink.ignoresSafeArea()
            VStack(spacing: 0) {
                Spacer()
                brand
                Spacer()
                entryCard
            }
        }
    }

    private var brand: some View {
        VStack(spacing: 14) {
            Image(systemName: "shippingbox.fill")
                .font(.system(size: 52, weight: .medium))
                .foregroundStyle(.white)
                .overlay(alignment: .bottom) {
                    Image(systemName: "chevron.right.2")
                        .font(.system(size: 20, weight: .bold))
                        .foregroundStyle(Brand.signal)
                        .offset(y: 20)
                }
            Text("ParcelBuddy")
                .font(.largeTitle.bold())
                .tracking(-0.8)
                .foregroundStyle(.white)
            Text("Parcels that ride journeys\nalready happening.")
                .font(.subheadline)
                .multilineTextAlignment(.center)
                .foregroundStyle(.white.opacity(0.7))
        }
    }

    private var entryCard: some View {
        VStack(alignment: .leading, spacing: 16) {
            if verificationID == nil {
                Text("Enter your mobile number")
                    .font(.headline)
                TextField("+44 7…", text: $phone)
                    .keyboardType(.phonePad)
                    .textContentType(.telephoneNumber)
                    .font(.title3.monospaced())
                    .focused($focused)
                    .padding()
                    .background(Color(.systemGray6), in: RoundedRectangle(cornerRadius: 12))
                primaryButton(busy ? "Sending…" : "Send code", enabled: !busy && phone.count >= 10) {
                    await sendCode()
                }
                Text("We verify every sender and traveller — it's how parcels stay safe. UK & Pakistan numbers.")
                    .font(.caption).foregroundStyle(.secondary)
            } else {
                Text("Enter the 6-digit code")
                    .font(.headline)
                TextField("123456", text: $code)
                    .keyboardType(.numberPad)
                    .textContentType(.oneTimeCode)
                    .font(.system(.largeTitle, design: .monospaced).weight(.semibold))
                    .kerning(6)
                    .multilineTextAlignment(.center)
                    .focused($focused)
                    .padding()
                    .background(Color(.systemGray6), in: RoundedRectangle(cornerRadius: 12))
                primaryButton(busy ? "Verifying…" : "Verify", enabled: !busy && code.count == 6) {
                    await verify()
                }
                Button("Use a different number") { verificationID = nil; code = ""; error = nil }
                    .font(.subheadline).foregroundStyle(Brand.ink)
                    .frame(maxWidth: .infinity)
            }
            if let error {
                Text(error).foregroundStyle(Color(red: 0.70, green: 0.15, blue: 0.12)).font(.footnote)
            }
        }
        .padding(24)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.systemBackground), in: UnevenRoundedRectangle(topLeadingRadius: 28, topTrailingRadius: 28))
        .onAppear { focused = true }
    }

    private func primaryButton(_ title: String, enabled: Bool, action: @escaping () async -> Void) -> some View {
        Button { Task { await action() } } label: {
            Text(title)
                .font(.headline)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 15)
                .background(enabled ? Brand.ink : Color(.systemGray4), in: RoundedRectangle(cornerRadius: 12))
                .foregroundStyle(.white)
        }
        .disabled(!enabled)
    }

    private func sendCode() async {
        busy = true; error = nil; defer { busy = false }
        // Real SMS via APNs silent push (key uploaded 2026-07-12).
        // Regions allowlisted server-side: UK + Pakistan.
        do {
            verificationID = try await PhoneAuthProvider.provider()
                .verifyPhoneNumber(phone.replacingOccurrences(of: " ", with: ""), uiDelegate: nil)
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func verify() async {
        busy = true; error = nil; defer { busy = false }
        guard let verificationID else { return }
        let credential = PhoneAuthProvider.provider()
            .credential(withVerificationID: verificationID, verificationCode: code)
        do {
            _ = try await Auth.auth().signIn(with: credential)
            // AuthModel's state listener flips the UI.
        } catch {
            self.error = error.localizedDescription
        }
    }
}
