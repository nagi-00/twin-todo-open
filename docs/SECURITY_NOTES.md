# Security Notes

## Current Dependency Audit

Root application dependencies currently audit clean.

Firebase Functions dependencies may report a moderate `uuid` advisory through the Firebase Admin / Google Cloud dependency tree. `npm audit fix` does not resolve it without a breaking downgrade of `firebase-admin`, so this should be tracked and rechecked when Firebase releases patched transitive dependencies.

Do not run `npm audit fix --force` blindly for this project because it can downgrade Firebase Admin and break Functions behavior.

## Browser Verification Note

The local app was verified with:

- `npm run lint`
- `npm run build`
- `npm --prefix functions run build`
- Vite dev server HTTP 200 at `http://127.0.0.1:5173`

In this Codex environment, the in-app browser plugin failed due a local `AppData` filesystem permission error, so screenshot-based verification could not be completed here.
