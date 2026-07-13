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
        let number = phone.replacingOccurrences(of: " ", with: "")
        // Validate before hitting Firebase — the backend's raw errors
        // ("TOO_SHORT", "Invalid format") are not for human eyes.
        if let validationError = Self.validate(number) {
            self.error = validationError
            return
        }
        await requestCode(number)
    }

    private func requestCode(_ number: String) async {
        // Real SMS via APNs silent push (key uploaded 2026-07-12).
        // Regions allowlisted server-side: UK + Pakistan.
        do {
            verificationID = try await PhoneAuthProvider.provider()
                .verifyPhoneNumber(number, uiDelegate: nil)
        } catch {
            self.error = Self.friendlyAuthMessage(error)
        }
    }

    /// Client-side sanity check. Returns a user-facing message, or nil if OK.
    static func validate(_ number: String) -> String? {
        guard number.hasPrefix("+") else {
            return "Please include the country code, e.g. +44 for UK or +92 for Pakistan."
        }
        let digits = number.dropFirst().filter(\.isNumber)
        guard digits.count == number.dropFirst().count else {
            return "That number contains invalid characters — digits only, please."
        }
        // UK mobiles: +44 + 10 digits; PK mobiles: +92 + 10 digits.
        guard digits.count >= 11 else {
            return "That number looks too short — a full mobile number is needed, e.g. +44 7911 123456."
        }
        guard digits.count <= 14 else {
            return "That number looks too long — please check and try again."
        }
        return nil
    }

    /// Map Firebase Auth errors to messages a person can act on.
    static func friendlyAuthMessage(_ error: Error) -> String {
        let code = AuthErrorCode(rawValue: (error as NSError).code)
        switch code {
        case .invalidPhoneNumber, .missingPhoneNumber:
            return "That doesn't look like a valid mobile number — please check and try again, e.g. +44 7911 123456."
        case .tooManyRequests:
            return "Too many attempts — please wait a few minutes and try again."
        case .quotaExceeded:
            return "We can't send more codes right now. Please try again shortly."
        case .networkError:
            return "No connection — check your internet and try again."
        default:
            return "Something went wrong sending your code. Please try again."
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
            let code = AuthErrorCode(rawValue: (error as NSError).code)
            switch code {
            case .invalidVerificationCode:
                self.error = "That code isn't right — please check the SMS and try again."
            case .sessionExpired:
                self.error = "That code has expired — tap \"Use a different number\" to get a new one."
            default:
                self.error = Self.friendlyAuthMessage(error)
            }
        }
    }
}
