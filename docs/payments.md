# Payment System

## Architecture

The payment system supports multiple payment methods with a proper abstraction layer.

### Payment Methods

- **Cash**: Works offline, counted in cash shifts
- **M-Pesa**: Live STK Push or manual entry
- **Card**: Future integration via card terminals
- **Pay later**: Credit/IOU tracking

### Payment Model

One order can have multiple payments:
```
Order: KES 2,500
  Payment 1: M-Pesa — KES 1,500 (ref: ABC123)
  Payment 2: Cash — KES 1,000
```

### M-Pesa Integration

**Live Mode** (requires internet):
- Uses Safaricom Daraja API
- STK Push initiated server-side
- Callback URL handles confirmation
- Transaction reference recorded
- No credentials in frontend

**Manual Mode** (works offline):
- Record M-Pesa transaction manually
- Enter transaction reference number
- Status set to `pending`
- Confirmed when callback arrives or manually verified
- Sync when reconnected

### Refunds

- Full or partial refunds
- Requires authorization (owner/manager role)
- Original payment reference tracked
- Refund reason recorded
- Audit trail maintained
- Order balance updated correctly

### Cash Management

Cash shifts track:
- Opening float
- Cash sales
- Refunds
- Cash-in (manual additions)
- Cash-out (expenses)
- Expected vs actual balance
- Variance with explanation

## Security

- M-Pesa credentials never in frontend
- Payment processing validated server-side
- Duplicate payment prevention
- Payment reconciliation supported
- All payment actions audited
