from flask import Flask, jsonify, request, render_template
from flask_cors import CORS
from blockchain import Blockchain

app = Flask(__name__)
CORS(app)

blockchain = Blockchain()

# ── Demo wallets ─────────────────────────────────────────
ALICE   = blockchain.create_wallet("Alice_")
BOB     = blockchain.create_wallet("Bob_")
CHARLIE = blockchain.create_wallet("Charlie_")
DAVE    = blockchain.create_wallet("Dave_")
EVE     = blockchain.create_wallet("Eve_")

# Fund wallets
for addr, amt in [(ALICE, 300), (BOB, 200), (CHARLIE, 150), (DAVE, 100), (EVE, 75)]:
    blockchain.add_transaction("NETWORK", addr, amt)
blockchain.mine_block(ALICE)   # Block 1

# Some demo transactions
blockchain.add_transaction(ALICE, BOB, 30.0)
blockchain.add_transaction(BOB, CHARLIE, 15.0)
blockchain.add_transaction(CHARLIE, DAVE, 8.0)
blockchain.mine_block(BOB)     # Block 2

blockchain.add_transaction(ALICE, EVE, 20.0)
blockchain.add_transaction(DAVE, BOB, 5.0)
blockchain.mine_block(CHARLIE) # Block 3

# Stake some coins for demo
blockchain.stake_coins(ALICE, 50.0)
blockchain.stake_coins(BOB, 30.0)


# ──────────────────────────────────────────────
#  Pages
# ──────────────────────────────────────────────
@app.route("/")
def index():
    return render_template("index.html")


# ──────────────────────────────────────────────
#  Chain
# ──────────────────────────────────────────────
@app.route("/api/chain")
def get_chain():
    return jsonify({"chain": blockchain.get_chain_data(), "length": len(blockchain.chain)})

@app.route("/api/stats")
def get_stats():
    return jsonify(blockchain.get_stats())

@app.route("/api/pending")
def get_pending():
    return jsonify({"pending_transactions": blockchain.pending_transactions,
                    "count": len(blockchain.pending_transactions)})

@app.route("/api/validate")
def validate():
    valid = blockchain.is_chain_valid()
    return jsonify({"valid": valid,
                    "message": "Chain is valid and untampered!" if valid else "Chain has been tampered!"})

@app.route("/api/block/<int:index>")
def get_block(index):
    if 0 <= index < len(blockchain.chain):
        return jsonify(blockchain.chain[index].to_dict())
    return jsonify({"error": "Block not found"}), 404


# ──────────────────────────────────────────────
#  Wallets
# ──────────────────────────────────────────────
@app.route("/api/wallets")
def get_wallets():
    return jsonify({"wallets": {addr: blockchain.get_balance(addr) for addr in blockchain.wallets}})

@app.route("/api/wallet/create", methods=["POST"])
def create_wallet():
    data = request.get_json() or {}
    name = data.get("name", "Wallet")
    addr = blockchain.create_wallet(name + "_")
    return jsonify({"success": True, "address": addr, "balance": 0.0,
                    "message": f"Wallet created: {addr}"})

@app.route("/api/wallet/<address>/balance")
def get_balance(address):
    if address not in blockchain.wallets:
        return jsonify({"error": "Wallet not found"}), 404
    return jsonify({
        "address": address,
        "balance": blockchain.get_balance(address),
        "available": blockchain.get_available_balance(address),
    })

@app.route("/api/wallet/<address>/history")
def wallet_history(address):
    if address not in blockchain.wallets:
        return jsonify({"error": "Wallet not found"}), 404
    return jsonify({
        "address": address,
        "balance": blockchain.get_balance(address),
        "available": blockchain.get_available_balance(address),
        "transactions": blockchain.get_wallet_transactions(address),
        "staking": blockchain.staking.get_info(address),
    })


# ──────────────────────────────────────────────
#  Transactions
# ──────────────────────────────────────────────
@app.route("/api/transaction", methods=["POST"])
def new_transaction():
    data = request.get_json() or {}
    try:
        amount = float(data["amount"])
    except (KeyError, ValueError, TypeError):
        return jsonify({"success": False, "message": "Invalid amount"}), 400
    result = blockchain.add_transaction(
        data.get("sender", ""), data.get("recipient", ""), amount
    )
    return jsonify(result), 200 if result["success"] else 400


# ──────────────────────────────────────────────
#  Mining
# ──────────────────────────────────────────────
@app.route("/api/mine", methods=["POST"])
def mine():
    data = request.get_json() or {}
    miner = data.get("miner_address", ALICE)
    if miner not in blockchain.wallets:
        return jsonify({"success": False, "message": "Unknown miner wallet"}), 400
    if not blockchain.pending_transactions:
        return jsonify({"success": False, "message": "No pending transactions to mine."}), 400
    block = blockchain.mine_block(miner)
    return jsonify({
        "success": True,
        "message": f"Block #{block.index} mined!",
        "block": block.to_dict(),
        "miner_reward": blockchain.MINING_REWARD,
        "miner_balance": blockchain.get_balance(miner),
        "nonce": block.nonce,
        "block_time": block.block_time,
    })


# ──────────────────────────────────────────────
#  Staking
# ──────────────────────────────────────────────
@app.route("/api/stake", methods=["POST"])
def stake():
    data = request.get_json() or {}
    try:
        amount = float(data["amount"])
    except (KeyError, ValueError, TypeError):
        return jsonify({"success": False, "message": "Invalid amount"}), 400
    return jsonify(blockchain.stake_coins(data.get("address", ""), amount))

@app.route("/api/unstake", methods=["POST"])
def unstake():
    data = request.get_json() or {}
    return jsonify(blockchain.unstake_coins(data.get("address", "")))

@app.route("/api/stake/claim", methods=["POST"])
def claim_stake():
    data = request.get_json() or {}
    return jsonify(blockchain.claim_staking_rewards(data.get("address", "")))

@app.route("/api/staking/<address>")
def staking_info(address):
    return jsonify(blockchain.staking.get_info(address))

@app.route("/api/staking")
def all_staking():
    return jsonify({
        "stakers": blockchain.staking.all_stakers(),
        "total_staked": blockchain.staking.total_staked,
        "apy": blockchain.staking.ANNUAL_RATE * 100,
    })


# ──────────────────────────────────────────────
#  Market / Price
# ──────────────────────────────────────────────
@app.route("/api/price")
def price():
    pts = request.args.get("points", 60, type=int)
    return jsonify({
        "current": blockchain.price_oracle.current,
        "change_24h": blockchain.price_oracle.change_24h,
        "high_24h": blockchain.price_oracle.high_24h,
        "low_24h": blockchain.price_oracle.low_24h,
        "history": blockchain.price_oracle.get_history(pts),
    })


# ──────────────────────────────────────────────
#  Leaderboard
# ──────────────────────────────────────────────
@app.route("/api/leaderboard")
def leaderboard():
    return jsonify({"leaderboard": blockchain.get_leaderboard()})


# ──────────────────────────────────────────────
#  Search
# ──────────────────────────────────────────────
@app.route("/api/search")
def search():
    q = request.args.get("q", "")
    return jsonify(blockchain.search(q))


if __name__ == "__main__":
    print("\n" + "=" * 55)
    print("  MiniCoin Blockchain v2.0 - ENHANCED EDITION")
    print("=" * 55)
    print(f"  Open: http://127.0.0.1:5000")
    print(f"  Wallets: Alice, Bob, Charlie, Dave, Eve")
    print(f"  Blocks pre-mined: 3")
    print(f"  Staking: Alice (50 MNC), Bob (30 MNC) active")
    print("=" * 55 + "\n")
    app.run(debug=True, port=5000)
