import SwiftUI
import FirebaseCore
import FirebaseAuth

/// Auth state as an observable — the listener drives sign-in/out UI.
/// Constructed as a @StateObject, i.e. after the AppDelegate has run
/// didFinishLaunching and configured Firebase — so Auth.auth() is safe here.
final class AuthModel: ObservableObject {
    @Published var uid: String?
    init() {
        // Read the persisted session synchronously — otherwise the first
        // frame renders the sign-in screen and flashes before the async
        // listener restores the user.
        uid = Auth.auth().currentUser?.uid
        Auth.auth().addStateDidChangeListener { [weak self] _, user in
            if self?.uid != user?.uid { self?.uid = user?.uid }
        }
    }
}

@main
struct PbuddyApp: App {
    // FirebaseApp.configure() lives in AppDelegate.didFinishLaunching so it
    // runs before the APNs registration callback can touch Auth.
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var auth = AuthModel()
    @StateObject private var store = ShipmentStore()

    var body: some Scene {
        WindowGroup {
            Group {
                if auth.uid != nil {
                    MainTabs()
                        .environmentObject(store)
                        .task {
                            store.start()
                            PushManager.shared.start()
                        }
                } else {
                    PhoneSignInView()
                }
            }
            .tint(Brand.action)
            .onChange(of: auth.uid) { _, uid in
                if uid == nil { store.stop() }
            }
        }
    }
}
