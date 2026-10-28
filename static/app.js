
"use strict";
let state = {chain: [], stats: {}, wallets: {}, pending: [], price: {}, staking: {}, leaderboard: []};
let chartPeriod = 24;
const $ = id => document.getElementById(id);
const fmt = n => Number(n || 0).toLocaleString("en-US", {maximumFractionDigits: 4});
const short = s => String(s || "").length > 18 ? String(s).slice(0, 9) + "…" + String(s).slice(-5) : String(s || "");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
async function api(url, method="GET", body=null) {
  const opts = {method, headers: {"Content-Type":"application/json"}};
  if (body !== null) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const d = await r.json();
  if (!r.ok) throw new Error(d.message || d.error || "Request failed");
  return d;
}
function toast(message, kind="success") {
  const el=$("toast"); if(!el) return;
  el.textContent=message; el.className="toast show " + kind;
  clearTimeout(toast._timer); toast._timer=setTimeout(()=>el.className="toast",3500);
}
function showMsg(id, message, kind="success") {
  const el=$(id); if(!el)return;
  el.textContent=message; el.className="msg "+kind;
}
function switchTab(name, button) {
  document.querySelectorAll(".tab-content").forEach(el=>el.classList.toggle("active",el.id==="tab-"+name));
  document.querySelectorAll(".tab").forEach(el=>el.classList.toggle("active",el===button || (button && el.textContent.toLowerCase().includes(name))));
  if(name==="explorer") renderExplorer();
  if(name==="staking") loadStaking();
}
function walletOptions(selected) {
  const wallets=Object.keys(state.wallets||{});
  return wallets.map(a=>`<option value="${esc(a)}" ${a===selected?"selected":""}>${esc(a.split("_")[0]||a)} · ${fmt(state.wallets[a])} MNC</option>`).join("");
}
function setSelect(id, selected) {
  const el=$(id); if(!el)return;
  const previous=selected || el.value;
  el.innerHTML=walletOptions(previous);
  if(previous && state.wallets[previous]!==undefined)el.value=previous;
}
function renderWallets() {
  const list=$("walletList"); if(!list)return;
  const entries=Object.entries(state.wallets||{});
  $("walletCount").textContent=entries.length;
  list.innerHTML=entries.map(([addr,balance])=>`<article class="wallet-card" onclick="openWallet('${esc(addr)}')"><div class="wallet-card-top"><span class="wallet-icon">👛</span><span class="wallet-tag">DEMO WALLET</span></div><div class="wallet-name">${esc(addr.split("_")[0]||"Wallet")}</div><div class="wallet-address">${esc(addr)}</div><div class="wallet-balance">${fmt(balance)} <small>MNC</small></div><button class="btn btn-outline" onclick="event.stopPropagation();openWallet('${esc(addr)}')">View details</button></article>`).join("") || '<div class="empty-msg">No wallets yet.</div>';
  ["sendFrom","sendTo","minerWallet","stakeWallet"].forEach(id=>setSelect(id));
  updateSenderBal(); updateMinerBal(); loadStakingInfo();
}
function renderStats() {
  const s=state.stats||{}, p=state.price||{};
  const set=(id,v)=>{if($(id))$(id).textContent=v;};
  set("hBlocks",s.blocks??state.chain.length);
  set("hTxs",s.total_transactions??0);
  set("hMcap","$"+fmt((p.current||0)*(s.total_supply||0)));
  set("hValid",s.chain_valid?"✓ Valid":"⚠ Invalid");
  set("tickerPrice","$"+Number(p.current||0).toFixed(4));
  const change=Number(p.change_24h||0);
  set("tickerChange",(change>=0?"+":"")+change.toFixed(2)+"%");
  if($("tickerChange"))$("tickerChange").className="ticker-change "+(change>=0?"up":"down");
  set("mcPrice","$"+Number(p.current||0).toFixed(4));
  set("mcChange",(change>=0?"▲ +":"▼ ")+Math.abs(change).toFixed(2)+"% (24h)");
  set("mcap","$"+fmt((p.current||0)*(s.total_supply||0)));
  set("mcSupply",fmt(s.total_supply)+" MNC supply");
  set("mcHigh","$"+Number(p.high_24h||0).toFixed(4));
  set("mcLow","Low: $"+Number(p.low_24h||0).toFixed(4));
  set("mcStaked",fmt(state.staking.total_staked)+" MNC");
  set("statBlocks",s.blocks??state.chain.length);
  set("statPending",s.pending_transactions??state.pending.length);
  set("statSupply",fmt(s.total_supply));
  set("statDiff",s.difficulty??4);
  set("statReward",fmt(s.mining_reward??50));
  set("statAvgTime",fmt(s.avg_block_time)+"s");
  set("mDiff",s.difficulty??4);set("mReward",fmt(s.mining_reward??50));
  set("mPending",s.pending_transactions??state.pending.length);set("mAvgTime",fmt(s.avg_block_time)+"s");
  set("stakeNetTotal",fmt(state.staking.total_staked)+" MNC");
  set("stakeStakers",Object.keys(state.staking.stakers||{}).length);
  set("diffZeros",s.difficulty??4);
}
function txLabel(tx) {
  const typ=tx.tx_type||"transfer";
  return `<span class="tx-type-badge ${esc(typ)}">${esc(typ.replaceAll("_"," "))}</span>`;
}
function renderPending() {
  const el=$("pendingList"); if(!el)return;
  el.innerHTML=state.pending.length?state.pending.map(t=>`<div class="tx-item">${txLabel(t)}<span class="tx-addr">${esc(short(t.sender))} → ${esc(short(t.recipient))}</span><span class="tx-amount">${fmt(t.amount)} MNC</span></div>`).join(""):'<div class="empty-msg">No pending transactions. All confirmed ✅</div>';
}
function renderBlocks() {
  const blocks=[...(state.chain||[])].reverse();
  const html=blocks.map(b=>`<article class="block-card"><div class="block-head"><strong>Block #${b.index}</strong><span class="block-time">${Number(b.block_time||0).toFixed(3)}s</span></div><div class="block-hash">Hash: <code>${esc(b.hash)}</code></div><div class="block-meta"><span>🔗 ${b.transactions?.length||0} transactions</span><span>Nonce: ${b.nonce}</span></div><button class="btn btn-outline" onclick="showBlock(${b.index})">View block</button></article>`).join("");
  if($("recentBlocks"))$("recentBlocks").innerHTML=html;
  if($("blockExplorer"))$("blockExplorer").innerHTML=html;
}
function renderLeaderboard() {
  const el=$("lbBody");if(!el)return;
  const entries=state.leaderboard||[];
  el.innerHTML=entries.map((w,i)=>`<tr><td>${i+1}</td><td>${esc(w.address||w.wallet||"")}</td><td>${fmt(w.balance??w.total_worth)}</td><td>${fmt(w.staked||0)}</td></tr>`).join("") || '<tr><td colspan="4">No leaderboard data.</td></tr>';
}
function drawChart() {
  const canvas=$("priceChart"); if(!canvas)return;
  const ctx=canvas.getContext("2d"), rect=canvas.getBoundingClientRect(), dpr=window.devicePixelRatio||1;
  const w=Math.max(rect.width,300), h=220;
  canvas.width=w*dpr; canvas.height=h*dpr;ctx.scale(dpr,dpr);ctx.clearRect(0,0,w,h);
  const pts=(state.price.history||[]).slice(-chartPeriod);
  if(pts.length<2){ctx.fillStyle="#8892b0";ctx.fillText("Price history loading…",20,30);return;}
  const values=pts.map(p=>Number(p.price)); const min=Math.min(...values)*.985,max=Math.max(...values)*1.015;
  const pad={l:42,r:12,t:12,b:25}, cw=w-pad.l-pad.r,ch=h-pad.t-pad.b;
  ctx.font="11px JetBrains Mono, monospace";ctx.strokeStyle="rgba(100,130,255,.14)";ctx.fillStyle="#8892b0";
  for(let i=0;i<4;i++){let y=pad.t+ch*i/3;ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(w-pad.r,y);ctx.stroke();ctx.fillText("$"+(max-(max-min)*i/3).toFixed(2),3,y+4);}
  const coords=values.map((v,i)=>({x:pad.l+cw*i/(values.length-1),y:pad.t+ch*(max-v)/(max-min)}));
  const grad=ctx.createLinearGradient(0,pad.t,0,h);grad.addColorStop(0,"rgba(99,130,255,.35)");grad.addColorStop(1,"rgba(99,130,255,0)");
  ctx.beginPath();coords.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.lineTo(coords.at(-1).x,pad.t+ch);ctx.lineTo(coords[0].x,pad.t+ch);ctx.closePath();ctx.fillStyle=grad;ctx.fill();
  ctx.beginPath();coords.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.strokeStyle="#19d99a";ctx.lineWidth=2;ctx.stroke();
  ctx.fillStyle="#19d99a";ctx.beginPath();ctx.arc(coords.at(-1).x,coords.at(-1).y,4,0,Math.PI*2);ctx.fill();
}
function setChartPeriod(hours,button) {
  chartPeriod=hours;document.querySelectorAll(".chart-btn").forEach(b=>b.classList.toggle("active",b===button));
  api("/api/price?points="+hours).then(p=>{state.price=p;drawChart();}).catch(()=>drawChart());
}
async function refresh() {
  try {
    const [chain,stats,pending,wallets,price,staking,lb]=await Promise.all([
      api("/api/chain"),api("/api/stats"),api("/api/pending"),api("/api/wallets"),api("/api/price?points=72"),api("/api/staking"),api("/api/leaderboard")
    ]);
    state.chain=chain.chain||[];state.stats=stats;state.pending=pending.pending_transactions||[];
    state.wallets=wallets.wallets||{};state.price=price;state.staking=staking;state.leaderboard=lb.leaderboard||[];
    renderStats();renderWallets();renderPending();renderBlocks();renderLeaderboard();drawChart();
  } catch(e) { toast("Could not load the project: "+e.message,"error"); }
}
async function createWallet() {
  const name=$("walletName").value.trim();if(!name){showMsg("walletCreateMsg","Please enter a wallet name.","error");return;}
  try{const d=await api("/api/wallet/create","POST",{name});$("walletName").value="";showMsg("walletCreateMsg",d.message,"success");await refresh();}
  catch(e){showMsg("walletCreateMsg",e.message,"error");}
}
function updateSenderBal(){const a=$("sendFrom")?.value; if($("senderBalance"))$("senderBalance").textContent=fmt(a?state.wallets[a]:0);}
function updateMinerBal(){const a=$("minerWallet")?.value; if($("minerBalance"))$("minerBalance").textContent=fmt(a?state.wallets[a]:0);}
function setMaxAmount(){const a=$("sendFrom")?.value;if($("sendAmount"))$("sendAmount").value=Math.max(0,Number(state.wallets[a]||0)).toFixed(4);}
async function sendTransaction(){
  const sender=$("sendFrom").value,recipient=$("sendTo").value,amount=$("sendAmount").value;
  try{const d=await api("/api/transaction","POST",{sender,recipient,amount:Number(amount)});showMsg("sendMsg",d.message||"Transaction queued.","success");$("sendAmount").value="";await refresh();}
  catch(e){showMsg("sendMsg",e.message,"error");}
}
async function mineBlock(){
  const btn=$("mineBtn");btn.disabled=true;
  $("miningAnimation")?.classList.remove("hidden");$("minedResult")?.classList.add("hidden");
  showMsg("mineMsg","Mining a block…","info");
  try{
    const d=await api("/api/mine","POST",{miner_address:$("minerWallet").value});
    showMsg("mineMsg",d.message+" Reward: "+fmt(d.miner_reward)+" MNC. Time: "+d.block_time+"s","success");
    if($("minedResult")){$("minedResult").textContent="Block #"+d.block.index+" · nonce "+d.nonce;$("minedResult").classList.remove("hidden");}
    await refresh();
  }catch(e){showMsg("mineMsg",e.message,"error");}
  finally{$("miningAnimation")?.classList.add("hidden");btn.disabled=false;}
}
async function loadStaking(){
  try{state.staking=await api("/api/staking");renderStats();renderStakers();await loadStakingInfo();}
  catch(e){console.warn(e);}
}
function renderStakers(){
  const el=$("allStakers");if(!el)return;
  const rows=Object.entries(state.staking.stakers||{});
  el.innerHTML=rows.map(([addr,s])=>`<div class="tx-item"><span class="tx-addr">${esc(addr)}</span><span>${fmt(s.amount)} MNC</span><span class="tx-amount">${fmt(s.pending_rewards)} reward</span></div>`).join("")||'<div class="empty-msg">No active stakers.</div>';
}
async function loadStakingInfo(){
  const addr=$("stakeWallet")?.value;if(!addr)return;
  try{
    const [bal,info]=await Promise.all([api("/api/wallet/"+encodeURIComponent(addr)+"/balance"),api("/api/staking/"+encodeURIComponent(addr))]);
    $("stakeAvail").textContent=fmt(bal.available);
    $("claimBtn").disabled=!info.staked;
    $("unstakeBtn").disabled=!info.staked;
    $("stakeInfoCard").style.display=info.staked?"block":"none";
    if(info.staked){
      $("ssStaked").textContent=fmt(info.amount);$("ssPending").textContent=fmt(info.pending_rewards);
      $("ssEarned").textContent=fmt(info.total_earned);$("ssApy").textContent=fmt(info.apy)+"%";
    }
    updateApyPreview();
  }catch(e){console.warn(e);}
}
function setStakeMax(){const a=$("stakeWallet")?.value;if($("stakeAmount"))$("stakeAmount").value=Number(state.wallets[a]||0).toFixed(4);updateApyPreview();}
function updateApyPreview(){
  const amt=Number($("stakeAmount")?.value||0),el=$("apyPreview");
  if(el)el.textContent=amt>0?`Estimated annual reward at 12% APY: ${(amt*.12).toFixed(4)} MNC (illustrative).`:"";
}
async function stakeCoins(){
  try{const d=await api("/api/stake","POST",{address:$("stakeWallet").value,amount:Number($("stakeAmount").value)});showMsg("stakeMsg",d.message,"success");await refresh();await loadStaking();}
  catch(e){showMsg("stakeMsg",e.message,"error");}
}
async function unstakeCoins(){
  try{const d=await api("/api/unstake","POST",{address:$("stakeWallet").value});showMsg("stakeMsg",d.message||"Unstaked successfully.","success");await refresh();await loadStaking();}
  catch(e){showMsg("stakeMsg",e.message,"error");}
}
async function claimRewards(){
  try{const d=await api("/api/stake/claim","POST",{address:$("stakeWallet").value});showMsg("stakeMsg",d.message||("Claimed "+fmt(d.rewards)+" MNC"),d.success?"success":"error");await refresh();await loadStaking();}
  catch(e){showMsg("stakeMsg",e.message,"error");}
}
async function renderExplorer(){
  try{const [chain,valid]=await Promise.all([api("/api/chain"),api("/api/validate")]);
    $("chainValidityBanner").textContent=valid.message;$("chainValidityBanner").className="validity-banner "+(valid.valid?"valid":"invalid");
    $("blockExplorer").innerHTML=[...chain.chain].reverse().map(b=>`<article class="block-card"><div class="block-head"><strong>Block #${b.index}</strong><button class="btn btn-outline" onclick="showBlock(${b.index})">Details</button></div><div class="block-hash">Hash: <code>${esc(b.hash)}</code></div><div class="block-meta">Transactions: ${b.transactions.length} · Nonce: ${b.nonce}</div></article>`).join("");
  }catch(e){toast(e.message,"error");}
}
async function searchChain(){
  const q=$("searchInput").value.trim();if(!q){$("searchResults").innerHTML="Enter a block number, transaction ID, or wallet address.";return;}
  try{const d=await api("/api/search?q="+encodeURIComponent(q));let html="";
    html+= (d.blocks||[]).map(b=>`<div class="block-card"><strong>Block #${b.index}</strong><p>${esc(b.hash)}</p></div>`).join("");
    html+= (d.transactions||[]).map(t=>`<div class="tx-item">${esc(t.tx_id)} · ${fmt(t.amount)} MNC · ${esc(t.tx_type)}</div>`).join("");
    html+= (d.wallets||[]).map(w=>`<div class="tx-item">${esc(w.address)} · ${fmt(w.balance)} MNC</div>`).join("");
    $("searchResults").innerHTML=html||'<div class="empty-msg">No matches found.</div>';
  }catch(e){toast(e.message,"error");}
}
async function showBlock(index){
  try{const b=await api("/api/block/"+index);$("searchResults").innerHTML=`<div class="block-card"><h3>Block #${b.index}</h3><p>Hash: <code>${esc(b.hash)}</code></p><p>Previous: <code>${esc(b.previous_hash)}</code></p><p>Nonce: ${b.nonce} · Time: ${b.block_time}s</p><pre>${esc(JSON.stringify(b.transactions,null,2))}</pre></div>`;switchTab("explorer",document.querySelector(".tab[onclick*='explorer']"));}
  catch(e){toast(e.message,"error");}
}
async function openWallet(address){
  try{
    const d=await api("/api/wallet/"+encodeURIComponent(address)+"/history");
    $("modalAddr").textContent=d.address;$("modalBal").textContent=fmt(d.balance);$("modalAvail").textContent=fmt(d.available);
    $("modalTxList").innerHTML=(d.transactions||[]).map(t=>`<div class="tx-item">${txLabel(t)}<span class="tx-addr">${esc(short(t.sender))} → ${esc(short(t.recipient))}</span><span class="tx-amount">${fmt(t.amount)} MNC</span></div>`).join("")||"No transactions.";
    $("walletModal").classList.add("open");
  }catch(e){toast(e.message,"error");}
}
function closeWalletModal(){$("walletModal")?.classList.remove("open");}
function closeModal(event){if(event.target===$("walletModal"))closeWalletModal();}
document.addEventListener("DOMContentLoaded",()=>{
  $("sendFrom")?.addEventListener("change",updateSenderBal);
  $("minerWallet")?.addEventListener("change",updateMinerBal);
  $("stakeWallet")?.addEventListener("change",loadStakingInfo);
  $("stakeAmount")?.addEventListener("input",updateApyPreview);
  $("searchInput")?.addEventListener("keydown",e=>{if(e.key==="Enter")searchChain();});
  $("walletModal")?.addEventListener("click",closeModal);
  refresh();
});
window.addEventListener("resize",()=>drawChart());
