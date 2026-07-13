import SwiftUI

/// ADR 0008 — ParcelBuddy palette v2 (enterprise grade).
/// One dark anchor, one sparing signal accent, cool neutrals.
enum Brand {
    /// Primary anchor: buttons, tint, headings.
    static let ink = Color(red: 0.055, green: 0.106, blue: 0.173)       // #0E1B2C
    /// Gradient partner / pressed states.
    static let inkLight = Color(red: 0.118, green: 0.227, blue: 0.361)  // #1E3A5C
    /// Signal accent — routes, progress, highlights. Use sparingly.
    static let signal = Color(red: 0.910, green: 0.349, blue: 0.047)    // #E8590C
    /// Reserved for CO₂e / impact only.
    static let eco = Color(red: 0.039, green: 0.478, blue: 0.310)       // #0A7A4F

    // Back-compat aliases (views written against v1 names).
    static let action = ink
    static let coral = signal
}
