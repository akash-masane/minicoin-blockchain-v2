// ─────────────────────────────────────────────────────
//  MiniCoin Blockchain v2.0 — Frontend App
// ─────────────────────────────────────────────────────

// ── State ────────────────────────────────────────────
let wallets = {};
let stats   = {};
let chartData = [];
let chartPeriod = 24;
let stakingRefreshTimer = null;
let stakeStartTime = null;
let stakeAmountLocal = 0;

// ── API Helpers ──────────────────────────────────────
async function get(path) {
  const res = await fetch(path);
  return res.json();
}
async function post(path, body) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

// ── Toast ─────────────────────────────────────────────
function toast(msg, type = "info") {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = "toast show";
  el.style.borderColor =
    type === "success" ? "rgba(45,206,137,0.5)" :
    type === "error"   ? "rgba(245,54,92,0.5)" : "";
  setTimeout(() => { el.className = "toast"; }, 3500);
}

function showMsg(id, text, type) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.className = "msg " + type;
}

// ── Formatting ───────────────────────────────────────
function timeAgo(ts) {
  const d = Math.floor(Date.now() / 1000 - ts);
  if (d < 60)  return d + "s ago";
  if (d < 3600) return Math.floor(d/60) + "m ago";
  if (d < 86400) return Math.floor(d/3600) + "h ago";
  return Math.floor(d/86400) + "d ago";
}
function shortAddr(a, n = 18) {
  if (!a || a.length <= n) return a;
  return a.slice(0, n) + "…";
}
function fmtNum(n, dec = 4) {
  return parseFloat(n || 0).toFixed(dec);
}
function copyToClipboard(text, e) {
  if (e) e.stopPropagation();
  navigator.clipboard.writeText(text).then(() => toast("Copied!", "success"));
}

// ── TX Type Badge ────────────────────────────────────
function txBadge(type) {
  const labels = {
    transfer: "💸 Transfer",
    mining_reward: "⛏️ Mining",
    staking_reward: "💎 Staking",
    genesis: "🌐 Genesis",
  };
  return `<span class="tx-type-badge ${type}">${labels[type] || type}</span>`;
}

// ── Tab Switch ────────────────────────────────────────
function switchTab(name, btn) {
  document.querySelectorAll(".tab-content").forEach(el => el.classList.remove("active"));
  document.querySelectorAll(".tab").forEach(el => el.classList.remove("active"));
  document.getElementById("tab-" + name).classList.add("active");
  if (btn) btn.classList.add("active");
  refreshTab(name);
}
function refreshTab(name) {
  const fns = {
    dashboard:   loadDashboard,
    wallets:     loadWallets,
    send:        loadSendForm,
    mine:        loadMineTab,
    staking:     loadStaking,
    leaderboard: loadLeaderboard,
    explorer:    loadExplorer,
  };
  if (fns[name]) fns[name]();
}

// ── HEADER ───────────────────────────────────────────
async function updateHeader() {
  const [s, p] = await Promise.all([get("/api/stats"), get("/api/price")]);
  stats = s;

  // Price ticker
  document.getElementById("tickerPrice").textContent = "$" + fmtNum(p.current, 4);
  const chEl = document.getElementById("tickerChange");
  const ch = p.change_24h;
  chEl.textContent = (ch >= 0 ? "+" : "") + ch + "%";
  chEl.className = "ticker-change " + (ch >= 0 ? "up" : "down");

  // Header stats
  document.getElementById("hBlocks").textContent  = s.blocks;
  document.getElementById("hTxs").textContent     = s.total_transactions;
  document.getElementById("hMcap").textContent    = "$" + fmtNum(s.market_cap, 0);
  const hv = document.getElementById("hValid");
  hv.textContent = s.chain_valid ? "✅ Valid" : "❌ Error";
  hv.style.color = s.chain_valid ? "var(--green)" : "var(--red)";
}

// ── DASHBOARD ────────────────────────────────────────
async function loadDashboard() {
  const [s, p, pending, chain] = await Promise.all([
    get("/api/stats"), get("/api/price?points=72"),
    get("/api/pending"), get("/api/chain"),
  ]);
  stats = s;
  chartData = p.history;

  // Market cards
  document.getElementById("mcPrice").textContent  = "$" + fmtNum(p.current, 4);
  const chEl = document.getElementById("mcChange");
  const ch = p.change_24h;
  chEl.textContent = (ch >= 0 ? "▲ +" : "▼ ") + ch + "% (24h)";
  chEl.style.color = ch >= 0 ? "var(--green)" : "var(--red)";
  document.getElementById("mcap").textContent     = "$" + Number(s.market_cap).toLocaleString();
  document.getElementById("mcSupply").textContent = fmtNum(s.total_supply, 0) + " MNC supply";
  document.getElementById("mcHigh").textContent   = "$" + fmtNum(p.high_24h, 4);
  document.getElementById("mcLow").textContent    = "Low: $" + fmtNum(p.low_24h, 4);
  document.getElementById("mcStaked").textContent = fmtNum(s.total_staked, 2) + " MNC";

  // Stat cards
  document.getElementById("statBlocks").textContent  = s.blocks;
  document.getElementById("statPending").textContent = s.pending_transactions;
  document.getElementById("statSupply").textContent  = fmtNum(s.total_supply, 0);
  document.getElementById("statDiff").textContent    = s.difficulty;
  document.getElementById("statReward").textContent  = s.mining_reward;
  document.getElementById("statAvgTime").textContent = s.avg_block_time + "s";

  // Draw chart
  drawChart("priceChart", p.history);

  // Pending
  const pList = document.getElementById("pendingList");
  if (!pending.pending_transactions.length) {
    pList.innerHTML = '<div class="empty-msg">No pending transactions — all confirmed ✅</div>';
  } else {
    pList.innerHTML = pending.pending_transactions.map(tx => `
      <div class="tx-item">
        ${txBadge(tx.tx_type || "transfer")}
        <span class="tx-addr">${shortAddr(tx.sender)} → ${shortAddr(tx.recipient)}</span>
        <span class="tx-amount">${fmtNum(tx.amount, 2)} MNC</span>
      </div>
    `).join("");
  }

  // Recent blocks
  const recent = chain.chain.slice().reverse().slice(0, 6);
  document.getElementById("recentBlocks").innerHTML = recent.map(b => `
    <div class="block-row" onclick="switchTab('explorer', document.querySelectorAll('.tab')[6])">
      <span class="block-num">#${b.index}</span>
      <span class="block-hash">${b.hash}</span>
      <span class="block-txs">${b.transactions.length} tx</span>
      <span class="block-bt">${b.block_time ? b.block_time + "s" : "—"}</span>
      <span class="block-time">${timeAgo(b.timestamp)}</span>
    </div>
  `).join("");
}

// ── PRICE CHART (Canvas) ──────────────────────────────
function setChartPeriod(pts, btn) {
  chartPeriod = pts;
  document.querySelectorAll(".chart-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  if (chartData.length) drawChart("priceChart", chartData.slice(-pts));
}

function drawChart(canvasId, data) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !data || data.length < 2) return;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width  = rect.width  * dpr;
  canvas.height = rect.height * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  const W = rect.width, H = rect.height;
  const pad = { top: 16, bottom: 28, left: 52, right: 16 };
  const iW = W - pad.left - pad.right;
  const iH = H - pad.top - pad.bottom;

  const prices = data.map(d => d.price);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const rng  = maxP - minP || 0.01;
  const xp = (i) => pad.left + (i / (data.length - 1)) * iW;
  const yp = (p)  => pad.top + iH - ((p - minP) / rng) * iH;

  ctx.clearRect(0, 0, W, H);

  // Grid lines
  ctx.strokeStyle = "rgba(99,130,255,0.07)";
  ctx.lineWidth   = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (i / 4) * iH;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
    const label = (maxP - (i / 4) * rng).toFixed(3);
    ctx.fillStyle = "rgba(136,146,176,0.7)";
    ctx.font = "11px JetBrains Mono, monospace";
    ctx.textAlign = "right";
    ctx.fillText("$" + label, pad.left - 6, y + 4);
  }

  // Gradient fill
  const grad = ctx.createLinearGradient(0, pad.top, 0, H - pad.bottom);
  grad.addColorStop(0, "rgba(99,130,255,0.35)");
  grad.addColorStop(1, "rgba(99,130,255,0.00)");

  ctx.beginPath();
  data.forEach((d, i) => {
    const x = xp(i), y = yp(d.price);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.lineTo(xp(data.length - 1), H - pad.bottom);
  ctx.lineTo(xp(0), H - pad.bottom);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Price line
  const isUp = prices[prices.length - 1] >= prices[0];
  ctx.beginPath();
  data.forEach((d, i) => {
    const x = xp(i), y = yp(d.price);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.strokeStyle = isUp ? "#2dce89" : "#f5365c";
  ctx.lineWidth   = 2.2;
  ctx.lineJoin    = "round";
  ctx.stroke();

  // Endpoint dot
  const ex = xp(data.length - 1), ey = yp(prices[prices.length - 1]);
  ctx.beginPath();
  ctx.arc(ex, ey, 5, 0, Math.PI * 2);
  ctx.fillStyle   = isUp ? "#2dce89" : "#f5365c";
  ctx.shadowColor = isUp ? "#2dce89" : "#f5365c";
  ctx.shadowBlur  = 12;
  ctx.fill();
  ctx.shadowBlur  = 0;

  // Time labels
  ctx.fillStyle  = "rgba(136,146,176,0.6)";
  ctx.font       = "10px Outfit, sans-serif";
  ctx.textAlign  = "center";
  const labelCount = Math.min(6, data.length);
  for (let i = 0; i < labelCount; i++) {
    const idx  = Math.floor(i * (data.length - 1) / (labelCount - 1));
    const d    = new Date(data[idx].time * 1000);
    const lbl  = d.getHours() + ":00";
    ctx.fillText(lbl, xp(idx), H - pad.bottom + 16);
  }

  // Hover interaction
  canvas._data = data;
  canvas._pad  = pad;
  canvas._dim  = { W, H, iW, iH, minP, rng };
}

// ── WALLETS ──────────────────────────────────────────
async function loadWallets() {
  const data = await get("/api/wallets");
  wallets = data.wallets;
  renderWallets();
}

function renderWallets() {
  const entries = Object.entries(wallets);
  document.getElementById("walletCount").textContent = entries.length;
  if (!entries.length) {
    document.getElementById("walletList").innerHTML =
      '<div class="empty-msg">No wallets yet. Create one above!</div>';
    return;
  }
  document.getElementById("walletList").innerHTML = entries.map(([addr, bal]) => `
    <div class="wallet-card" onclick="showWalletModal('${addr}')">
      <button class="copy-btn" onclick="copyToClipboard('${addr}', event)">📋</button>
      <div class="wallet-addr">${addr}</div>
      <div class="wallet-balance">${fmtNum(bal, 2)}</div>
      <div class="wallet-mnc">MiniCoins (MNC)</div>
      <div class="wallet-staking-tag" id="ws-${addr}" style="display:none">💎 Staking</div>
    </div>
  `).join("");

  // Mark staking wallets
  get("/api/staking").then(d => {
    Object.keys(d.stakers).forEach(addr => {
      const el = document.getElementById("ws-" + addr);
      if (el) el.style.display = "inline-flex";
    });
  });
}

async function createWallet() {
  const name = document.getElementById("walletName").value.trim() || "Wallet";
  const data = await post("/api/wallet/create", { name });
  if (data.success) {
    showMsg("walletCreateMsg", "✅ " + data.message, "success");
    toast("Wallet created!", "success");
    document.getElementById("walletName").value = "";
    loadWallets();
    loadSendForm();
    loadMineTab();
    loadStaking();
  } else {
    showMsg("walletCreateMsg", "❌ " + data.message, "error");
  }
}

// ── WALLET MODAL ─────────────────────────────────────
async function showWalletModal(address) {
  const data = await get(`/api/wallet/${address}/history`);
  document.getElementById("walletModal").classList.remove("hidden");
  document.getElementById("modalAddr").textContent = address;
  document.getElementById("modalBal").textContent  = fmtNum(data.balance, 4) + " MNC";
  document.getElementById("modalAvail").textContent = fmtNum(data.available, 4) + " MNC";

  const txList = document.getElementById("modalTxList");
  if (!data.transactions.length) {
    txList.innerHTML = '<div class="empty-msg">No transactions yet.</div>';
  } else {
    txList.innerHTML = data.transactions.map(tx => {
      const isIn = tx.recipient === address;
      return `
        <div class="tx-item">
          ${txBadge(tx.tx_type || "transfer")}
          <span class="tx-addr">${isIn ? "← " + shortAddr(tx.sender) : "→ " + shortAddr(tx.recipient)}</span>
          <span class="tx-amount" style="color:${isIn ? "var(--green)" : "var(--red)"}">
            ${isIn ? "+" : "-"}${fmtNum(tx.amount, 4)} MNC
          </span>
        </div>`;
    }).join("");
  }
}
function closeWalletModal() {
  document.getElementById("walletModal").classList.add("hidden");
}
function closeModal(e) {
  if (e.target === document.getElementById("walletModal")) closeWalletModal();
}

// ── SEND ─────────────────────────────────────────────
async function loadSendForm() {
  const data = await get("/api/wallets");
  wallets = data.wallets;
  const opts = Object.entries(wallets).map(([a, b]) =>
    `<option value="${a}">${a} (${fmtNum(b,2)} MNC)</option>`).join("");
  document.getElementById("sendFrom").innerHTML = opts;
  document.getElementById("sendTo").innerHTML   = opts;
  if (document.getElementById("sendTo").options.length > 1)
    document.getElementById("sendTo").selectedIndex = 1;
  updateSenderBal();
  document.getElementById("sendFrom").addEventListener("change", updateSenderBal);
}

async function updateSenderBal() {
  const addr = document.getElementById("sendFrom")?.value;
  if (!addr) return;
  const d = await get(`/api/wallet/${addr}/balance`);
  document.getElementById("senderBalance").textContent = fmtNum(d.available, 4);
}

function setMaxAmount() {
  const bal = document.getElementById("senderBalance").textContent;
  document.getElementById("sendAmount").value = parseFloat(bal) || 0;
}

async function sendTransaction() {
  const sender    = document.getElementById("sendFrom").value;
  const recipient = document.getElementById("sendTo").value;
  const amount    = parseFloat(document.getElementById("sendAmount").value);

  if (!amount || isNaN(amount) || amount <= 0)
    return showMsg("sendMsg", "❌ Enter a valid amount.", "error");
  if (sender === recipient)
    return showMsg("sendMsg", "❌ Cannot send to yourself.", "error");

  const data = await post("/api/transaction", { sender, recipient, amount });
  if (data.success) {
    showMsg("sendMsg", `✅ ${data.message} TX: ${data.tx_id}`, "success");
    toast("Transaction queued! Mine a block to confirm.", "success");
    document.getElementById("sendAmount").value = "";
    updateSenderBal();
    updateHeader();
  } else {
    showMsg("sendMsg", "❌ " + data.message, "error");
  }
}

// ── MINE ─────────────────────────────────────────────
async function loadMineTab() {
  const [s, data] = await Promise.all([get("/api/stats"), get("/api/wallets")]);
  stats = s; wallets = data.wallets;
  document.getElementById("mDiff").textContent    = s.difficulty;
  document.getElementById("mReward").textContent  = s.mining_reward + " MNC";
  document.getElementById("mPending").textContent = s.pending_transactions;
  document.getElementById("mAvgTime").textContent = s.avg_block_time + "s";
  document.getElementById("diffZeros").textContent = s.difficulty;

  const sel = document.getElementById("minerWallet");
  sel.innerHTML = Object.entries(wallets).map(([a, b]) =>
    `<option value="${a}">${a} (${fmtNum(b,2)} MNC)</option>`).join("");
  updateMinerBal();
  sel.addEventListener("change", updateMinerBal);
}

async function updateMinerBal() {
  const addr = document.getElementById("minerWallet")?.value;
  if (!addr) return;
  const d = await get(`/api/wallet/${addr}/balance`);
  document.getElementById("minerBalance").textContent = fmtNum(d.balance, 4);
}

async function mineBlock() {
  const miner  = document.getElementById("minerWallet").value;
  const btn    = document.getElementById("mineBtn");
  const anim   = document.getElementById("miningAnimation");
  const result = document.getElementById("minedResult");

  const pending = await get("/api/pending");
  if (pending.count === 0)
    return showMsg("mineMsg", "⚠️ No pending transactions. Send some coins first!", "error");

  btn.disabled = true;
  anim.classList.remove("hidden");
  result.classList.add("hidden");
  document.getElementById("mineMsg").className = "msg";

  // Fake hash animation
  const hashInterval = setInterval(() => {
    const fake = Array.from({length:64}, () => "0123456789abcdef"[Math.floor(Math.random()*16)]).join("");
    const hp = document.getElementById("hashPreview");
    if (hp) hp.textContent = "0000" + fake.slice(4);
  }, 120);

  try {
    const data = await post("/api/mine", { miner_address: miner });
    clearInterval(hashInterval);
    anim.classList.add("hidden");

    if (data.success) {
      const b = data.block;
      result.classList.remove("hidden");
      result.innerHTML = `
        <h4>🎉 Block #${b.index} Mined!</h4>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-top:10px">
          <div><div style="font-size:0.7rem;color:var(--text2);text-transform:uppercase">Nonce</div>
               <div style="font-family:JetBrains Mono;font-size:1rem;font-weight:700;color:var(--accent)">${b.nonce.toLocaleString()}</div></div>
          <div><div style="font-size:0.7rem;color:var(--text2);text-transform:uppercase">Block Time</div>
               <div style="font-family:JetBrains Mono;font-size:1rem;font-weight:700;color:var(--accent3)">${data.block_time}s</div></div>
          <div><div style="font-size:0.7rem;color:var(--text2);text-transform:uppercase">Reward</div>
               <div style="font-family:JetBrains Mono;font-size:1rem;font-weight:700;color:var(--gold)">${data.miner_reward} MNC</div></div>
          <div><div style="font-size:0.7rem;color:var(--text2);text-transform:uppercase">New Balance</div>
               <div style="font-family:JetBrains Mono;font-size:1rem;font-weight:700;color:var(--green)">${data.miner_balance} MNC</div></div>
        </div>
        <div style="margin-top:12px;font-size:0.68rem;color:var(--text2)">Hash:</div>
        <div class="mined-hash">${b.hash}</div>`;
      toast(`Block #${b.index} mined! +${data.miner_reward} MNC`, "success");
      updateHeader();
      loadMineTab();
    } else {
      showMsg("mineMsg", "❌ " + data.message, "error");
    }
  } catch (e) {
    clearInterval(hashInterval);
    anim.classList.add("hidden");
    showMsg("mineMsg", "❌ Mining error. Try again.", "error");
  }
  btn.disabled = false;
}

// ── STAKING ──────────────────────────────────────────
async function loadStaking() {
  const [s, wData, stData] = await Promise.all([
    get("/api/stats"), get("/api/wallets"), get("/api/staking"),
  ]);
  stats = s; wallets = wData.wallets;

  document.getElementById("stakeNetTotal").textContent = fmtNum(stData.total_staked, 2) + " MNC";
  document.getElementById("stakeStakers").textContent  = Object.keys(stData.stakers).length;

  const sel = document.getElementById("stakeWallet");
  sel.innerHTML = Object.entries(wallets).map(([a, b]) =>
    `<option value="${a}">${a} (${fmtNum(b,2)} MNC)</option>`).join("");
  sel.addEventListener("change", loadStakingInfo);
  loadStakingInfo();

  // All stakers
  const entries = Object.entries(stData.stakers);
  document.getElementById("allStakers").innerHTML = entries.length
    ? entries.map(([addr, info]) => `
        <div class="staker-item">
          <span style="font-size:1.2rem">💎</span>
          <span class="staker-addr">${addr}</span>
          <span class="staker-amt">${fmtNum(info.amount, 2)} MNC</span>
          <span class="staker-rewards">+${fmtNum(info.pending_rewards, 6)} earned</span>
        </div>`).join("")
    : '<div class="empty-msg">No active stakers yet.</div>';
}

async function loadStakingInfo() {
  const addr = document.getElementById("stakeWallet")?.value;
  if (!addr) return;

  const [bData, sData] = await Promise.all([
    get(`/api/wallet/${addr}/balance`),
    get(`/api/staking/${addr}`),
  ]);

  document.getElementById("stakeAvail").textContent = fmtNum(bData.available, 4);

  const card    = document.getElementById("stakeInfoCard");
  const claimBtn  = document.getElementById("claimBtn");
  const unstakeBtn = document.getElementById("unstakeBtn");

  if (sData.staked) {
    card.style.display = "block";
    document.getElementById("ssStaked").textContent  = fmtNum(sData.amount, 4) + " MNC";
    document.getElementById("ssEarned").textContent  = fmtNum(sData.total_earned, 6) + " MNC";
    document.getElementById("ssApy").textContent     = sData.apy + "%";
    claimBtn.disabled  = false;
    unstakeBtn.disabled = false;
    stakeStartTime  = Date.now() - (Date.now() - sData.start_time * 1000);
    stakeAmountLocal = sData.amount;
    startRewardTicker(sData);
  } else {
    card.style.display = "none";
    claimBtn.disabled  = true;
    unstakeBtn.disabled = true;
    stopRewardTicker();
  }
}

function startRewardTicker(sData) {
  stopRewardTicker();
  const rate = 0.12 / (365 * 24 * 3600);
  const start = Date.now();
  const initialPending = sData.pending_rewards;

  stakingRefreshTimer = setInterval(() => {
    const elapsed = (Date.now() - start) / 1000;
    const earned  = initialPending + sData.amount * rate * elapsed;
    const el = document.getElementById("rewardTicker");
    if (el) {
      el.textContent = "+" + fmtNum(earned, 6) + " MNC earned (live)";
      document.getElementById("ssPending").textContent = fmtNum(earned, 6) + " MNC";
    }
  }, 500);
}

function stopRewardTicker() {
  if (stakingRefreshTimer) { clearInterval(stakingRefreshTimer); stakingRefreshTimer = null; }
}

function setStakeMax() {
  const avail = document.getElementById("stakeAvail").textContent;
  document.getElementById("stakeAmount").value = Math.floor(parseFloat(avail)) || 0;
  previewApy();
}

document.addEventListener("input", e => {
  if (e.target.id === "stakeAmount") previewApy();
});

function previewApy() {
  const amt = parseFloat(document.getElementById("stakeAmount")?.value);
  const prev = document.getElementById("apyPreview");
  if (!prev) return;
  if (!amt || isNaN(amt) || amt <= 0) { prev.textContent = "Enter an amount to see projected rewards."; return; }
  const daily   = (amt * 0.12 / 365).toFixed(4);
  const monthly = (amt * 0.12 / 12).toFixed(2);
  const yearly  = (amt * 0.12).toFixed(2);
  prev.innerHTML = `📈 Projected: <strong>${daily}</strong> MNC/day · <strong>${monthly}</strong>/month · <strong>${yearly}</strong>/year`;
}

async function stakeCoins() {
  const addr   = document.getElementById("stakeWallet").value;
  const amount = parseFloat(document.getElementById("stakeAmount").value);
  if (!amount || isNaN(amount) || amount < 1)
    return showMsg("stakeMsg", "❌ Minimum stake is 1 MNC.", "error");
  const data = await post("/api/stake", { address: addr, amount });
  if (data.success) {
    showMsg("stakeMsg", "✅ " + data.message, "success");
    toast("Staked successfully! Earning 12% APY.", "success");
    document.getElementById("stakeAmount").value = "";
    loadStaking();
    updateHeader();
  } else {
    showMsg("stakeMsg", "❌ " + data.message, "error");
  }
}

async function claimRewards() {
  const addr = document.getElementById("stakeWallet").value;
  const data = await post("/api/stake/claim", { address: addr });
  if (data.success) {
    showMsg("stakeMsg", `✅ Claimed ${data.rewards} MNC rewards! Mine a block to confirm.`, "success");
    toast("Rewards claimed! Mine a block to confirm.", "success");
    loadStaking();
  } else {
    showMsg("stakeMsg", "❌ " + data.message, "error");
  }
}

async function unstakeCoins() {
  const addr = document.getElementById("stakeWallet").value;
  if (!confirm("Unstake all MNC? Pending rewards will be credited.")) return;
  const data = await post("/api/unstake", { address: addr });
  if (data.success) {
    showMsg("stakeMsg",
      `✅ Unstaked ${data.returned} MNC. Rewards: ${data.rewards} MNC (mine to confirm)`, "success");
    toast("Unstaked! Mine a block to receive rewards.", "success");
    loadStaking();
    updateHeader();
  } else {
    showMsg("stakeMsg", "❌ " + data.message, "error");
  }
}

// ── LEADERBOARD ──────────────────────────────────────
async function loadLeaderboard() {
  const data = await get("/api/leaderboard");
  const medals = ["🥇", "🥈", "🥉"];
  const tbody = document.getElementById("lbBody");
  tbody.innerHTML = data.leaderboard.map((w, i) => `
    <tr onclick="showWalletModal('${w.address}')" style="cursor:pointer">
      <td class="lb-rank">${medals[i] || "#" + (i + 1)}</td>
      <td><div class="lb-addr" title="${w.address}">${w.address}</div></td>
      <td class="lb-bal">${fmtNum(w.balance, 2)}</td>
      <td class="lb-staked">${w.staked > 0 ? fmtNum(w.staked, 2) : "—"}</td>
      <td class="lb-total">${fmtNum(w.total_worth, 2)}</td>
      <td style="color:var(--text2)">${w.tx_count}</td>
      <td>${w.is_staking ? '<span class="lb-staking-badge">💎 Staking</span>' : "—"}</td>
    </tr>`).join("");
}

// ── EXPLORER ─────────────────────────────────────────
async function loadExplorer() {
  const [val, chain] = await Promise.all([get("/api/validate"), get("/api/chain")]);

  const banner = document.getElementById("chainValidityBanner");
  banner.textContent = val.valid ? "✅ " + val.message : "❌ " + val.message;
  banner.className   = "validity-banner " + (val.valid ? "valid" : "invalid");

  document.getElementById("blockExplorer").innerHTML = chain.chain.slice().reverse().map(b => `
    <div class="explorer-block">
      <div class="explorer-block-header" onclick="toggleBlock('eb-${b.index}')">
        <span class="exp-block-num">#${b.index}</span>
        <span class="exp-block-hash">${b.hash}</span>
        <span class="exp-txs">${b.transactions.length} txs</span>
        ${b.block_time ? `<span class="exp-block-time">${b.block_time}s</span>` : ""}
        <span class="exp-time">${timeAgo(b.timestamp)}</span>
        <span class="exp-toggle" id="tog-eb-${b.index}">▼</span>
      </div>
      <div class="explorer-block-body" id="eb-${b.index}">
        <div class="exp-field"><strong>Index</strong> <span>${b.index}</span></div>
        <div class="exp-field"><strong>Time</strong> <span>${new Date(b.timestamp*1000).toLocaleString()}</span></div>
        <div class="exp-field"><strong>Hash</strong> <span>${b.hash}</span></div>
        <div class="exp-field"><strong>Prev Hash</strong> <span>${b.previous_hash}</span></div>
        <div class="exp-field"><strong>Nonce</strong> <span>${b.nonce.toLocaleString()}</span></div>
        ${b.block_time ? `<div class="exp-field"><strong>Block Time</strong> <span>${b.block_time}s</span></div>` : ""}
        <div class="exp-txs-list">
          <div style="font-size:0.72rem;color:var(--text2);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Transactions</div>
          ${b.transactions.map(tx => `
            <div class="exp-tx-item">
              ${txBadge(tx.tx_type || "transfer")}
              <span class="exp-tx-addr">${tx.sender} → ${tx.recipient}</span>
              <span class="exp-tx-amt">${fmtNum(tx.amount,2)} MNC</span>
            </div>`).join("")}
        </div>
      </div>
    </div>`).join("");
}

function toggleBlock(id) {
  const body = document.getElementById(id);
  const tog  = document.getElementById("tog-" + id);
  const open = body.classList.toggle("open");
  if (tog) tog.textContent = open ? "▲" : "▼";
}

// ── SEARCH ───────────────────────────────────────────
async function searchChain() {
  const q = document.getElementById("searchInput").value.trim();
  if (!q) return;
  const data = await get(`/api/search?q=${encodeURIComponent(q)}`);
  const res  = document.getElementById("searchResults");
  res.classList.remove("hidden");
  const total = data.blocks.length + data.transactions.length + data.wallets.length;
  if (total === 0) {
    res.innerHTML = '<div class="card"><div class="empty-msg">No results found.</div></div>';
    return;
  }
  let html = '<div class="card">';
  if (data.blocks.length) {
    html += `<div class="search-result-section"><div class="search-result-title">Blocks (${data.blocks.length})</div>`;
    html += data.blocks.map(b => `
      <div class="search-result-item">Block <strong>#${b.index}</strong> — ${b.hash}</div>`).join("") + "</div>";
  }
  if (data.transactions.length) {
    html += `<div class="search-result-section"><div class="search-result-title">Transactions (${data.transactions.length})</div>`;
    html += data.transactions.map(tx => `
      <div class="search-result-item">
        ${txBadge(tx.tx_type || "transfer")} Block #${tx.block_index} —
        <span style="font-family:JetBrains Mono;font-size:0.78rem">${tx.sender} → ${tx.recipient}</span>
        <strong style="color:var(--gold);margin-left:8px">${fmtNum(tx.amount,2)} MNC</strong>
      </div>`).join("") + "</div>";
  }
  if (data.wallets.length) {
    html += `<div class="search-result-section"><div class="search-result-title">Wallets (${data.wallets.length})</div>`;
    html += data.wallets.map(w => `
      <div class="search-result-item" onclick="showWalletModal('${w.address}')" style="cursor:pointer">
        ${w.address} — <strong style="color:var(--gold)">${fmtNum(w.balance,4)} MNC</strong>
      </div>`).join("") + "</div>";
  }
  res.innerHTML = html + "</div>";
}

document.addEventListener("keydown", e => {
  if (e.key === "Enter" && document.activeElement?.id === "searchInput") searchChain();
  if (e.key === "Escape") closeWalletModal();
});

// ── AUTO REFRESH ─────────────────────────────────────
function autoRefresh() {
  const active = document.querySelector(".tab-content.active")?.id;
  if (active === "tab-dashboard") loadDashboard();
  updateHeader();
}

// ── INIT ─────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  loadDashboard();
  updateHeader();
  setInterval(autoRefresh, 8000);
});

// Canvas resize handler
window.addEventListener("resize", () => {
  if (chartData.length) drawChart("priceChart", chartData.slice(-chartPeriod));
});
