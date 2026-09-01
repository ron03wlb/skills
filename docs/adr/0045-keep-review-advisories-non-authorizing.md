---
status: accepted
---

# Keep review advisories non-authorizing

A fresh review may report a **Code review advisory**, but only exact repository or Spec evidence verified by the Coordinator can promote it to a **Confirmed code review finding** and block the gate. We do not persist advisory dismissals, tracker waivers, Git-note exceptions, or SHA allowlists: the current review keeps advisories visible without treating them as failures, while a later fresh review may still confirm a real violation from exact evidence.
