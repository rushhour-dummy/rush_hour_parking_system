# Rush Hour Parking System - Project Charter & Feasibility Brief

## Project Purpose

*In the US and beyond, many rely on personal vehicles. This Parking System aims to simplify and modernize parking by providing guaranteed spots and real-time estimates, helping users feel supported and valued.*


## Target users

- Vehicle owners seeking parking solutions → Customer
- Commercial parking unit owners or administrators managing parking facilities, such as malls, outlets, airports, or commercial parking lots. → Facility Manager and Facility Administrator

## Project source
**Employer/community group / Metro State community member and sponsor contact, if applicable**: N/A

## Scope

### Explicitly in scope

- Account registration & login for customers (UC-01, UC-02) and employees (UC-02E)
- Guest checkout without an account
- Searching for and viewing parking spot availability (UC-04, UC-05)
- Real-time spot availability tracking/estimation, driven by check-in/check-out events and manually set status (R-07), not by physical sensors (at the moment)
- Reserving and paying for a spot for a scheduled time window (UC-06)
- Traditional (walk-in, unscheduled) parking tickets (UC-10)

### Explicitly out of scope

- Physical sensors/cameras for automated spot occupancy detection; the system relies on check-in/check-out events and manual status updates instead
- In-lot/indoor navigation guiding a driver to their specific spot
- Controlling hardware/machinery within the parking lot
- **Real payment processing**: No actual credit/debit card transactions, cash handling, or connection to a real payment gateway. No real money changes hands anywhere in this project; all charges, penalties, and refunds are imaginary/simulated.
- **Digital wallet integrations (Apple Wallet, Google Pay, etc.)**: Not applicable, since there is no real payment processing to integrate with

---

## Constraint & Assumption

### Constraint
Hard requirements and limitations

- Separate dashboard/interface for customers and owners with various authorities/permissions
- The parking spot supply is limited.
- Available parking spots are shown as green; unavailable ones are shown as red.
- Users scan their reservation QR code at the gate to enter.

### Assumption
What we should account for or accept as risk.

| Assumption | Description |
| --- | --- |
| **Limited parking spots** | There will be times when no parking spot is available. |
| **GUI note** | The simplified lot view is drawn from the same `List<ParkingSpot>` that `viewParkingSpots()` returns. Each spot is placed using `zone`, `row`, and `column`, and colored by `status`: <br>🟢 Green = `AVAILABLE`<br>🟡 Yellow = `RESERVED`<br>🔴 Red = `OCCUPIED`<br>⚪ Grey = `OUT_OF_SERVICE` |
| **Many users, same vehicle** | such as a family car, but sometimes it can be a transfer of ownership, or the user already has an account; therefore, the dispute needs to be made. |
| **One user, multiple vehicles** | such as a rich car owner. |
| **No show** | Someone might reserve a parking spot but not use it |
| **Overstay** | Someone might overstay their parking spot |
| **Cancellation or refund** | Various facilities have different refund policies, such as no refund, limited full refund time, full refund anytime, and dynamic refund. |
| **Penalties (Simulated)** | Various payment penalties for different customer policy violations, but since the payment is simulated, the penalties are also simulated. |
| **Wrong or stolen spot** |Employee and system handling for wrong or stolen parking spot. |
| **Trolls / Double booking** | The same license plate cannot hold overlapping reservations. However, trolls or malicious actors are treated as an accepted risk via guest accounts, which Admin monitors. |
---