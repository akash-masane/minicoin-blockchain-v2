import hashlib
import json
import time
import uuid
import random
from typing import List, Dict, Optional
class Transaction:
    def __init__(self, sender: str, recipient: str, amount: float,
                 tx_type: str = "transfer", tx_id: str = None):
        self.tx_id = tx_id or str(uuid.uuid4()).replace("-", "")[:16]
        self.sender = sender
        self.recipient = recipient
        self.amount = amount
        self.tx_type = tx_type   # transfer | mining_reward | staking_reward | genesis
        self.timestamp = time.time()
    def to_dict(self) -> Dict:
        return {
            "tx_id": self.tx_id,
            "sender": self.sender,
            "recipient": self.recipient,
            "amount": self.amount,
            "tx_type": self.tx_type,
            "timestamp": self.timestamp,
        }
class Block:
    def __init__(self, index: int, transactions: List[Dict],
                 previous_hash: str, nonce: int = 0, timestamp: float = None):
        self.index = index
        self.timestamp = timestamp or time.time()
        self.transactions = transactions
        self.previous_hash = previous_hash
        self.nonce = nonce
        self.block_time = 0.0
        self.hash = self.calculate_hash()
    def calculate_hash(self) -> str:
        data = json.dumps({
            "index": self.index,
            "timestamp": self.timestamp,
            "transactions": self.transactions,
            "previous_hash": self.previous_hash,
            "nonce": self.nonce,
        }, sort_keys=True)
        return hashlib.sha256(data.encode()).hexdigest()
    def to_dict(self) -> Dict:
        return {
            "index": self.index,
            "timestamp": self.timestamp,
            "transactions": self.transactions,
            "previous_hash": self.previous_hash,
            "nonce": self.nonce,
            "hash": self.hash,
            "block_time": self.block_time,
        }
class PriceOracle:
    """Simulates MNC/USD price with a realistic random walk."""
    INITIAL_PRICE = 2.50
    def __init__(self):
        self.prices: List[float] = []
        self.timestamps: List[float] = []
        self._generate_history()
    def _generate_history(self):
        price = self.INITIAL_PRICE
        now = time.time()
        for i in range(72, 0, -1):
            change = random.gauss(0.003, 0.03)
            price = max(0.10, round(price * (1 + change), 4))
            self.prices.append(price)
            self.timestamps.append(now - i * 3600)
        self.prices.append(round(price * (1 + random.gauss(0, 0.01)), 4))
        self.timestamps.append(now)
    def update(self) -> float:
        last = self.prices[-1]
        change = random.gauss(0.002, 0.022)
        new_price = max(0.10, round(last * (1 + change), 4))
        self.prices.append(new_price)
        self.timestamps.append(time.time())
        if len(self.prices) > 200:
            self.prices = self.prices[-200:]
            self.timestamps = self.timestamps[-200:]
        return new_price
    @property
    def current(self) -> float:
        return self.prices[-1]
    @property
    def change_24h(self) -> float:
        if len(self.prices) < 24:
            return 0.0
        old = self.prices[-24]
        return round((self.current - old) / old * 100, 2)
    @property
    def high_24h(self) -> float:
        return round(max(self.prices[-min(24, len(self.prices)):]), 4)
    @property
    def low_24h(self) -> float:
        return round(min(self.prices[-min(24, len(self.prices)):]), 4)
    def get_history(self, points: int = 60) -> List[Dict]:
        return [
            {"price": p, "time": t}
            for p, t in zip(self.prices[-points:], self.timestamps[-points:])
        ]
class StakingPool:
    """Lock MNC to earn 12% APY passive income."""
    ANNUAL_RATE = 0.12
    MIN_STAKE   = 1.0
    def __init__(self):
        self.stakes: Dict[str, Dict] = {}
    def stake(self, address: str, amount: float) -> Dict:
        if amount < self.MIN_STAKE:
            return {"success": False, "message": f"Minimum stake is {self.MIN_STAKE} MNC."}
        if address in self.stakes:
            self._accrue(address)
            self.stakes[address]["amount"] = round(self.stakes[address]["amount"] + amount, 4)
        else:
            self.stakes[address] = {
                "amount": round(amount, 4),
                "start_time": time.time(),
                "last_accrued": time.time(),
                "total_earned": 0.0,
                "pending": 0.0,
            }
        return {"success": True, "message": f"Staked {amount} MNC at 12% APY!"}
    def unstake(self, address: str) -> Dict:
        if address not in self.stakes:
            return {"success": False, "message": "No active stake found."}
        self._accrue(address)
        info = self.stakes.pop(address)
        total_rewards = round(info["total_earned"] + info["pending"], 6)
        return {"success": True, "returned": info["amount"], "rewards": total_rewards}
    def claim_rewards(self, address: str) -> Dict:
        if address not in self.stakes:
            return {"success": False, "message": "No active stake found."}
        self._accrue(address)
        pending = self.stakes[address].get("pending", 0.0)
        if pending < 0.0001:
            return {"success": False, "message": "No claimable rewards yet. Wait a bit!"}
        self.stakes[address]["total_earned"] += pending
        self.stakes[address]["pending"] = 0.0
        return {"success": True, "rewards": round(pending, 6)}
    def _accrue(self, address: str):
        if address not in self.stakes:
            return
        s = self.stakes[address]
        elapsed = time.time() - s["last_accrued"]
        rate = self.ANNUAL_RATE / (365 * 24 * 3600)
        s["pending"] = s.get("pending", 0.0) + s["amount"] * rate * elapsed
        s["last_accrued"] = time.time()
    def get_info(self, address: str) -> Dict:
        if address not in self.stakes:
            return {"staked": False}
        self._accrue(address)
        s = self.stakes[address]
        return {
            "staked": True,
            "amount": s["amount"],
            "start_time": s["start_time"],
            "total_earned": round(s["total_earned"], 6),
            "pending_rewards": round(s.get("pending", 0.0), 6),
            "apy": self.ANNUAL_RATE * 100,
        }
    def all_stakers(self) -> Dict:
        return {addr: self.get_info(addr) for addr in self.stakes}
    @property
    def total_staked(self) -> float:
        return round(sum(v["amount"] for v in self.stakes.values()), 4)
class Blockchain:
    DIFFICULTY     = 4
    MINING_REWARD  = 50.0
    INITIAL_SUPPLY = 1000.0
    def __init__(self):
        self.chain: List[Block] = []
        self.pending_transactions: List[Dict] = []
        self.wallets: Dict[str, float] = {}
        self.block_times: List[float] = []
        self.price_oracle = PriceOracle()
        self.staking = StakingPool()
        self._create_genesis_block()
    # ── Genesis ──────────────────────────────────────
    def _create_genesis_block(self):
        tx = Transaction("NETWORK", "NETWORK", self.INITIAL_SUPPLY, "genesis")
        block = Block(0, [tx.to_dict()], "0" * 64, nonce=0)
        block.hash = block.calculate_hash()
        self.chain.append(block)
    # ── Wallets ──────────────────────────────────────
    def create_wallet(self, prefix: str = "") -> str:
        addr = prefix + str(uuid.uuid4()).replace("-", "")[:12]
        self.wallets.setdefault(addr, 0.0)
        return addr
    def get_balance(self, address: str) -> float:
        bal = 0.0
        for block in self.chain:
            for tx in block.transactions:
                if tx["recipient"] == address:
                    bal += tx["amount"]
                if tx["sender"] == address:
                    bal -= tx["amount"]
        return round(bal, 4)
    def get_available_balance(self, address: str) -> float:
        staked = self.staking.stakes.get(address, {}).get("amount", 0.0)
        return round(self.get_balance(address) - staked, 4)
    def get_wallet_transactions(self, address: str) -> List[Dict]:
        txs = []
        for block in self.chain:
            for tx in block.transactions:
                if tx["sender"] == address or tx["recipient"] == address:
                    txs.append({**tx, "block_index": block.index})
        return sorted(txs, key=lambda x: x["timestamp"], reverse=True)
    # ── Transactions ─────────────────────────────────
    def add_transaction(self, sender: str, recipient: str,
                        amount: float, tx_type: str = "transfer") -> Dict:
        if sender != "NETWORK":
            avail = self.get_available_balance(sender)
            if amount > avail:
                return {"success": False, "message": f"Insufficient balance. Available: {avail} MNC."}
            if amount <= 0:
                return {"success": False, "message": "Amount must be positive."}
            if sender == recipient:
                return {"success": False, "message": "Cannot send to yourself."}
        tx = Transaction(sender, recipient, amount, tx_type)
        self.pending_transactions.append(tx.to_dict())
        return {"success": True, "message": "Transaction queued!", "tx_id": tx.tx_id}
    # ── Mining ───────────────────────────────────────
    def mine_block(self, miner_address: str) -> Block:
        self.wallets.setdefault(miner_address, 0.0)
        reward_tx = Transaction("NETWORK", miner_address, self.MINING_REWARD, "mining_reward")
        txns = self.pending_transactions.copy()
        txns.append(reward_tx.to_dict())
        last = self.chain[-1]
        start = time.time()
        block = Block(len(self.chain), txns, last.hash)
        target = "0" * self.DIFFICULTY
        while not block.hash.startswith(target):
            block.nonce += 1
            block.hash = block.calculate_hash()
        block.block_time = round(time.time() - start, 3)
        self.block_times.append(block.block_time)
        self.chain.append(block)
        self.pending_transactions = []
        self.price_oracle.update()
        return block
    # ── Staking ──────────────────────────────────────
    def stake_coins(self, address: str, amount: float) -> Dict:
        avail = self.get_available_balance(address)
        if amount > avail:
            return {"success": False, "message": f"Available: {avail} MNC."}
        return self.staking.stake(address, amount)
    def unstake_coins(self, address: str) -> Dict:
        result = self.staking.unstake(address)
        if result["success"] and result["rewards"] > 0:
            self.add_transaction("NETWORK", address, result["rewards"], "staking_reward")
        return result
    def claim_staking_rewards(self, address: str) -> Dict:
        result = self.staking.claim_rewards(address)
        if result["success"]:
            self.add_transaction("NETWORK", address, result["rewards"], "staking_reward")
        return result
    # ── Search ───────────────────────────────────────
    def search(self, query: str) -> Dict:
        q = query.strip().lower()
        results = {"blocks": [], "transactions": [], "wallets": []}
        if not q:
            return results
        for block in self.chain:
            if q in block.hash.lower() or q == str(block.index):
                results["blocks"].append(block.to_dict())
            for tx in block.transactions:
                if any(q in str(tx.get(f, "")).lower()
                       for f in ["tx_id", "sender", "recipient"]):
                    results["transactions"].append({**tx, "block_index": block.index})
        for addr in self.wallets:
            if q in addr.lower():
                results["wallets"].append({"address": addr, "balance": self.get_balance(addr)})
        return results
    # ── Validation ───────────────────────────────────
    def is_chain_valid(self) -> bool:
        for i in range(1, len(self.chain)):
            cur, prev = self.chain[i], self.chain[i - 1]
            if cur.hash != cur.calculate_hash():
                return False
            if cur.previous_hash != prev.hash:
                return False
        return True
    # ── Stats & Leaderboard ──────────────────────────
    def get_stats(self) -> Dict:
        total_txs = sum(len(b.transactions) for b in self.chain)
        total_supply = sum(
            tx["amount"] for b in self.chain
            for tx in b.transactions if tx["sender"] == "NETWORK"
        )
        avg_bt = (round(sum(self.block_times) / len(self.block_times), 3)
                  if self.block_times else 0)
        return {
            "blocks": len(self.chain),
            "pending_transactions": len(self.pending_transactions),
            "total_transactions": total_txs,
            "total_supply": round(total_supply, 4),
            "difficulty": self.DIFFICULTY,
            "mining_reward": self.MINING_REWARD,
            "chain_valid": self.is_chain_valid(),
            "wallets": len(self.wallets),
            "avg_block_time": avg_bt,
            "price": self.price_oracle.current,
            "price_change_24h": self.price_oracle.change_24h,
            "price_high_24h": self.price_oracle.high_24h,
            "price_low_24h": self.price_oracle.low_24h,
            "market_cap": round(total_supply * self.price_oracle.current, 2),
            "total_staked": self.staking.total_staked,
        }
    def get_leaderboard(self) -> List[Dict]:
        lb = []
        for addr in self.wallets:
            bal = self.get_balance(addr)
            si = self.staking.get_info(addr)
            staked = si.get("amount", 0) if si["staked"] else 0
            lb.append({
                "address": addr,
                "balance": bal,
                "staked": staked,
                "total_worth": round(bal + staked, 4),
                "tx_count": len(self.get_wallet_transactions(addr)),
                "is_staking": si["staked"],
            })
        return sorted(lb, key=lambda x: x["total_worth"], reverse=True)
    def get_chain_data(self) -> List[Dict]:
        return [b.to_dict() for b in self.chain]
