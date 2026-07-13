import Foundation
import FirebaseAuth
import FirebaseFirestore
import FirebaseFunctions

@MainActor
final class ShipmentStore: ObservableObject {
    @Published var shipments: [Shipment] = []      // I am the sender
    @Published var carried: [Shipment] = []        // I am the traveller
    @Published var identityVerified = false
    @Published var identityStatus: String?         // nil | pending | requires_input | verified
    @Published var hasPayouts = false
    @Published var corridors: [CorridorOption] = []
    @Published var errorMessage: String?

    private let db = Firestore.firestore()
    private let functions = Functions.functions(region: "europe-west2")
    private var listeners: [ListenerRegistration] = []

    func start() {
        guard let uid = Auth.auth().currentUser?.uid, listeners.isEmpty else { return }
        // Sorted client-side to avoid composite indexes at this stage.
        listeners.append(
            db.collection("shipments")
                .whereField("senderUid", isEqualTo: uid)
                .addSnapshotListener { [weak self] snap, err in
                    guard let self else { return }
                    if let err { self.errorMessage = err.localizedDescription; return }
                    self.shipments = (snap?.documents ?? [])
                        .compactMap(Shipment.init)
                        .sorted { $0.createdAt > $1.createdAt }
                }
        )
        listeners.append(
            db.document("users/\(uid)").addSnapshotListener { [weak self] snap, _ in
                self?.identityVerified = snap?.get("identityVerified") as? Bool ?? false
                self?.identityStatus = snap?.get("identityStatus") as? String
                self?.hasPayouts = snap?.get("stripeAccountId") != nil
            }
        )
        listeners.append(
            db.collection("shipments")
                .whereField("travellerUid", isEqualTo: uid)
                .addSnapshotListener { [weak self] snap, err in
                    guard let self else { return }
                    if let err { self.errorMessage = err.localizedDescription; return }
                    self.carried = (snap?.documents ?? [])
                        .compactMap(Shipment.init)
                        .sorted { $0.createdAt > $1.createdAt }
                }
        )
    }

    /// Tear down on sign-out so a new user starts clean.
    func stop() {
        listeners.forEach { $0.remove() }
        listeners = []
        shipments = []; carried = []
        identityVerified = false; identityStatus = nil; hasPayouts = false
    }

    /// Collection + drop codes issued to me as traveller (see functions:
    /// shipments/{id}/private/travellerCodes, readable only by travellerUid).
    func travellerCodes(shipmentId: String) async -> (collection: String, drop: String)? {
        let doc = try? await db.document("shipments/\(shipmentId)/private/travellerCodes").getDocument()
        guard let data = doc?.data(),
              let c = data["collectionCode"] as? String,
              let d = data["dropCode"] as? String else { return nil }
        return (c, d)
    }

    func createShipment(corridorId: String, sizeCategory: String, itemCategory: String,
                        declaredValueGbp: Double, recipientName: String, recipientPhone: String) async throws -> IssuedCode {
        var payload: [String: Any] = [
            "corridorId": corridorId,
            "sizeCategory": sizeCategory,
            "itemCategory": itemCategory,
            "declaredValueGbp": declaredValueGbp,
        ]
        if !recipientName.isEmpty { payload["recipientName"] = recipientName }
        if !recipientPhone.isEmpty { payload["recipientPhone"] = recipientPhone }

        let result = try await functions.httpsCallable("createShipment").call(payload)
        guard let data = result.data as? [String: Any],
              let shipmentId = data["shipmentId"] as? String,
              let code = data["depositCode"] as? String,
              let expiresRaw = data["expiresAt"] as? String,
              let expiresAt = ISO8601DateFormatter.withFractional.date(from: expiresRaw)
        else { throw URLError(.badServerResponse) }

        let issued = IssuedCode(shipmentId: shipmentId, code: code, expiresAt: expiresAt)
        CodeVault.save(issued)
        return issued
    }

    /// Load selectable corridors (active only), cheapest first.
    func loadCorridors() async {
        guard let snap = try? await db.collection("corridors").whereField("active", isEqualTo: true).getDocuments() else { return }
        corridors = snap.documents.compactMap { d in
            guard let name = d.get("name") as? String, let price = d.get("priceGbp") as? Double else { return nil }
            return CorridorOption(id: d.documentID, name: name, priceGbp: price)
        }.sorted { $0.priceGbp < $1.priceGbp }
    }

    func corridor(id: String) async -> Corridor? {
        guard let data = (try? await db.document("corridors/\(id)").getDocument())?.data() else { return nil }
        return Corridor(
            paymentLink: data["paymentLink"] as? String,
            priceGbp: data["priceGbp"] as? Double,
            requirePayment: data["requirePayment"] as? Bool ?? false
        )
    }

    /// Stripe Identity hosted document verification — the trust layer.
    func identityVerificationURL() async throws -> URL {
        let result = try await functions.httpsCallable("createIdentityVerification").call([:])
        guard let data = result.data as? [String: Any],
              let raw = data["url"] as? String,
              let url = URL(string: raw) else { throw URLError(.badServerResponse) }
        return url
    }

    /// Stripe Express onboarding link — travellers set up payouts once.
    func payoutOnboardingURL() async throws -> URL {
        let result = try await functions.httpsCallable("createConnectOnboarding").call([:])
        guard let data = result.data as? [String: Any],
              let raw = data["url"] as? String,
              let url = URL(string: raw) else { throw URLError(.badServerResponse) }
        return url
    }

    /// Server-priced Stripe Checkout — returns the hosted payment URL.
    func checkoutURL(shipmentId: String) async throws -> URL {
        let result = try await functions.httpsCallable("createCheckoutSession").call(["shipmentId": shipmentId])
        guard let data = result.data as? [String: Any],
              let raw = data["url"] as? String,
              let url = URL(string: raw) else { throw URLError(.badServerResponse) }
        return url
    }

    func cancelShipment(id: String) async throws {
        _ = try await functions.httpsCallable("cancelShipment").call(["shipmentId": id])
    }
}

/// On-device storage for plaintext codes (server keeps only hashes).
/// Keychain-backed: codes are credentials, not preferences. Migrates any
/// legacy UserDefaults entries transparently on first read.
enum CodeVault {
    private static let service = "com.pbuddy.codes"

    static func save(_ code: IssuedCode) {
        guard let data = try? JSONEncoder.iso.encode(code) else { return }
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: code.shipmentId,
        ]
        let attrs: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        if SecItemUpdate(query as CFDictionary, attrs as CFDictionary) == errSecItemNotFound {
            SecItemAdd(query.merging(attrs) { a, _ in a } as CFDictionary, nil)
        }
    }

    static func load(shipmentId: String) -> IssuedCode? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: shipmentId,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        if SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
           let data = item as? Data,
           let code = try? JSONDecoder.iso.decode(IssuedCode.self, from: data) {
            return code
        }
        // Legacy migration: UserDefaults -> Keychain, then scrub.
        let legacyKey = "code.\(shipmentId)"
        if let data = UserDefaults.standard.data(forKey: legacyKey),
           let code = try? JSONDecoder.iso.decode(IssuedCode.self, from: data) {
            save(code)
            UserDefaults.standard.removeObject(forKey: legacyKey)
            return code
        }
        return nil
    }
}

extension ISO8601DateFormatter {
    static let withFractional: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
}
extension JSONEncoder {
    static let iso: JSONEncoder = { let e = JSONEncoder(); e.dateEncodingStrategy = .iso8601; return e }()
}
extension JSONDecoder {
    static let iso: JSONDecoder = { let d = JSONDecoder(); d.dateDecodingStrategy = .iso8601; return d }()
}
