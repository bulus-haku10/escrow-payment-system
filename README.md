# Escrow Payment System

A trustless payment smart contract built on Stacks blockchain using Clarity. This contract allows secure transactions between buyers and sellers with optional arbitration for dispute resolution.

## Features

- **Trustless Escrow**: Funds are held in the contract until both parties confirm completion
- **Dispute Resolution**: Either party can raise disputes, resolved by a designated arbitrator
- **Multi-party Confirmation**: Both buyer and seller must confirm before funds are released
- **Cancellation**: Buyers can cancel under specific conditions
- **Transparent Tracking**: All escrow details are publicly readable

## How It Works

1. **Create Escrow**: Buyer creates an escrow by depositing STX, specifying seller and arbitrator
2. **Service Delivery**: Seller delivers goods/services
3. **Confirmation**: Both parties confirm completion
4. **Fund Release**: Funds are automatically released to seller when both confirm
5. **Dispute Handling**: If issues arise, arbitrator can resolve and direct funds

## Contract Functions

### Public Functions

#### `create-escrow`
Creates a new escrow agreement.
- **Parameters**:
  - `seller` (principal): The seller's address
  - `arbitrator` (principal): The arbitrator's address
  - `amount` (uint): Amount in STX to escrow
  - `description` (string-ascii 256): Description of the transaction
- **Returns**: Escrow ID
- **Requirements**: Buyer must have sufficient STX balance

#### `buyer-confirm`
Buyer confirms receipt/satisfaction with delivery.
- **Parameters**: `escrow-id` (uint)
- **Authorization**: Only the buyer
- **Effect**: If seller also confirmed, funds are released

#### `seller-confirm`
Seller confirms they have delivered goods/services.
- **Parameters**: `escrow-id` (uint)
- **Authorization**: Only the seller
- **Effect**: If buyer also confirmed, funds are released

#### `raise-dispute`
Raises a dispute for arbitrator resolution.
- **Parameters**: `escrow-id` (uint)
- **Authorization**: Buyer or seller
- **Effect**: Changes status to "disputed"

#### `resolve-dispute`
Arbitrator resolves dispute by awarding funds.
- **Parameters**:
  - `escrow-id` (uint)
  - `winner` (principal): Either buyer or seller
- **Authorization**: Only the designated arbitrator

#### `cancel-escrow`
Cancels escrow and refunds buyer.
- **Parameters**: `escrow-id` (uint)
- **Authorization**: Only buyer
- **Requirements**: Seller must not have confirmed, no dispute raised

### Read-Only Functions

#### `get-escrow`
Retrieves escrow details by ID.
- **Parameters**: `escrow-id` (uint)
- **Returns**: Escrow data or none

#### `get-escrow-counter`
Gets the current escrow counter.
- **Returns**: Current counter value

#### `is-escrow-party`
Checks if a user is party to an escrow.
- **Parameters**:
  - `escrow-id` (uint)
  - `user` (principal)
- **Returns**: Boolean

## Escrow States

- **active**: Escrow is created and awaiting confirmation
- **completed**: Both parties confirmed, funds released to seller
- **cancelled**: Escrow cancelled, funds returned to buyer
- **disputed**: Dispute raised, awaiting arbitrator resolution
- **resolved**: Arbitrator resolved dispute, funds distributed

## Error Codes

- `u100`: ERR-NOT-AUTHORIZED - User not authorized for this action
- `u101`: ERR-ESCROW-NOT-FOUND - Escrow ID doesn't exist
- `u102`: ERR-ESCROW-ALREADY-EXISTS - Escrow already exists
- `u103`: ERR-INSUFFICIENT-FUNDS - Buyer has insufficient STX
- `u104`: ERR-ESCROW-NOT-ACTIVE - Escrow is not in active state
- `u105`: ERR-ALREADY-COMPLETED - Action already completed
- `u106`: ERR-INVALID-ARBITRATOR - Invalid arbitrator decision
- `u107`: ERR-DISPUTE-ALREADY-RAISED - Dispute already exists
- `u108`: ERR-NO-DISPUTE - No dispute to resolve

## Usage Examples

### Creating an Escrow
```clarity
(contract-call? .escrow create-escrow
  'SP2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKNRV9EJ7 ; seller
  'SP1HZC9DHJXH7A8VYEJ4FJ7GQ8VYXGCD7XGV3VH6M ; arbitrator
  u1000000 ; amount (1 STX)
  "Website development project"
)
```

### Confirming Delivery
```clarity
;; Buyer confirms
(contract-call? .escrow buyer-confirm u1)

;; Seller confirms
(contract-call? .escrow seller-confirm u1)
```

### Handling Disputes
```clarity
;; Raise dispute
(contract-call? .escrow raise-dispute u1)

;; Arbitrator resolves (example: awarding to seller)
(contract-call? .escrow resolve-dispute u1 'SP2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKNRV9EJ7)
```

## Security Considerations

- All funds are held by the contract until resolution
- Only authorized parties can perform actions
- Dispute resolution requires designated arbitrator
- Contract state is immutable and transparent
- No external dependencies or oracles required

## Testing

Run the test suite using Vitest:
```bash
npm test
```

Tests cover all major functions, error conditions, and edge cases.

## Deployment

Deploy to Stacks testnet/mainnet using:
```bash
clarinet deploy --network testnet
```

## License

MIT License - see LICENSE file for details.
