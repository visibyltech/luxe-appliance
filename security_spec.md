# Security Specification — Luxe Appliances

## 1. Data Invariants
1. **Identity Integrity**: Every customer-owned document (`users/{uid}`, `orders/{orderId}`, `savings_plans/{planId}`, `payments/{paymentRef}`, `bnpl_applications/{applicationId}`, `reviews/{reviewId}`) must bind `userId`/`uid` to `request.auth.uid` on creation and mark `userId` immutable on update.
2. **Zero Self-Assigned Privilege Escalation**: Customers can never write to `admins/{uid}` or add `role`/`isAdmin` shadow fields to `users/{uid}`. Only verified admins (`usitakatelvin@gmail.com` with `email_verified == true` or existing `admins/{uid}` documents) can manage admins, products, categories, brands, coupons, shipping zones, store settings, and order releases.
3. **Immutable Payment Ledger & Duplicate Prevention**: `payments/{paymentRef}` documents cannot be overwritten or deleted by customers. Duplicate payment references are rejected at both server verification and Firestore rule levels (`!exists(...)` implied by `allow update: if isAdmin()`).
4. **Financial & Release Integrity**: Customers cannot reduce `totalNgn`, alter `subtotalNgn`/`discountNgn` after order creation, mark `releaseApproved = true` on a Pay Small Small plan, or mark an unverified Credibly BNPL application as `approved`.
5. **PII Isolation**: Customer email, phone, and delivery addresses inside `users`, `orders`, `savings_plans`, and `bnpl_applications` are strictly readable only by the owning `userId` or verified admins. `allow list` rules explicitly evaluate `resource.data.userId == request.auth.uid || isAdmin()`.
6. **Temporal Integrity**: All `createdAt` and `updatedAt` timestamps on write must be validated against `request.time` (or strict server-time invariant).

## 2. The "Dirty Dozen" Payloads (Expected: PERMISSION_DENIED)
1. **Unauthenticated Order Write**: Unauthenticated request creating `/orders/ord_1`.
2. **Identity Spoofing on Order**: Authenticated User A creating `/orders/ord_2` with `userId: "user_B"`.
3. **Shadow Field Injection on Profile**: Authenticated User A creating `/users/user_A` with extra field `isAdmin: true`.
4. **Self-Admin Escalation**: Authenticated User A creating `/admins/user_A` to grant themselves admin privileges.
5. **Catalog Tampering by Customer**: Authenticated non-admin User A attempting to update `/products/prod_1` `priceNgn: 1`.
6. **Unauthorized Release Approval on Pay Small Small**: User A updating `/savings_plans/plan_1` with `releaseApproved: true`.
7. **Unauthorized Order Status Shortcut**: User A updating `/orders/ord_1` `orderStatus: "Delivered"`.
8. **BNPL Fake Approval Injection**: User A creating `/bnpl_applications/bnpl_1` with `status: "approved"`.
9. **Duplicate/Overwrite Payment Ledger**: User A updating an existing `/payments/REF_123` to inflate `amountNgn`.
10. **PII Cross-User Scrape**: Authenticated User A listing `/orders` without `where('userId', '==', uid)` or reading `/users/user_B`.
11. **Oversized ID Poisoning**: Creating `/products/` with a 300-character or invalid-character ID `prod$../../hack`.
12. **Unverified Email Write**: Creating a review or order when `request.auth.token.email_verified == false`.
