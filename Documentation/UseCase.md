# Rush Hour Parking System - Use Case

## Use Case Model

- **Registered Customer:** A customer who creates an account, logs in, manages saved vehicles, searches for parking, books spaces in advance, or reviews past booking records.
- **Guest Customer:** A customer who uses the system without setting up a permanent account, enabling them to carry out quick spot searches, make immediate reservations, or get conventional tickets by giving only a small amount of contact information (for example, their license plate number and either their email address or phone number for ticket delivery).
- **Facility Operator** (renamed from Facility Manager): An employee of a **specific facility** who oversees day-to-day operations, including manual check-in and check-out verification via QR code or license plate, placing spaces into maintenance mode, etc.
- **Facility Manager** (renamed from Facility Administrator): Admin of **one or multiple facilities**, such as owners of commercial units or car park managers; beyond their inherited Operator permissions for their facilities, they monitor occupancy analytics, adjust hourly and reservation prices, and submit requests to the System Administrator, through the system, for actions only the System Administrator can perform, such as terminating employee accounts.
- **System Administrator:** Superuser responsible for onboarding new parking facilities, setting up site-specific policies (for example, those concerning spot-specific or floor-level reservations, time limits, and fines), managing user accounts, roles/permissions, and ensuring the system remains in good condition.
---

## Use Case Table

| Actor | Inherits | Use cases |
|---|---|---|
| Guest Customer - `GUEST_CUSTOMER` | none | UC-01 Register<br>UC-04 View Parking Spot<br>UC-05 Search Parking Spot<br>UC-06 Reserve Parking Spot<br>UC-07 Modify Reservation<br>UC-08 Cancel & Refund Parking Spot<br>UC-09 Check-in Parking Spot<br>UC-10 Purchase Traditional Parking Ticket |
| Registered Customer - `REGISTERED_CUSTOMER` | none | UC-02 Login<br>UC-03 Logout<br>UC-04 to UC-10 |
| Facility Operator - `FACILITY_OPERATOR` | none | UC-02E Employee Login<br>UC-03 Logout<br>UC-04E View Facility Parking Spot<br>UC-05E Search Facility Parking Spot<br>UC-11 Modify Spot Status<br>UC-12 Check-in Verification (license plate or QR)<br>UC-13 Check-out Verification (license plate or QR)<br>UC-14 Policy Violation Alert (such as wrong parking spot) |
| Facility Manager - `FACILITY_MANAGER` | Facility Operator | UC-15 View Analytics<br>UC-16 Configure Facility Pricing and Policies<br>UC-17 Manage Parking Lot<br>UC-18 Submit Admin Request<br>UC-19 Cancel Admin Request |
| System Administrator - `SYSTEM_ADMIN` | Facility Manager | UC-20 Create Account<br>UC-21 Manage Account<br>UC-22 Deactivate Account<br>UC-23 Reactivate Account<br>UC-24 Review Admin Request (with audit trail reference)<br>UC-25 View Audit Trail |
---

## Business Rules

| Rule ID | Rule Name | Description | Configurable? |
|---|---|---|---|
| R-01 | Login Attempts | After 5 consecutive failed login attempts, the system prompts the user to reset their password via "Forgot Password." | N/A |
| R-02 | Notification | The system automatically sends a notification (app push / SMS / email) 15 minutes before a reservation starts, 15 minutes before it expires, and immediately on key status changes (successful check-in, overstay alert). | Yes – channel, opt-in/opt-out, and notification frequency. |
| R-03 | Overstay Penalty | If a vehicle remains past its reserved end time plus a 15-minute grace period, the system automatically bills 1.5× the standard hourly rate for each additional hour (or fraction) to the payment method on file. | Yes. Rate and on/off, by the Facility Manager of that facility or the System Administrator. |
| R-04 | No-Show / Expiration Penalty | If the customer doesn't check in within 15 minutes of the start time (reservations under 1 hour) or 30 minutes (reservations 1 hour or longer), the reservation auto-expires, the spot returns to "Available," and a 10% no-show fee is retained. | Yes. Thresholds, fee, and on/off, by the Facility Manager of that facility or the System Administrator. |
| R-05 | Payment Required to Confirm | A reservation cannot move from "Pending" to "Reserved" until it is paid in full or on an approved payment plan. Unpaid bookings are never confirmed (see the R-06 for more). | N/A |
| R-06 | Process Pending Status Expiration | Selecting a spot or starting a traditional ticket locks it as "Pending" to block concurrent bookings.<br>• **Inactivity clock:** entering "Pending" starts a 3-minute inactivity timer. Any user progress (typing, field change, selection, button click) resets it to 3 minutes.<br>• **Soft warning:** each time the timer reaches 3 minutes of inactivity, the system shows a soft warning.<br>• **Release:** the system releases the hold immediately, with no extra grace period, when either 6 minutes of continuous inactivity or 9 minutes of cumulative inactivity (the 3rd soft warning) is reached.<br>• **On release:** the spot returns to "Available" and the user sees: "The system has released your spot due to inactivity. Please select the spot/initiate a ticket again." | N/A |
| R-07 | Estimate Spot Availability | Spot status is shown as:<br>🟢 Green = Available, which is the only one where the user can interact<br>🟡 Yellow = Reserved<br>🔴 Red = Not available (physically occupied)<br>⚪ Grey = Not available, under maintenance, cannot be interacted with | N/A |
| R-08 | Are You Still There? - Session Expiration | **Warning:** appears after 15 minutes of user inactivity.<br>**Expire:** the session automatically expires and logs the user out after 30 minutes of inactivity. | N/A |
| R-09 | Facility Scope Authorization | A Facility Operator or Facility Manager can view or act only on facilities they are assigned to, including submitting admin requests for employees assigned to those facilities (by facility-specific manager). The server validates this on every request. The System Administrator is not restricted by facility. | N/A |
| R-10 | Request Withdrawal | The requesting Manager can cancel a request only while it is `PENDING`. The status becomes `CANCELLED`, and the System Administrator's queue no longer shows it. | N/A |
| R-11 | Duplicate Request Block | The system rejects a new request if a `PENDING` request already exists for the same target user and request type. | N/A |
| R-12 | Request Review | Only the System Administrator can approve or reject a `PENDING` request. A rejection requires a `reviewNote`. Approval performs the requested action and sets the status in one atomic step. Either outcome sends an in-app notification to the requesting Manager. | N/A |
| R-13 | Account Deactivation (Soft Delete) | Deactivating an account sets a `disabled` flag instead of deleting rows, because past check-ins and audit records still reference the user. The user can no longer log in, and active sessions are ended immediately. Facility assignments are not restored on reactivation; a Manager must re-assign the employee. | N/A |
| R-14 | Request Reversal | An approved or rejected request can be reversed only while its action is still reversible. For a deactivation, reversal means Reactivate Account (UC-23). The system sets the request to `REVERSED`, records `reversedBy`, `reversedAt`, and `reversalNote`, keeps the full history, and notifies the requesting Manager with the reason. | N/A |
| R-15 | Audit Trail | The system logs every privileged action (actor, action, target, facility, timestamp, reason, and before/after state where applicable). The log is append-only. Reversals are recorded as new entries and never edit earlier ones. | N/A |
| R-16 | Admin-Initiated Action Notification | When the System Administrator acts on an employee account without an underlying request (deactivate, reactivate, role change), the system writes an audit log entry and sends an in-app notification to the Facility Manager(s) of the affected employee's facility. | N/A |
---