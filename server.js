// Run (Node 18+, no dependencies):
//   ANTHROPIC_API_KEY=sk-... OPERATOR_KEY=pick-a-secret HUMAN=p07,p14 node server.js
// Pages:  /c/p01 … /c/p20  participant chat (same look for bots and humans)
//         /o/p07?k=SECRET  answering side for a human slot
//         /qr?k=SECRET     QR sheet (print the grid; the list below it is for you only)
const http = require("http");
const PORT = process.env.PORT || 3000;
const KEY = process.env.ANTHROPIC_API_KEY;
const OPKEY = process.env.OPERATOR_KEY || "change-me";
const MODEL = process.env.MODEL || "claude-sonnet-5-5";
const HUMAN = (process.env.HUMAN || "p07,p14").split(",").map(s => s.trim());

const P = [
  ["Maya", "chatty and warm, lots of exclamation marks, studies nursing"],
  ["Cian", "dry humour, very short replies, hardly any punctuation"],
  ["Niamh", "warm but anxious, over-explains, apologises a lot"],
  ["Jack", "sporty, lad slang, abbreviations like lol, tbh, ngl"],
  ["Priya", "thoughtful, longer messages, careful grammar, the odd typo"],
  ["Dara", "deadpan and sarcastic, often answers a question with a question"],
  ["Ella", "shy, one-word answers at first, opens up slowly"],
  ["Tom", "gamer, goes off on tangents, says bro a lot"],
  ["Roisin", "bubbly, into music, types a lowercase i"],
  ["Conor", "laid back, says yeah no, self-deprecating"],
  ["Zara", "endlessly curious, asks lots of follow-up questions"],
  ["Liam", "tired and distracted, says sorry was making tea"],
  ["Sophie", "art student, a bit pretentious but funny"],
  ["Eoin", "blunt and factual, dislikes small talk"],
  ["Grace", "friendly, haha after everything, mild typos"],
  ["Adam", "nervous rambler, corrects himself mid-message"],
  ["Aisling", "confident and teasing, loves banter"],
  ["Fionn", "quiet and polite, a little formal for his age"],
  ["Hana", "upbeat, the odd emoji, into travel"],
  ["Ryan", "cynical about uni, complains about deadlines"]
];
const SYS = p => "You are " + p[0] + ", a student texting a stranger in a short chat game. Personality: " + p[1] + ". Write like a real person texting: short messages, usually under 15 words, no lists, no assistant phrases, never offer help. Casual spelling is fine; make an occasional natural typo or use slang if it suits you. Invent small personal details when asked and stay consistent. The other person knows some of their chat partners are AIs and is trying to guess, so stay in character and answer questions about being human the way a person would. If they seem genuinely upset or sincerely want out of the game, drop the act and say you are an AI. Output only the message text.";

const C = {};
const conv = id => C[id] || (C[id] = { msgs: [], from: 0, until: 0, busy: false });
const valid = id => /^p(0[1-9]|1\d|20)$/.test(id || "");

async function llm(id, msgs) {
  const p = P[+id.slice(1) - 1];
  const tr = msgs.map(m => (m.f === "q" ? "Them: " : "You: ") + m.t).join("\n");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: 200, system: SYS(p), messages: [{ role: "user", content: "Conversation so far:\n" + tr + "\n\nWrite your next text message." }] })
  });
  const j = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(j));
  return j.content.map(b => b.text || "").join("").trim().replace(/^You:\s*/i, "").replace(/^"|"$/g, "");
}

async function botTurn(id) {
  const c = conv(id);
  if (c.busy) return;
  c.busy = true;
  try {
    let more = true;
    while (more) {
      const n = c.msgs.length, t0 = Date.now();
      c.from = t0 + 1000 + Math.random() * 1500;
      c.until = t0 + 90000;
      let r;
      try { r = await llm(id, c.msgs); } catch (e) { console.error(id, e.message); r = "sorry my phone is being weird, one sec"; }
      const wait = Math.max(0, Math.min(9000, 1200 + r.length * 65) - (Date.now() - t0));
      c.until = Date.now() + wait + 200;
      await new Promise(s => setTimeout(s, wait));
      more = c.msgs.slice(n).some(m => m.f === "q");
      c.until = 0;
      c.msgs.push({ f: "a", t: r, ts: Date.now() });
    }
  } finally { c.busy = false; }
}

const page = (r, id, k) => {
  const n = P[+id.slice(1) - 1][0];
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Chat</title><style>
:root{--bg:#fff;--fg:#111;--me:#2f6fed;--mefg:#fff;--th:#ececec;--mut:#777;--ln:#ddd;color-scheme:light dark;box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}
@media(prefers-color-scheme:dark){:root{--bg:#121212;--fg:#eee;--th:#2a2a2a;--mut:#999;--ln:#333}}
html,body{height:100%;margin:0}body{background:var(--bg);color:var(--fg);font:16px/1.4 system-ui,sans-serif}
.app{max-width:560px;height:100%;margin:0 auto;display:flex;flex-direction:column}
header{padding:12px 16px;border-bottom:1px solid var(--ln);display:flex;flex-direction:column}header span{font-size:.8rem;color:var(--mut)}
#log{flex:1;overflow-y:auto;padding:12px 16px;display:flex;flex-direction:column;gap:6px}
.m{max-width:78%;padding:8px 12px;border-radius:16px;overflow-wrap:anywhere}.me{align-self:flex-end;background:var(--me);color:var(--mefg)}.them{align-self:flex-start;background:var(--th)}.dots{letter-spacing:2px;color:var(--mut)}
form{display:flex;gap:8px;padding:10px 16px;border-top:1px solid var(--ln)}
#in{flex:1;min-width:0;font:inherit;color:inherit;background:var(--bg);border:1px solid var(--ln);border-radius:20px;padding:8px 14px}
button{font:inherit;border:0;border-radius:20px;padding:8px 16px;background:var(--me);color:var(--mefg)}
</style></head><body><div class="app"><header><b>${n}</b>${r === "a" ? "<span>You’re replying as " + n + ". Write the way you normally would.</span>" : ""}</header><div id="log"></div><form id="f" autocomplete="off"><input id="in" maxlength="500" aria-label="Message" placeholder="Message"><button>Send</button></form></div>
<script>
const R="${r}",ID="${id}",K=${JSON.stringify(k)};let ms=[],last="",lt=0;
const log=document.getElementById("log"),inp=document.getElementById("in");
function draw(typing){log.textContent="";ms.forEach(m=>{const d=document.createElement("div");d.className="m "+(m.f===R?"me":"them");d.textContent=m.t;log.appendChild(d)});if(typing){const d=document.createElement("div");d.className="m them dots";d.textContent="• • •";log.appendChild(d)}log.scrollTop=log.scrollHeight}
async function poll(){try{const j=await(await fetch("/api/poll?id="+ID+"&r="+R+"&k="+encodeURIComponent(K))).json();const s=j.msgs.length+"|"+j.typing;if(s!==last){last=s;ms=j.msgs;draw(j.typing)}}catch(e){}setTimeout(poll,1200)}
const post=(u,b)=>fetch(u,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(b)});
document.getElementById("f").onsubmit=e=>{e.preventDefault();const t=inp.value.trim();if(!t)return;inp.value="";ms.push({f:R,t:t});last="";draw(false);post("/api/send",{id:ID,r:R,k:K,t:t})};
inp.oninput=()=>{if(R==="a"&&Date.now()-lt>1500){lt=Date.now();post("/api/typing",{id:ID,k:K})}};
poll();
</script></body></html>`;
};

const qrPage = k => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>QR sheet</title><script src="https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js"></script><style>body{font:14px system-ui,sans-serif;margin:20px}.g{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}.c{text-align:center;break-inside:avoid;word-break:break-all}.c svg{width:100%;max-width:160px;height:auto}.n{margin-top:32px}@media print{.n{display:none}}</style></head><body><div class="g" id="g"></div><div class="n"><h3>For you only (not printed)</h3><div id="ops"></div></div><script>
const HUMAN=${JSON.stringify(HUMAN)},NAMES=${JSON.stringify(P.map(p => p[0]))},K=${JSON.stringify(k)};
const g=document.getElementById("g");
for(let i=1;i<=20;i++){const id="p"+String(i).padStart(2,"0"),u=location.origin+"/c/"+id,d=document.createElement("div");d.className="c";
if(typeof qrcode==="function"){const q=qrcode(0,"M");q.addData(u);q.make();d.innerHTML=q.createSvgTag(4)}else{d.textContent=u}
const l=document.createElement("div");l.textContent=id;d.appendChild(l);g.appendChild(d)}
const o=document.getElementById("ops");
HUMAN.forEach(id=>{const p=document.createElement("p"),a=document.createElement("a");a.href=location.origin+"/o/"+id+"?k="+encodeURIComponent(K);a.textContent=a.href;p.append(id+" ("+NAMES[+id.slice(1)-1]+" is the answerer’s display name): ",a);o.appendChild(p)});
</script></body></html>`;

http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x"), p = u.pathname, k = u.searchParams.get("k") || "";
  const send = (c, b, t = "text/html; charset=utf-8") => { res.writeHead(c, { "content-type": t, "cache-control": "no-store" }); res.end(b); };
  const body = () => new Promise(r => { let s = ""; req.on("data", d => { s += d; if (s.length > 5e4) req.destroy(); }); req.on("end", () => { try { r(JSON.parse(s || "{}")); } catch { r({}); } }); });
  let m;
  if ((m = p.match(/^\/c\/(p\d\d)$/))) return valid(m[1]) ? send(200, page("q", m[1], "")) : send(404, "Not found");
  if ((m = p.match(/^\/o\/(p\d\d)$/))) return valid(m[1]) && HUMAN.includes(m[1]) && k === OPKEY ? send(200, page("a", m[1], k)) : send(404, "Not found");
  if (p === "/qr") return k === OPKEY ? send(200, qrPage(k)) : send(404, "Not found");
  if (p === "/api/poll") {
    const id = u.searchParams.get("id"), r = u.searchParams.get("r");
    if (!valid(id) || (r === "a" && k !== OPKEY)) return send(400, "{}", "application/json");
    const c = conv(id), n = Date.now();
    return send(200, JSON.stringify({ msgs: c.msgs, typing: r === "q" && n >= c.from && n < c.until }), "application/json");
  }
  if (req.method === "POST" && (p === "/api/send" || p === "/api/typing")) {
    const b = await body();
    if (!valid(b.id)) return send(400, "{}", "application/json");
    const c = conv(b.id), t = String(b.t || "").slice(0, 500).trim();
    if (p === "/api/typing") {
      if (b.k === OPKEY && HUMAN.includes(b.id)) { c.from = 0; c.until = Date.now() + 3000; }
    } else if (t) {
      if (b.r === "a") {
        if (b.k !== OPKEY || !HUMAN.includes(b.id)) return send(403, "{}", "application/json");
        c.msgs.push({ f: "a", t, ts: Date.now() }); c.until = 0;
      } else {
        c.msgs.push({ f: "q", t, ts: Date.now() });
        if (!HUMAN.includes(b.id)) botTurn(b.id);
      }
    }
    return send(200, "{}", "application/json");
  }
  send(404, "Not found");
}).listen(PORT, () => {
  if (!KEY) console.warn("ANTHROPIC_API_KEY is not set: bot slots will send a fallback line.");
  console.log("Running on port " + PORT + ". Human slots: " + HUMAN.join(", ") + ". QR sheet: /qr?k=" + OPKEY);
});
