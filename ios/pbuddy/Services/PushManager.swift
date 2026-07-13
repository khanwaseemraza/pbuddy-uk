import Foundation
import UIKit
import FirebaseAuth
import FirebaseCore
import FirebaseFirestore
import FirebaseMessaging
import UserNotifications

/// Wires APNs -> FCM -> Firestore: asks permission, registers, and keeps
/// users/{uid}.fcmToken current so Cloud Functions can notify custody events.
final class PushManager: NSObject, MessagingDelegate, UNUserNotificationCenterDelegate {
    static let shared = PushManager()

    func start() {
        Messaging.messaging().delegate = self
        UNUserNotificationCenter.current().delegate = self
        Task {
            let granted = try? await UNUserNotificationCenter.current()
                .requestAuthorization(options: [.alert, .badge, .sound])
            if granted == true {
                await MainActor.run { UIApplication.shared.registerForRemoteNotifications() }
            }
        }
    }

    func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        guard let fcmToken, let uid = Auth.auth().currentUser?.uid else { return }
        Firestore.firestore().document("users/\(uid)").setData(
            ["fcmToken": fcmToken, "updatedAt": FieldValue.serverTimestamp()],
            merge: true
        )
    }

    /// Show notifications while the app is foregrounded too.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .sound]
    }
}

/// Bridges APNs to both FCM and FirebaseAuth. Phone-number verification needs
/// the APNs token on Auth for silent-push verification; without it, Auth falls
/// back to a reCAPTCHA flow that crashes when no URL scheme is configured.
final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        // Configure Firebase HERE (not in the SwiftUI App.init) so it is
        // guaranteed to run before the APNs registration callback below can
        // touch Auth — a cached device token can fire didRegister almost
        // immediately, and Auth.auth() crashes if the default app isn't up.
        if FirebaseApp.app() == nil { FirebaseApp.configure() }
        // Register for silent push at launch (no user permission needed) so the
        // APNs token is available for phone-auth verification on the sign-in
        // screen — before the user has granted notification permission.
        application.registerForRemoteNotifications()
        return true
    }

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        NSLog("PBUDDY: APNs token received (%d bytes) — handing to Auth + FCM", deviceToken.count)
        #if DEBUG
        Auth.auth().setAPNSToken(deviceToken, type: .sandbox)
        #else
        Auth.auth().setAPNSToken(deviceToken, type: .prod)
        #endif
        Messaging.messaging().apnsToken = deviceToken
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        NSLog("PBUDDY: APNs registration FAILED: %@", error.localizedDescription)
    }

    /// Silent verification pushes for phone auth land here.
    func application(
        _ application: UIApplication,
        didReceiveRemoteNotification userInfo: [AnyHashable: Any],
        fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void
    ) {
        if Auth.auth().canHandleNotification(userInfo) {
            completionHandler(.noData)
            return
        }
        completionHandler(.newData)
    }

    /// reCAPTCHA callback URL (fallback path) — let Auth consume it.
    func application(_ app: UIApplication, open url: URL,
                     options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        Auth.auth().canHandle(url)
    }
}
