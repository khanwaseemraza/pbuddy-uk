# Shop scan page

TypeScript on Firebase Hosting. One authenticated link per shop + PIN
(ADR 0002). Camera QR scan with manual 6-digit entry as a first-class path.
Calls the scanTransition callable function — no direct Firestore writes.
