;; Escrow Payment System
;; A trustless payment contract where funds are held until conditions are met

;; Constants
(define-constant ERR-NOT-AUTHORIZED (err u100))
(define-constant ERR-ESCROW-NOT-FOUND (err u101))
(define-constant ERR-ESCROW-ALREADY-EXISTS (err u102))
(define-constant ERR-INSUFFICIENT-FUNDS (err u103))
(define-constant ERR-ESCROW-NOT-ACTIVE (err u104))
(define-constant ERR-ALREADY-COMPLETED (err u105))
(define-constant ERR-INVALID-ARBITRATOR (err u106))
(define-constant ERR-DISPUTE-ALREADY-RAISED (err u107))
(define-constant ERR-NO-DISPUTE (err u108))

;; Data Variables
(define-data-var escrow-counter uint u0)

;; Data Maps
(define-map escrows
  uint
  {
    buyer: principal,
    seller: principal,
    arbitrator: principal,
    amount: uint,
    description: (string-ascii 256),
    status: (string-ascii 20),
    buyer-confirmed: bool,
    seller-confirmed: bool,
    dispute-raised: bool,
    created-at: uint
  }
)

;; Read-only functions

;; Get escrow details by ID
(define-read-only (get-escrow (escrow-id uint))
  (map-get? escrows escrow-id)
)

;; Get current escrow counter
(define-read-only (get-escrow-counter)
  (var-get escrow-counter)
)

;; Check if user is party to escrow
(define-read-only (is-escrow-party (escrow-id uint) (user principal))
  (match (map-get? escrows escrow-id)
    escrow-data (or
      (is-eq user (get buyer escrow-data))
      (is-eq user (get seller escrow-data))
      (is-eq user (get arbitrator escrow-data))
    )
    false
  )
)

;; Public functions

;; Create new escrow
(define-public (create-escrow
  (seller principal)
  (arbitrator principal)
  (amount uint)
  (description (string-ascii 256))
)
  (let
    (
      (escrow-id (+ (var-get escrow-counter) u1))
      (buyer tx-sender)
    )
    ;; Check if buyer has sufficient funds
    (asserts! (>= (stx-get-balance buyer) amount) ERR-INSUFFICIENT-FUNDS)

    ;; Transfer STX to contract
    (try! (stx-transfer? amount buyer (as-contract tx-sender)))

    ;; Create escrow record
    (map-set escrows escrow-id {
      buyer: buyer,
      seller: seller,
      arbitrator: arbitrator,
      amount: amount,
      description: description,
      status: "active",
      buyer-confirmed: false,
      seller-confirmed: false,
      dispute-raised: false,
      created-at: u0
    })

    ;; Update counter
    (var-set escrow-counter escrow-id)

    (ok escrow-id)
  )
)

;; Buyer confirms delivery/completion
(define-public (buyer-confirm (escrow-id uint))
  (let
    (
      (escrow-data (unwrap! (map-get? escrows escrow-id) ERR-ESCROW-NOT-FOUND))
    )
    ;; Check authorization
    (asserts! (is-eq tx-sender (get buyer escrow-data)) ERR-NOT-AUTHORIZED)

    ;; Check escrow is active
    (asserts! (is-eq (get status escrow-data) "active") ERR-ESCROW-NOT-ACTIVE)

    ;; Update escrow
    (map-set escrows escrow-id (merge escrow-data { buyer-confirmed: true }))

    ;; If both parties confirmed, complete escrow
    (if (get seller-confirmed escrow-data)
      (complete-escrow escrow-id)
      (ok true)
    )
  )
)

;; Seller confirms they've delivered
(define-public (seller-confirm (escrow-id uint))
  (let
    (
      (escrow-data (unwrap! (map-get? escrows escrow-id) ERR-ESCROW-NOT-FOUND))
    )
    ;; Check authorization
    (asserts! (is-eq tx-sender (get seller escrow-data)) ERR-NOT-AUTHORIZED)

    ;; Check escrow is active
    (asserts! (is-eq (get status escrow-data) "active") ERR-ESCROW-NOT-ACTIVE)

    ;; Update escrow
    (map-set escrows escrow-id (merge escrow-data { seller-confirmed: true }))

    ;; If both parties confirmed, complete escrow
    (if (get buyer-confirmed escrow-data)
      (complete-escrow escrow-id)
      (ok true)
    )
  )
)

;; Raise a dispute
(define-public (raise-dispute (escrow-id uint))
  (let
    (
      (escrow-data (unwrap! (map-get? escrows escrow-id) ERR-ESCROW-NOT-FOUND))
    )
    ;; Check authorization (buyer or seller can raise dispute)
    (asserts! (or
      (is-eq tx-sender (get buyer escrow-data))
      (is-eq tx-sender (get seller escrow-data))
    ) ERR-NOT-AUTHORIZED)

    ;; Check escrow is active
    (asserts! (is-eq (get status escrow-data) "active") ERR-ESCROW-NOT-ACTIVE)

    ;; Check dispute not already raised
    (asserts! (not (get dispute-raised escrow-data)) ERR-DISPUTE-ALREADY-RAISED)

    ;; Update escrow
    (map-set escrows escrow-id (merge escrow-data {
      dispute-raised: true,
      status: "disputed"
    }))

    (ok true)
  )
)

;; Arbitrator resolves dispute
(define-public (resolve-dispute (escrow-id uint) (winner principal))
  (let
    (
      (escrow-data (unwrap! (map-get? escrows escrow-id) ERR-ESCROW-NOT-FOUND))
    )
    ;; Check authorization
    (asserts! (is-eq tx-sender (get arbitrator escrow-data)) ERR-NOT-AUTHORIZED)

    ;; Check dispute was raised
    (asserts! (get dispute-raised escrow-data) ERR-NO-DISPUTE)

    ;; Check winner is valid party
    (asserts! (or
      (is-eq winner (get buyer escrow-data))
      (is-eq winner (get seller escrow-data))
    ) ERR-INVALID-ARBITRATOR)

    ;; Transfer funds to winner
    (try! (as-contract (stx-transfer? (get amount escrow-data) tx-sender winner)))

    ;; Update escrow status
    (map-set escrows escrow-id (merge escrow-data { status: "resolved" }))

    (ok true)
  )
)

;; Cancel escrow (only if both parties agree and no dispute)
(define-public (cancel-escrow (escrow-id uint))
  (let
    (
      (escrow-data (unwrap! (map-get? escrows escrow-id) ERR-ESCROW-NOT-FOUND))
    )
    ;; For simplicity, only buyer can cancel if seller hasn't confirmed
    (asserts! (is-eq tx-sender (get buyer escrow-data)) ERR-NOT-AUTHORIZED)
    (asserts! (is-eq (get status escrow-data) "active") ERR-ESCROW-NOT-ACTIVE)
    (asserts! (not (get seller-confirmed escrow-data)) ERR-ALREADY-COMPLETED)
    (asserts! (not (get dispute-raised escrow-data)) ERR-DISPUTE-ALREADY-RAISED)

    ;; Refund to buyer
    (try! (as-contract (stx-transfer? (get amount escrow-data) tx-sender (get buyer escrow-data))))

    ;; Update status
    (map-set escrows escrow-id (merge escrow-data { status: "cancelled" }))

    (ok true)
  )
)

;; Private functions

;; Complete escrow transaction
(define-private (complete-escrow (escrow-id uint))
  (let
    (
      (escrow-data (unwrap! (map-get? escrows escrow-id) ERR-ESCROW-NOT-FOUND))
    )
    ;; Transfer funds to seller
    (try! (as-contract (stx-transfer? (get amount escrow-data) tx-sender (get seller escrow-data))))

    ;; Update escrow status
    (map-set escrows escrow-id (merge escrow-data { status: "completed" }))

    (ok true)
  )
)
