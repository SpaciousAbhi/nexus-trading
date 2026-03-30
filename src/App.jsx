import { useState, useEffect, useRef } from "react";

const C = {
  bg: "#04060d",
  panel: "#080d1a",
  border: "#0e1a2e",
  accent: "#00e5ff",
  green: "#00ff9d",
  red: "#ff3b6b",
  yellow: "#ffd166",
  muted: "#3a4a65",
  text: "#c8d8f0",
  dim: "#5a7090",
};

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Space+Mono:ital,wght@0,400;0,700;1,400&family=Rajdhani:wght@300;400;500;600;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: ${C.bg}; color: ${C.text}; font-family: 'Rajdhani', sans-serif; overflow-x: hidden; }
  ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: ${C.panel}; } ::-webkit-scrollbar-thumb { background: ${C.muted}; border-radius: 2px; }
  .mono { font-family: 'Space Mono', monospace; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
  @keyframes slideIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
  @keyframes glow { 0%,100%{box-shadow:0 0 8px ${C.accent}44} 50%{box-shadow:0 0 24px ${C.accent}88} }
`;

const PAIRS = ["BTC/USDT","ETH/USDT","SOL/USDT","BNB/USDT","DOGE/USDT"];
const STRATEGIES = ["MA Crossover","RSI","Bollinger Bands","MACD"];
const BASE_PRICES = { "BTC/USDT": 67420, "ETH/USDT": 3540, "SOL/USDT": 178, "BNB/USDT": 608, "DOGE/USDT": 0.162 };

function genPrice(base, vol = 0.002) { return +(base * (1 + (Math.random() - 0.5) * vol)).toFixed(4); }

function genCandles(base, n = 60) {
  let p = base;
  return Array.from({ length: n }, (_, i) => {
    const open = p, close = genPrice(p, 0.015);
    const high = Math.max(open, close) * (1 + Math.random() * 0.008);
    const low  = Math.min(open, close) * (1 - Math.random() * 0.008);
    p = close;
    return { t: i, open, close, high, low, vol: Math.random() * 1000 + 200 };
  });
}

function computeEMA(prices, period) {
  const k = 2 / (period + 1);
  const out = [prices[0]];
  for (let i = 1; i < prices.length; i++) out.push(prices[i] * k + out[i - 1] * (1 - k));
  return out;
}

function runBacktest(candles, strategy, params) {
  const closes = candles.map(c => c.close);
  let trades = [], position = null, cash = 10000, holdings = 0;
  const equity = [10000];

  for (let i = 30; i < candles.length; i++) {
    let signal = null;
    const slice = closes.slice(0, i + 1);
    const price = closes[i];

    if (strategy === "MA Crossover") {
      const fast = computeEMA(slice, params.fastMA).at(-1);
      const slow = computeEMA(slice, params.slowMA).at(-1);
      const pFast = computeEMA(slice.slice(0,-1), params.fastMA).at(-1);
      const pSlow = computeEMA(slice.slice(0,-1), params.slowMA).at(-1);
      if (pFast < pSlow && fast > slow) signal = "BUY";
      else if (pFast > pSlow && fast < slow) signal = "SELL";
    } else if (strategy === "RSI") {
      const gains = [], losses = [];
      for (let j = 1; j < 15; j++) { const d = slice[slice.length-j] - slice[slice.length-j-1]; d>0?gains.push(d):losses.push(-d); }
      const rs = (gains.reduce((a,b)=>a+b,0)/14) / ((losses.reduce((a,b)=>a+b,0)/14)||0.001);
      const rsi = 100 - 100/(1+rs);
      if (rsi < params.rsiOversold) signal = "BUY";
      else if (rsi > params.rsiOverbought) signal = "SELL";
    } else if (strategy === "Bollinger Bands") {
      const sl = slice.slice(-20); const mean = sl.reduce((a,b)=>a+b,0)/20;
      const std = Math.sqrt(sl.reduce((a,b)=>a+(b-mean)**2,0)/20);
      if (price < mean - params.bbDev * std) signal = "BUY";
      else if (price > mean + params.bbDev * std) signal = "SELL";
    } else {
      const ema12 = computeEMA(slice, 12).at(-1), ema26 = computeEMA(slice, 26).at(-1);
      const macd = ema12 - ema26;
      const pEma12 = computeEMA(slice.slice(0,-1),12).at(-1), pEma26=computeEMA(slice.slice(0,-1),26).at(-1);
      const pMacd = pEma12-pEma26;
      if (pMacd < 0 && macd > 0) signal = "BUY";
      else if (pMacd > 0 && macd < 0) signal = "SELL";
    }

    if (signal === "BUY" && !position && cash > 0) {
      const qty = (cash * 0.95) / price;
      holdings = qty; cash -= qty * price;
      position = { type:"LONG", entry: price, qty, entryIdx: i };
    } else if (signal === "SELL" && position) {
      const pnl = (price - position.entry) * position.qty;
      cash += holdings * price; holdings = 0;
      trades.push({ ...position, exit: price, pnl: +pnl.toFixed(2), exitIdx: i });
      position = null;
    }
    equity.push(+(cash + holdings * price).toFixed(2));
  }
  const wins = trades.filter(t=>t.pnl>0).length;
  return { trades, equity, winRate: trades.length ? +(wins/trades.length*100).toFixed(1) : 0, totalPnl: +trades.reduce((a,t)=>a+t.pnl,0).toFixed(2), maxDrawdown: +(Math.max(0,...equity.map((_,i)=>i>0?Math.max(...equity.slice(0,i))-equity[i]:0))/100).toFixed(2) };
}

function Badge({ children, color = C.accent }) {
  return <span className="mono" style={{ fontSize:11, padding:"2px 8px", border:`1px solid ${color}44`, borderRadius:2, color, background:`${color}11`, letterSpacing:1 }}>{children}</span>;
}

function Stat({ label, value, color = C.text }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
      <span style={{ fontSize:11, color:C.dim, letterSpacing:2, textTransform:"uppercase" }}>{label}</span>
      <span className="mono" style={{ fontSize:22, color, fontWeight:700, lineHeight:1 }}>{value}</span>
    </div>
  );
}

function MiniChart({ data, color = C.accent, h = 50 }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data), max = Math.max(...data), range = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * 200},${h - ((v - min) / range) * (h - 4)}`).join(" ");
  return (
    <svg width="100%" viewBox={`0 0 200 ${h}`} preserveAspectRatio="none" style={{ display:"block" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" />
      <polyline points={`0,${h} ${pts} 200,${h}`} fill={`${color}18`} stroke="none" />
    </svg>
  );
}

function CandleChart({ candles }) {
  if (!candles.length) return null;
  const W = 600, H = 200, pad = 8;
  const yMax = Math.max(...candles.map(c=>c.high)), yMin = Math.min(...candles.map(c=>c.low)), yRange = yMax - yMin || 1;
  const cw = (W - pad*2) / candles.length;
  const fy = v => H - pad - ((v - yMin) / yRange) * (H - pad*2);
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display:"block" }}>
      {candles.map((c,i) => {
        const x = pad + i * cw + cw * 0.1, bw = cw * 0.8;
        const yO = fy(c.open), yC = fy(c.close);
        const color = c.close >= c.open ? C.green : C.red;
        return (
          <g key={i}>
            <line x1={x+bw/2} y1={fy(c.high)} x2={x+bw/2} y2={fy(c.low)} stroke={color} strokeWidth={0.8} opacity={0.6}/>
            <rect x={x} y={Math.min(yO,yC)} width={bw} height={Math.max(1,Math.abs(yO-yC))} fill={color} opacity={0.85}/>
          </g>
        );
      })}
    </svg>
  );
}

function PnlBars({ trades }) {
  if (!trades.length) return <div style={{color:C.dim, textAlign:"center", padding:16}}>No trades yet</div>;
  const max = Math.max(...trades.map(t=>Math.abs(t.pnl)));
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:4, maxHeight:180, overflowY:"auto" }}>
      {trades.map((t, i) => (
        <div key={i} style={{ display:"flex", alignItems:"center", gap:8, fontSize:11 }}>
          <span className="mono" style={{ color:C.dim, width:20, textAlign:"right" }}>#{i+1}</span>
          <div style={{ flex:1, height:14, background:C.border, borderRadius:1, overflow:"hidden" }}>
            <div style={{ width:`${Math.abs(t.pnl)/max*100}%`, height:"100%", background:t.pnl>0?C.green:C.red, opacity:0.8 }}/>
          </div>
          <span className="mono" style={{ color:t.pnl>0?C.green:C.red, width:72, textAlign:"right" }}>{t.pnl>0?"+":""}{t.pnl.toFixed(0)}</span>
        </div>
      ))}
    </div>
  );
}

function ParamSlider({ label, value, min, max, step=1, onChange }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
      <div style={{ display:"flex", justifyContent:"space-between", fontSize:12 }}>
        <span style={{ color:C.dim, letterSpacing:1 }}>{label}</span>
        <span className="mono" style={{ color:C.accent }}>{value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e=>onChange(+e.target.value)} style={{ width:"100%", accentColor:C.accent, cursor:"pointer" }}/>
    </div>
  );
}

const DEFAULT_PARAMS = {
  "MA Crossover": { fastMA:9, slowMA:21 },
  "RSI": { rsiOversold:30, rsiOverbought:70 },
  "Bollinger Bands": { bbDev:2 },
  "MACD": {},
};

function useOrderStream(pair, active) {
  const [orders, setOrders] = useState([]);
  useEffect(() => {
    if (!active) return;
    const base = BASE_PRICES[pair] || 100;
    const tick = () => {
      const side = Math.random() > 0.5 ? "BUY" : "SELL";
      const price = genPrice(base, 0.001);
      const qty = +(Math.random() * 2 + 0.01).toFixed(4);
      setOrders(prev => [{ id: Date.now(), side, price, qty, t: new Date().toLocaleTimeString() }, ...prev].slice(0, 18));
    };
    const id = setInterval(tick, 600 + Math.random()*600);
    return () => clearInterval(id);
  }, [pair, active]);
  return orders;
}

export default function TradingSystem() {
  const [tab, setTab] = useState("dashboard");
  const [pair, setPair] = useState("BTC/USDT");
  const [strategy, setStrategy] = useState("MA Crossover");
  const [params, setParams] = useState(DEFAULT_PARAMS["MA Crossover"]);
  const [mode, setMode] = useState("spot");
  const [leverage, setLeverage] = useState(5);
  const [botActive, setBotActive] = useState(false);
  const [candles, setCandles] = useState(() => genCandles(BASE_PRICES["BTC/USDT"]));
  const [prices, setPrices] = useState(() => Object.fromEntries(PAIRS.map(p=>[p, BASE_PRICES[p]])));
  const [btResult, setBtResult] = useState(null);
  const [btLoading, setBtLoading] = useState(false);
  const [portfolio, setPortfolio] = useState({ cash:10000, totalPnl:0 });
  const [liveLog, setLiveLog] = useState([]);
  const orders = useOrderStream(pair, tab==="live");

  useEffect(() => {
    const id = setInterval(() => {
      setPrices(prev => Object.fromEntries(PAIRS.map(p=>[p, genPrice(prev[p], 0.0008)])));
      setCandles(prev => {
        const last = prev.at(-1);
        const newClose = genPrice(last.close, 0.003);
        return [...prev.slice(0,-1), { ...last, close:newClose, high:Math.max(last.high,newClose), low:Math.min(last.low,newClose) }];
      });
    }, 800);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!botActive) return;
    const id = setInterval(() => {
      if (Math.random() > 0.7) {
        const action = Math.random()>0.5?"BUY":"SELL";
        const price = prices[pair];
        const qty = +(Math.random()*0.05+0.01).toFixed(4);
        const pnl = action==="SELL" ? +((Math.random()-0.4)*price*qty).toFixed(2) : 0;
        setLiveLog(prev => [{ action, pair, price:price.toFixed(2), qty, pnl, t:new Date().toLocaleTimeString(), mode }, ...prev].slice(0,30));
        if (action==="SELL") setPortfolio(prev => ({...prev, totalPnl:+(prev.totalPnl+pnl).toFixed(2), cash:+(prev.cash+pnl).toFixed(2)}));
      }
    }, 2000);
    return () => clearInterval(id);
  }, [botActive, prices, pair, mode]);

  const handleStrategyChange = s => { setStrategy(s); setParams(DEFAULT_PARAMS[s]); setBtResult(null); };
  const pChange = (key, val) => setParams(p => ({...p, [key]:val}));
  const runBT = () => {
    setBtLoading(true); setBtResult(null);
    setTimeout(() => { setBtResult(runBacktest(genCandles(BASE_PRICES[pair], 120), strategy, params)); setBtLoading(false); }, 600);
  };

  const TAB = (id, label) => (
    <button onClick={()=>setTab(id)} style={{ padding:"8px 20px", background:"none", border:"none", cursor:"pointer", fontSize:13, letterSpacing:2, textTransform:"uppercase", color:tab===id?C.accent:C.dim, borderBottom:tab===id?`2px solid ${C.accent}`:"2px solid transparent", transition:"all .2s", fontFamily:"Rajdhani,sans-serif", fontWeight:600 }}>{label}</button>
  );

  return (
    <div style={{ minHeight:"100vh", background:C.bg }}>
      <style>{css}</style>
      <div style={{ background:C.panel, borderBottom:`1px solid ${C.border}`, padding:"12px 24px", display:"flex", alignItems:"center", gap:16 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:28, height:28, border:`2px solid ${C.accent}`, borderRadius:4, display:"flex", alignItems:"center", justifyContent:"center", animation:"glow 2s infinite" }}>
            <span style={{ color:C.accent, fontSize:14, fontWeight:700 }}>⬡</span>
          </div>
          <div>
            <div style={{ fontFamily:"'Space Mono'", fontSize:13, color:C.accent, letterSpacing:3 }}>NEXUS</div>
            <div style={{ fontSize:9, color:C.dim, letterSpacing:2 }}>TRADING SYSTEM</div>
          </div>
        </div>
        <div style={{ flex:1 }}/>
        <div style={{ display:"flex", gap:16 }}>
          {PAIRS.slice(0,3).map(p => {
            const base = BASE_PRICES[p], cur = prices[p], chg = (((cur-base)/base)*100).toFixed(2);
            return (
              <div key={p} style={{ textAlign:"right" }}>
                <div style={{ fontSize:10, color:C.dim, letterSpacing:1 }}>{p}</div>
                <div className="mono" style={{ fontSize:13, color:chg>=0?C.green:C.red }}>{cur < 1 ? cur.toFixed(4) : cur.toFixed(0)}</div>
              </div>
            );
          })}
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginLeft:16 }}>
          <div style={{ width:6, height:6, borderRadius:"50%", background:botActive?C.green:C.muted, animation:botActive?"pulse 1s infinite":"none" }}/>
          <span style={{ fontSize:11, color:botActive?C.green:C.muted, letterSpacing:1 }}>{botActive?"BOT ACTIVE":"BOT IDLE"}</span>
        </div>
      </div>

      <div style={{ borderBottom:`1px solid ${C.border}`, padding:"0 24px", background:C.panel, display:"flex", gap:4 }}>
        {TAB("dashboard","Dashboard")}{TAB("backtest","Backtest")}{TAB("live","Live Trading")}{TAB("config","Strategy Config")}
      </div>

      <div style={{ padding:20, animation:"slideIn .3s ease" }} key={tab}>

        {tab === "dashboard" && (
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16 }}>
            <div style={{ gridColumn:"1/4", background:C.panel, border:`1px solid ${C.border}`, borderRadius:4, padding:20 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
                <div>
                  <div style={{ fontSize:10, letterSpacing:3, color:C.dim, marginBottom:4 }}>PORTFOLIO OVERVIEW</div>
                  <div className="mono" style={{ fontSize:36, color:C.text, lineHeight:1 }}>${(portfolio.cash+10000).toLocaleString()}</div>
                </div>
                <div style={{ display:"flex", gap:8 }}>
                  <Badge color={mode==="spot"?C.accent:C.yellow}>{mode.toUpperCase()}</Badge>
                  {mode==="futures" && <Badge color={C.yellow}>{leverage}x</Badge>}
                </div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:20, borderTop:`1px solid ${C.border}`, paddingTop:16 }}>
                <Stat label="Total P&L" value={`${portfolio.totalPnl>=0?"+":""}$${portfolio.totalPnl}`} color={portfolio.totalPnl>=0?C.green:C.red}/>
                <Stat label="Cash" value={`$${portfolio.cash.toLocaleString()}`}/>
                <Stat label="Open Positions" value="0" color={C.dim}/>
                <Stat label="Trades Today" value={liveLog.length} color={C.accent}/>
              </div>
            </div>
            <div style={{ gridColumn:"1/3", background:C.panel, border:`1px solid ${C.border}`, borderRadius:4, padding:16 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:12 }}>
                <select value={pair} onChange={e=>setPair(e.target.value)} style={{ background:"none", border:`1px solid ${C.border}`, color:C.text, fontSize:14, padding:"2px 8px", cursor:"pointer", fontFamily:"Rajdhani,sans-serif", outline:"none" }}>
                  {PAIRS.map(p=><option key={p} value={p} style={{background:C.panel}}>{p}</option>)}
                </select>
                <div className="mono" style={{ fontSize:22, color:C.accent }}>{prices[pair]<1?prices[pair].toFixed(4):prices[pair].toFixed(2)}</div>
              </div>
              <CandleChart candles={candles.slice(-40)}/>
            </div>
            <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:4, padding:16 }}>
              <div style={{ fontSize:10, letterSpacing:3, color:C.dim, marginBottom:12 }}>MARKETS</div>
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {PAIRS.map(p => {
                  const base = BASE_PRICES[p], cur = prices[p], chg = (((cur-base)/base)*100).toFixed(2);
                  return (
                    <div key={p} onClick={()=>setPair(p)} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 8px", borderRadius:2, cursor:"pointer", background:pair===p?`${C.accent}11`:undefined, border:pair===p?`1px solid ${C.accent}22`:"1px solid transparent" }}>
                      <div>
                        <div style={{ fontSize:13, fontWeight:600 }}>{p.split("/")[0]}</div>
                        <div style={{ fontSize:10, color:C.dim }}>{p}</div>
                      </div>
                      <div style={{ textAlign:"right" }}>
                        <div className="mono" style={{ fontSize:12 }}>{cur<1?cur.toFixed(4):cur.toFixed(1)}</div>
                        <div className="mono" style={{ fontSize:11, color:chg>=0?C.green:C.red }}>{chg>=0?"+":""}{chg}%</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div style={{ gridColumn:"1/4", display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:16 }}>
              {STRATEGIES.map(s => (
                <div key={s} onClick={()=>handleStrategyChange(s)} style={{ background:C.panel, border:`1px solid ${s===strategy?C.accent+"44":C.border}`, borderRadius:4, padding:14, cursor:"pointer" }}>
                  <div style={{ fontSize:10, letterSpacing:2, color:s===strategy?C.accent:C.dim, marginBottom:6 }}>{s.toUpperCase()}</div>
                  <div className="mono" style={{ fontSize:12, color:C.text }}>{s==="MA Crossover"?"Trend following":s==="RSI"?"Mean reversion":s==="Bollinger Bands"?"Volatility":"Momentum"}</div>
                  {s===strategy && <div style={{ marginTop:6 }}><Badge>ACTIVE</Badge></div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "backtest" && (
          <div style={{ display:"grid", gridTemplateColumns:"280px 1fr", gap:16 }}>
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:4, padding:16 }}>
                <div style={{ fontSize:10, letterSpacing:3, color:C.dim, marginBottom:12 }}>BACKTEST SETTINGS</div>
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  <div>
                    <div style={{ fontSize:11, color:C.dim, marginBottom:4 }}>PAIR</div>
                    <select value={pair} onChange={e=>setPair(e.target.value)} style={{ width:"100%", background:C.border, border:`1px solid ${C.muted}`, color:C.text, padding:"6px 8px", fontFamily:"Rajdhani,sans-serif", fontSize:13, outline:"none" }}>
                      {PAIRS.map(p=><option key={p}>{p}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={{ fontSize:11, color:C.dim, marginBottom:4 }}>STRATEGY</div>
                    <select value={strategy} onChange={e=>handleStrategyChange(e.target.value)} style={{ width:"100%", background:C.border, border:`1px solid ${C.muted}`, color:C.text, padding:"6px 8px", fontFamily:"Rajdhani,sans-serif", fontSize:13, outline:"none" }}>
                      {STRATEGIES.map(s=><option key={s}>{s}</option>)}
                    </select>
                  </div>
                  {strategy==="MA Crossover" && <>
                    <ParamSlider label="Fast MA" value={params.fastMA} min={3} max={20} onChange={v=>pChange("fastMA",v)}/>
                    <ParamSlider label="Slow MA" value={params.slowMA} min={10} max={50} onChange={v=>pChange("slowMA",v)}/>
                  </>}
                  {strategy==="RSI" && <>
                    <ParamSlider label="Oversold" value={params.rsiOversold} min={10} max={40} onChange={v=>pChange("rsiOversold",v)}/>
                    <ParamSlider label="Overbought" value={params.rsiOverbought} min={60} max={90} onChange={v=>pChange("rsiOverbought",v)}/>
                  </>}
                  {strategy==="Bollinger Bands" && <ParamSlider label="Std Dev" value={params.bbDev} min={1} max={3} step={0.1} onChange={v=>pChange("bbDev",v)}/>}
                  {strategy==="MACD" && <div style={{ color:C.dim, fontSize:12 }}>Default MACD(12,26,9)</div>}
                </div>
              </div>
              <button onClick={runBT} disabled={btLoading} style={{ padding:"12px 0", background:btLoading?C.muted:C.accent, border:"none", borderRadius:2, color:C.bg, fontSize:14, fontWeight:700, letterSpacing:2, textTransform:"uppercase", cursor:"pointer", fontFamily:"Rajdhani,sans-serif" }}>
                {btLoading?"RUNNING…":"▶  RUN BACKTEST"}
              </button>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              {!btResult && !btLoading && <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:4, padding:40, textAlign:"center", color:C.dim }}>Configure settings and run a backtest to see results</div>}
              {btLoading && <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:4, padding:40, textAlign:"center", color:C.accent, animation:"pulse 1s infinite" }}>SIMULATING TRADES…</div>}
              {btResult && <>
                <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:4, padding:16 }}>
                  <div style={{ fontSize:10, letterSpacing:3, color:C.dim, marginBottom:12 }}>RESULTS — {strategy} / {pair}</div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:16 }}>
                    <Stat label="Total P&L" value={`${btResult.totalPnl>=0?"+":""}$${btResult.totalPnl}`} color={btResult.totalPnl>=0?C.green:C.red}/>
                    <Stat label="Win Rate" value={`${btResult.winRate}%`} color={btResult.winRate>50?C.green:C.red}/>
                    <Stat label="Total Trades" value={btResult.trades.length}/>
                    <Stat label="Max Drawdown" value={`${btResult.maxDrawdown}%`} color={C.yellow}/>
                  </div>
                </div>
                <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:4, padding:16 }}>
                  <div style={{ fontSize:10, letterSpacing:3, color:C.dim, marginBottom:8 }}>EQUITY CURVE</div>
                  <MiniChart data={btResult.equity} color={btResult.totalPnl>=0?C.green:C.red} h={80}/>
                </div>
                <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:4, padding:16 }}>
                  <div style={{ fontSize:10, letterSpacing:3, color:C.dim, marginBottom:8 }}>TRADE P&L</div>
                  <PnlBars trades={btResult.trades}/>
                </div>
              </>}
            </div>
          </div>
        )}

        {tab === "live" && (
          <div style={{ display:"grid", gridTemplateColumns:"1fr 340px", gap:16 }}>
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:4, padding:16, display:"flex", gap:16, alignItems:"center", flexWrap:"wrap" }}>
                <div>
                  <div style={{ fontSize:10, color:C.dim, letterSpacing:1, marginBottom:4 }}>PAIR</div>
                  <select value={pair} onChange={e=>setPair(e.target.value)} style={{ background:C.border, border:`1px solid ${C.muted}`, color:C.text, padding:"6px 8px", fontFamily:"Rajdhani,sans-serif", fontSize:13, outline:"none" }}>
                    {PAIRS.map(p=><option key={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize:10, color:C.dim, letterSpacing:1, marginBottom:4 }}>MODE</div>
                  <div style={{ display:"flex", gap:4 }}>
                    {["spot","futures"].map(m=>(
                      <button key={m} onClick={()=>setMode(m)} style={{ padding:"4px 12px", background:mode===m?`${C.accent}22`:"none", border:`1px solid ${mode===m?C.accent:C.border}`, color:mode===m?C.accent:C.dim, cursor:"pointer", fontSize:12, letterSpacing:1, textTransform:"uppercase", fontFamily:"Rajdhani,sans-serif" }}>{m}</button>
                    ))}
                  </div>
                </div>
                {mode==="futures" && (
                  <div>
                    <div style={{ fontSize:10, color:C.dim, letterSpacing:1, marginBottom:4 }}>LEVERAGE: {leverage}x</div>
                    <input type="range" min={1} max={20} value={leverage} onChange={e=>setLeverage(+e.target.value)} style={{ accentColor:C.yellow, cursor:"pointer" }}/>
                  </div>
                )}
                <div style={{ flex:1 }}/>
                <div className="mono" style={{ fontSize:22, color:C.accent }}>{prices[pair]<1?prices[pair].toFixed(4):prices[pair].toFixed(2)}</div>
                <button onClick={()=>setBotActive(b=>!b)} style={{ padding:"8px 20px", background:botActive?`${C.red}22`:`${C.green}22`, border:`1px solid ${botActive?C.red:C.green}`, color:botActive?C.red:C.green, cursor:"pointer", fontSize:13, letterSpacing:2, textTransform:"uppercase", fontFamily:"Rajdhani,sans-serif", fontWeight:700 }}>
                  {botActive?"⏹ STOP":"▶ START"}
                </button>
              </div>
              <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:4, padding:16 }}>
                <div style={{ fontSize:10, letterSpacing:3, color:C.dim, marginBottom:8 }}>LIVE CHART — {pair}</div>
                <CandleChart candles={candles.slice(-50)}/>
              </div>
              <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:4, padding:16 }}>
                <div style={{ fontSize:10, letterSpacing:3, color:C.dim, marginBottom:8 }}>BOT LOG</div>
                <div style={{ maxHeight:180, overflowY:"auto", display:"flex", flexDirection:"column", gap:4 }}>
                  {liveLog.length === 0 && <div style={{ color:C.dim, fontSize:12 }}>Bot not started. Press START to begin.</div>}
                  {liveLog.map((l,i) => (
                    <div key={i} className="mono" style={{ fontSize:11, display:"flex", gap:12, padding:"4px 0", borderBottom:`1px solid ${C.border}` }}>
                      <span style={{ color:C.dim }}>{l.t}</span>
                      <span style={{ color:l.action==="BUY"?C.green:C.red, width:36 }}>{l.action}</span>
                      <span style={{ color:C.text }}>{l.pair}</span>
                      <span style={{ color:C.dim }}>@ {l.price}</span>
                      <Badge color={l.mode==="futures"?C.yellow:C.accent}>{l.mode}</Badge>
                      {l.pnl!==0 && <span style={{ color:l.pnl>0?C.green:C.red }}>{l.pnl>0?"+":""}${l.pnl}</span>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:4, padding:16 }}>
              <div style={{ fontSize:10, letterSpacing:3, color:C.dim, marginBottom:12 }}>LIVE ORDER BOOK</div>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:C.muted, marginBottom:6, letterSpacing:1 }}>
                <span>SIDE</span><span>PRICE</span><span>QTY</span><span>TIME</span>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
                {orders.map(o => (
                  <div key={o.id} className="mono" style={{ display:"flex", justifyContent:"space-between", fontSize:11, padding:"3px 0", borderBottom:`1px solid ${C.border}22`, animation:"slideIn .2s ease" }}>
                    <span style={{ color:o.side==="BUY"?C.green:C.red, width:36 }}>{o.side}</span>
                    <span>{o.price<1?o.price.toFixed(4):o.price.toFixed(1)}</span>
                    <span style={{ color:C.dim }}>{o.qty}</span>
                    <span style={{ color:C.muted }}>{o.t}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "config" && (
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
            {STRATEGIES.map(s => (
              <div key={s} style={{ background:C.panel, border:`1px solid ${s===strategy?C.accent+"55":C.border}`, borderRadius:4, padding:20 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
                  <div>
                    <div style={{ fontWeight:700, fontSize:16, letterSpacing:1 }}>{s}</div>
                    <div style={{ fontSize:11, color:C.dim, marginTop:2 }}>
                      {s==="MA Crossover"?"Buy when fast EMA crosses above slow EMA":s==="RSI"?"Buy/sell at oversold/overbought thresholds":s==="Bollinger Bands"?"Trade breakouts from volatility bands":"Trade on MACD line crossovers"}
                    </div>
                  </div>
                  <button onClick={()=>handleStrategyChange(s)} style={{ padding:"4px 14px", background:s===strategy?`${C.green}22`:"none", border:`1px solid ${s===strategy?C.green:C.border}`, color:s===strategy?C.green:C.dim, cursor:"pointer", fontSize:11, letterSpacing:1, fontFamily:"Rajdhani,sans-serif" }}>
                    {s===strategy?"ACTIVE":"SELECT"}
                  </button>
                </div>
                {s==="MA Crossover" && <>
                  <ParamSlider label="Fast EMA Period" value={s===strategy?params.fastMA:DEFAULT_PARAMS[s].fastMA} min={3} max={20} onChange={v=>{if(s===strategy)pChange("fastMA",v)}}/>
                  <ParamSlider label="Slow EMA Period" value={s===strategy?params.slowMA:DEFAULT_PARAMS[s].slowMA} min={10} max={50} onChange={v=>{if(s===strategy)pChange("slowMA",v)}}/>
                </>}
                {s==="RSI" && <>
                  <ParamSlider label="Oversold Level" value={s===strategy?params.rsiOversold:DEFAULT_PARAMS[s].rsiOversold} min={10} max={40} onChange={v=>{if(s===strategy)pChange("rsiOversold",v)}}/>
                  <ParamSlider label="Overbought Level" value={s===strategy?params.rsiOverbought:DEFAULT_PARAMS[s].rsiOverbought} min={60} max={90} onChange={v=>{if(s===strategy)pChange("rsiOverbought",v)}}/>
                </>}
                {s==="Bollinger Bands" && <ParamSlider label="Std Dev Multiplier" value={s===strategy?params.bbDev:DEFAULT_PARAMS[s].bbDev} min={1} max={3} step={0.1} onChange={v=>{if(s===strategy)pChange("bbDev",v)}}/>}
                {s==="MACD" && <div style={{ fontSize:12, color:C.dim, marginTop:8 }}>Fast: 12 | Slow: 26 | Signal: 9</div>}
              </div>
            ))}
            <div style={{ gridColumn:"1/3", background:C.panel, border:`1px solid ${C.border}`, borderRadius:4, padding:20 }}>
              <div style={{ fontSize:10, letterSpacing:3, color:C.dim, marginBottom:12 }}>BINANCE API CONNECTION</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <div>
                  <div style={{ fontSize:11, color:C.dim, marginBottom:4 }}>API KEY</div>
                  <input type="password" placeholder="Your Binance API Key" style={{ width:"100%", background:C.border, border:`1px solid ${C.muted}`, color:C.text, padding:"8px 10px", fontFamily:"Space Mono,monospace", fontSize:12, outline:"none" }}/>
                </div>
                <div>
                  <div style={{ fontSize:11, color:C.dim, marginBottom:4 }}>API SECRET</div>
                  <input type="password" placeholder="Your Binance API Secret" style={{ width:"100%", background:C.border, border:`1px solid ${C.muted}`, color:C.text, padding:"8px 10px", fontFamily:"Space Mono,monospace", fontSize:12, outline:"none" }}/>
                </div>
              </div>
              <div style={{ marginTop:12, display:"flex", gap:8, alignItems:"center" }}>
                <button style={{ padding:"8px 20px", background:`${C.accent}22`, border:`1px solid ${C.accent}`, color:C.accent, cursor:"pointer", fontSize:12, letterSpacing:2, textTransform:"uppercase", fontFamily:"Rajdhani,sans-serif" }}>CONNECT</button>
                <span style={{ fontSize:11, color:C.dim }}>⚠ This is a simulation. Connect real Binance API keys for live trading.</span>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
