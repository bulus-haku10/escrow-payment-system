import { describe, it, expect, beforeEach } from "vitest";

// Mock Clarity contract simulation
class ClarityContract {
  constructor() {
    this.escrows = new Map();
    this.escrowCounter = 0;
    this.balances = new Map();
    this.contractBalance = 0;
  }

  // Initialize test accounts with STX balances
  initializeAccount(address, balance) {
    this.balances.set(address, balance);
  }

  getBalance(address) {
    return this.balances.get(address) || 0;
  }

  // Transfer STX between accounts
  stxTransfer(amount, from, to) {
    const fromBalance = this.getBalance(from);
    if (fromBalance < amount) {
      throw new Error("Insufficient funds");
    }

    this.balances.set(from, fromBalance - amount);
    this.balances.set(to, this.getBalance(to) + amount);

    if (to === "contract") {
      this.contractBalance += amount;
    }
    if (from === "contract") {
      this.contractBalance -= amount;
    }
  }

  // Create escrow function
  createEscrow(buyer, seller, arbitrator, amount, description) {
    if (this.getBalance(buyer) < amount) {
      return { success: false, error: "ERR-INSUFFICIENT-FUNDS" };
    }

    this.escrowCounter += 1;
    const escrowId = this.escrowCounter;

    // Transfer funds to contract
    this.stxTransfer(amount, buyer, "contract");

    // Create escrow record
    this.escrows.set(escrowId, {
      buyer,
      seller,
      arbitrator,
      amount,
      description,
      status: "active",
      buyerConfirmed: false,
      sellerConfirmed: false,
      disputeRaised: false,
      createdAt: Date.now(),
    });

    return { success: true, value: escrowId };
  }

  // Get escrow details
  getEscrow(escrowId) {
    return this.escrows.get(escrowId) || null;
  }

  // Get escrow counter
  getEscrowCounter() {
    return this.escrowCounter;
  }

  // Check if user is party to escrow
  isEscrowParty(escrowId, user) {
    const escrow = this.getEscrow(escrowId);
    if (!escrow) return false;

    return (
      escrow.buyer === user ||
      escrow.seller === user ||
      escrow.arbitrator === user
    );
  }

  // Buyer confirm
  buyerConfirm(escrowId, caller) {
    const escrow = this.getEscrow(escrowId);

    if (!escrow) {
      return { success: false, error: "ERR-ESCROW-NOT-FOUND" };
    }

    if (caller !== escrow.buyer) {
      return { success: false, error: "ERR-NOT-AUTHORIZED" };
    }

    if (escrow.status !== "active") {
      return { success: false, error: "ERR-ESCROW-NOT-ACTIVE" };
    }

    escrow.buyerConfirmed = true;

    // If both confirmed, complete escrow
    if (escrow.sellerConfirmed && escrow.buyerConfirmed) {
      return this.completeEscrow(escrowId);
    }

    return { success: true, value: true };
  }

  // Seller confirm
  sellerConfirm(escrowId, caller) {
    const escrow = this.getEscrow(escrowId);

    if (!escrow) {
      return { success: false, error: "ERR-ESCROW-NOT-FOUND" };
    }

    if (caller !== escrow.seller) {
      return { success: false, error: "ERR-NOT-AUTHORIZED" };
    }

    if (escrow.status !== "active") {
      return { success: false, error: "ERR-ESCROW-NOT-ACTIVE" };
    }

    escrow.sellerConfirmed = true;

    // If both confirmed, complete escrow
    if (escrow.sellerConfirmed && escrow.buyerConfirmed) {
      return this.completeEscrow(escrowId);
    }

    return { success: true, value: true };
  }

  // Raise dispute
  raiseDispute(escrowId, caller) {
    const escrow = this.getEscrow(escrowId);

    if (!escrow) {
      return { success: false, error: "ERR-ESCROW-NOT-FOUND" };
    }

    if (caller !== escrow.buyer && caller !== escrow.seller) {
      return { success: false, error: "ERR-NOT-AUTHORIZED" };
    }

    if (escrow.status !== "active") {
      return { success: false, error: "ERR-ESCROW-NOT-ACTIVE" };
    }

    if (escrow.disputeRaised) {
      return { success: false, error: "ERR-DISPUTE-ALREADY-RAISED" };
    }

    escrow.disputeRaised = true;
    escrow.status = "disputed";

    return { success: true, value: true };
  }

  // Resolve dispute
  resolveDispute(escrowId, winner, caller) {
    const escrow = this.getEscrow(escrowId);

    if (!escrow) {
      return { success: false, error: "ERR-ESCROW-NOT-FOUND" };
    }

    if (caller !== escrow.arbitrator) {
      return { success: false, error: "ERR-NOT-AUTHORIZED" };
    }

    if (!escrow.disputeRaised) {
      return { success: false, error: "ERR-NO-DISPUTE" };
    }

    if (winner !== escrow.buyer && winner !== escrow.seller) {
      return { success: false, error: "ERR-INVALID-ARBITRATOR" };
    }

    // Transfer funds to winner
    this.stxTransfer(escrow.amount, "contract", winner);
    escrow.status = "resolved";

    return { success: true, value: true };
  }

  // Cancel escrow
  cancelEscrow(escrowId, caller) {
    const escrow = this.getEscrow(escrowId);

    if (!escrow) {
      return { success: false, error: "ERR-ESCROW-NOT-FOUND" };
    }

    if (caller !== escrow.buyer) {
      return { success: false, error: "ERR-NOT-AUTHORIZED" };
    }

    if (escrow.status !== "active") {
      return { success: false, error: "ERR-ESCROW-NOT-ACTIVE" };
    }

    if (escrow.sellerConfirmed) {
      return { success: false, error: "ERR-ALREADY-COMPLETED" };
    }

    if (escrow.disputeRaised) {
      return { success: false, error: "ERR-DISPUTE-ALREADY-RAISED" };
    }

    // Refund to buyer
    this.stxTransfer(escrow.amount, "contract", escrow.buyer);
    escrow.status = "cancelled";

    return { success: true, value: true };
  }

  // Complete escrow (private function)
  completeEscrow(escrowId) {
    const escrow = this.getEscrow(escrowId);

    if (!escrow) {
      return { success: false, error: "ERR-ESCROW-NOT-FOUND" };
    }

    // Transfer funds to seller
    this.stxTransfer(escrow.amount, "contract", escrow.seller);
    escrow.status = "completed";

    return { success: true, value: true };
  }
}

// Test constants
const BUYER = "SP1BUYER123";
const SELLER = "SP1SELLER456";
const ARBITRATOR = "SP1ARBITRATOR789";
const AMOUNT = 1000000; // 1 STX

describe("Escrow Payment System", () => {
  let contract;

  beforeEach(() => {
    contract = new ClarityContract();
    // Initialize accounts with STX balances
    contract.initializeAccount(BUYER, 5000000); // 5 STX
    contract.initializeAccount(SELLER, 1000000); // 1 STX
    contract.initializeAccount(ARBITRATOR, 1000000); // 1 STX
  });

  describe("Contract Initialization", () => {
    it("should initialize with zero escrow counter", () => {
      expect(contract.getEscrowCounter()).toBe(0);
    });

    it("should have correct initial balances", () => {
      expect(contract.getBalance(BUYER)).toBe(5000000);
      expect(contract.getBalance(SELLER)).toBe(1000000);
      expect(contract.getBalance(ARBITRATOR)).toBe(1000000);
    });
  });

  describe("Creating Escrows", () => {
    it("should create escrow successfully", () => {
      const result = contract.createEscrow(
        BUYER,
        SELLER,
        ARBITRATOR,
        AMOUNT,
        "Test escrow",
      );

      expect(result.success).toBe(true);
      expect(result.value).toBe(1);
      expect(contract.getEscrowCounter()).toBe(1);
      expect(contract.getBalance(BUYER)).toBe(4000000); // 5 STX - 1 STX
      expect(contract.contractBalance).toBe(AMOUNT);
    });

    it("should fail with insufficient funds", () => {
      const result = contract.createEscrow(
        BUYER,
        SELLER,
        ARBITRATOR,
        10000000, // 10 STX (more than buyer has)
        "Test escrow",
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("ERR-INSUFFICIENT-FUNDS");
    });

    it("should create multiple escrows", () => {
      const result1 = contract.createEscrow(
        BUYER,
        SELLER,
        ARBITRATOR,
        AMOUNT,
        "Escrow 1",
      );
      const result2 = contract.createEscrow(
        BUYER,
        SELLER,
        ARBITRATOR,
        AMOUNT,
        "Escrow 2",
      );

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result1.value).toBe(1);
      expect(result2.value).toBe(2);
      expect(contract.getEscrowCounter()).toBe(2);
    });
  });

  describe("Escrow Details", () => {
    beforeEach(() => {
      contract.createEscrow(BUYER, SELLER, ARBITRATOR, AMOUNT, "Test escrow");
    });

    it("should return escrow details", () => {
      const escrow = contract.getEscrow(1);

      expect(escrow).toBeTruthy();
      expect(escrow.buyer).toBe(BUYER);
      expect(escrow.seller).toBe(SELLER);
      expect(escrow.arbitrator).toBe(ARBITRATOR);
      expect(escrow.amount).toBe(AMOUNT);
      expect(escrow.status).toBe("active");
    });

    it("should return null for non-existent escrow", () => {
      const escrow = contract.getEscrow(999);
      expect(escrow).toBeNull();
    });

    it("should identify escrow parties correctly", () => {
      expect(contract.isEscrowParty(1, BUYER)).toBe(true);
      expect(contract.isEscrowParty(1, SELLER)).toBe(true);
      expect(contract.isEscrowParty(1, ARBITRATOR)).toBe(true);
      expect(contract.isEscrowParty(1, "SP1RANDOM123")).toBe(false);
    });
  });

  describe("Buyer Confirmation", () => {
    beforeEach(() => {
      contract.createEscrow(BUYER, SELLER, ARBITRATOR, AMOUNT, "Test escrow");
    });

    it("should allow buyer to confirm", () => {
      const result = contract.buyerConfirm(1, BUYER);

      expect(result.success).toBe(true);

      const escrow = contract.getEscrow(1);
      expect(escrow.buyerConfirmed).toBe(true);
      expect(escrow.status).toBe("active"); // Still active until seller confirms
    });

    it("should reject non-buyer confirmation", () => {
      const result = contract.buyerConfirm(1, SELLER);

      expect(result.success).toBe(false);
      expect(result.error).toBe("ERR-NOT-AUTHORIZED");
    });

    it("should reject confirmation for non-existent escrow", () => {
      const result = contract.buyerConfirm(999, BUYER);

      expect(result.success).toBe(false);
      expect(result.error).toBe("ERR-ESCROW-NOT-FOUND");
    });
  });

  describe("Seller Confirmation", () => {
    beforeEach(() => {
      contract.createEscrow(BUYER, SELLER, ARBITRATOR, AMOUNT, "Test escrow");
    });

    it("should allow seller to confirm", () => {
      const result = contract.sellerConfirm(1, SELLER);

      expect(result.success).toBe(true);

      const escrow = contract.getEscrow(1);
      expect(escrow.sellerConfirmed).toBe(true);
      expect(escrow.status).toBe("active"); // Still active until buyer confirms
    });

    it("should reject non-seller confirmation", () => {
      const result = contract.sellerConfirm(1, BUYER);

      expect(result.success).toBe(false);
      expect(result.error).toBe("ERR-NOT-AUTHORIZED");
    });
  });

  describe("Escrow Completion", () => {
    beforeEach(() => {
      contract.createEscrow(BUYER, SELLER, ARBITRATOR, AMOUNT, "Test escrow");
    });

    it("should complete when both parties confirm", () => {
      // Seller confirms first
      contract.sellerConfirm(1, SELLER);
      expect(contract.getEscrow(1).status).toBe("active");

      // Buyer confirms - should complete
      const result = contract.buyerConfirm(1, BUYER);

      expect(result.success).toBe(true);

      const escrow = contract.getEscrow(1);
      expect(escrow.status).toBe("completed");
      expect(escrow.buyerConfirmed).toBe(true);
      expect(escrow.sellerConfirmed).toBe(true);

      // Check seller received funds
      expect(contract.getBalance(SELLER)).toBe(2000000); // 1 STX + 1 STX from escrow
      expect(contract.contractBalance).toBe(0);
    });
  });
});
