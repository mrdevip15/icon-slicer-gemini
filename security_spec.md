# Security Specification - IconSlicer AI

## Data Invariants
1. An IconSet must belong to a valid authenticated user.
2. Users can only read their own IconSets (unless I want to make them public, but the PRD says "Asset packs" for the user). Let's stick to user-owned for now.
3. Users cannot modify or delete other users' IconSets.
4. Prompt history is private to the user.

## The "Dirty Dozen" Payloads (Red Team Test Cases)

1. **Identity Spoofing**: Attempt to create an `iconSet` with a different `ownerId`.
2. **Unauthorized Read**: Attempt to read another user's `iconSets`.
3. **Ghost Fields**: Attempt to add `isAdmin: true` to an `iconSet` payload.
4. **ID Poisoning**: Use a 1MB string as a document ID.
5. **PII Leak**: Attempt to list all users' profile data.
6. **Immutable Field Attack**: Try to change `createdAt` on an existing `iconSet`.
7. **Type Poisoning**: Sending `gridSize: { malicious: "object" }` instead of a string.
8. **Size Attack**: Sending a 2MB `prompt` string.
9. **Relational Sync Break**: Creating a history item for a user that isn't the authenticated user.
10. **Query Scraper**: Listing all `iconSets` without filtering by `ownerId`.
11. **Update Gap**: Modifying `imageUrl` without being the owner.
12. **Self-Promotion**: Authenticated user trying to create an entry in an `/admins/` collection (if it existed).

## Test Runner Plan
We will use `firestore.rules.test.ts` to verify these constraints.
