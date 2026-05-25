# TwinTodo Open

TwinTodo Open is the secure public rebuild of the original TwinTodo experience.

The goal is to preserve the existing TwinTodo UI, mood, and daily workflow while rebuilding authentication, authorization, data access, and deployment security for a public multi-user service.

## Product Model

- Users can use the app alone without a pair.
- Users can optionally connect with another user through a nickname-based request and approval flow.
- Solo data lives under the authenticated user's own scope.
- Shared twin data lives under an approved pair scope.
- Google login is the default authentication path.

## Security Direction

- No custom password login.
- No plaintext password storage.
- No localStorage authentication session.
- No direct partnerId linking.
- Sensitive operations go through server-side functions.
- Firestore and Storage Rules default to deny.

## Initial Documents

- `docs/SECURE_REBUILD_FROM_EXISTING_UI.md`
- `docs/SECURITY_IMPLEMENTATION_SPEC.md`
- `firestore.rules`
- `storage.rules`
- `firebase.json`
