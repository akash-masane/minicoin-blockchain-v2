from flask import Flask, jsonify, request, render_template
from flask_cors import CORS
from blockchain import Blockchain

app = Flask(__name__)
CORS(app)
blockchain = Blockchain()

# Demo wallets
ALICE = blockchain.create_wallet("Alice_")
BOB = blockchain.create_wallet("Bob_")
CHARLIE = blockchain.create_wallet("Charlie_")
DAVE = blockchain.create_wallet("Dave_")
EVE = blockchain.create_wallet("Eve_")

# Fund wallets and mine the first demo block.
for addr, amt in [(ALICE, 300), (BOB, 200), (CHARLIE, 150), (DAVE, 100), (EVE, 75)]:
    blockchain.add_transaction("NETWORK", addr, amt)
blockchain.mine_block(ALICE)

# Demo transactions
blockchain.add_transaction(ALICE, BOB, 30.0)
blockchain.add_transaction(BOB, CHARLIE, 15.0)
blockchain.add_transaction(CHARLIE, DAVE, 8.0)
blockchain.mine_block(BOB)
blockchain.add_transaction(ALICE, EVE, 20.0)
blockchain.add_transaction(DAVE, BOB, 5.0)
blockchain.mine_block(CHARLIE)

# Demo staking
blockchain.stake_coins(ALICE, 50.0)
blockchain.stake_coins(BOB, 30.0)

@app.route("/")
def index():
    return render_template("index.html")

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

@app.route("/api/wallets")
def get_wallets():
    return jsonify({"wallets": {addr: blockchain.get_balance(addr) for addr in blockchain.wallets}})

@app.route("/api/wallet/create", methods=["POST"])
def create_wallet():
    data = request.get_json(silent=True) or {}
    name = str(data.get("name", "Wallet")).strip()[:35] or "Wallet"
    addr = blockchain.create_wallet(name + "_")
    return jsonify({"success": True, "address": addr, "balance": 0.0,
                    "message": f"Wallet created: {addr}"})

@app.route("/api/wallet/<address>/balance")
def get_balance(address):
    if address not in blockchain.wallets:
        return jsonify({"error": "Wallet not found"}), 404
    return jsonify({"address": address, "balance": blockchain.get_balance(address),
                    "available": blockchain.get_available_balance(address)})

@app.route("/api/wallet/<address>/history")
def wallet_history(address):
    if address not in blockchain.wallets:
        return jsonify({"error": "Wallet not found"}), 404
    si = blockchain.staking.get_info(address)
    return jsonify({"address": address, "balance": blockchain.get_balance(address),
                    "available": blockchain.get_available_balance(address),
                    "transactions": blockchain.get_wallet_transactions(address),
                    "staking": si})

@app.route("/api/transaction", methods=["POST"])
def new_transaction():
    data = request.get_json(silent=True) or {}
    try:
        amount = float(data["amount"])
    except (KeyError, ValueError, TypeError):
        return jsonify({"success": False, "message": "Invalid amount"}), 400
    result = blockchain.add_transaction(data.get("sender", ""),
                                        data.get("recipient", ""), amount)
    return jsonify(result), 200 if result["success"] else 400

@app.route("/api/mine", methods=["POST"])
def mine():
    data = request.get_json(silent=True) or {}
    miner = data.get("miner_address", ALICE)
    if miner not in blockchain.wallets:
        return jsonify({"success": False, "message": "Unknown miner wallet"}), 400
    if not blockchain.pending_transactions:
        return jsonify({"success": False, "message": "No pending transactions to mine."}), 400
    block = blockchain.mine_block(miner)
    return jsonify({"success": True, "message": f"Block #{block.index} mined!",
                    "block": block.to_dict(), "miner_reward": blockchain.MINING_REWARD,
                    "miner_balance": blockchain.get_balance(miner),
                    "nonce": block.nonce, "block_time": block.block_time})

@app.route("/api/stake", methods=["POST"])
def stake():
    data = request.get_json(silent=True) or {}
    try:
        amount = float(data["amount"])
    except (KeyError, ValueError, TypeError):
        return jsonify({"success": False, "message": "Invalid amount"}), 400
    return jsonify(blockchain.stake_coins(data.get("address", ""), amount))

@app.route("/api/unstake", methods=["POST"])
def unstake():
    data = request.get_json(silent=True) or {}
    return jsonify(blockchain.unstake_coins(data.get("address", "")))

@app.route("/api/stake/claim", methods=["POST"])
def claim_stake():
    data = request.get_json(silent=True) or {}
    return jsonify(blockchain.claim_staking_rewards(data.get("address", "")))

@app.route("/api/staking/<address>")
def staking_info(address):
    return jsonify(blockchain.staking.get_info(address))

@app.route("/api/staking")
def all_staking():
    return jsonify({"stakers": blockchain.staking.all_stakers(),
                    "total_staked": blockchain.staking.total_staked,
                    "apy": blockchain.staking.ANNUAL_RATE * 100})

@app.route("/api/price")
def price():
    points = request.args.get("points", 60, type=int)
    points = max(1, min(points, 200))
    oracle = blockchain.price_oracle
    return jsonify({"current": oracle.current, "change_24h": oracle.change_24h,
                    "high_24h": oracle.high_24h, "low_24h": oracle.low_24h,
                    "history": oracle.get_history(points)})

@app.route("/api/leaderboard")
def leaderboard():
    return jsonify({"leaderboard": blockchain.get_leaderboard()})

@app.route("/api/search")
def search():
    return jsonify(blockchain.search(request.args.get("q", "")))

if __name__ == "__main__":
    print("\\n" + "=" * 55)
    print("  MiniCoin Blockchain v2.0 - ENHANCED EDITION")
    print("=" * 55)
    print("  Open: http://127.0.0.1:5000")
    print("  Demo wallets: Alice, Bob, Charlie, Dave, Eve")
    print("  Demo market data only — no real cryptocurrency.")
    print("=" * 55 + "\\n")
    app.run(debug=False, host="127.0.0.1", port=5000)
