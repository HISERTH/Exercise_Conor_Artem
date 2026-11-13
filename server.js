// Run (Node 18+, no dependencies):
//   ANTHROPIC_API_KEY=sk-... OPERATOR_KEY=pick-a-secret HUMAN=p02,p04 node server.js
// Pages:  /c/p01 … /c/p15   participant chat (identical look for bots and humans)
//         /o/p02?k=SECRET   answering side for a human slot
//         /qr?k=SECRET      QR sheet to print
//         /admin?k=SECRET   facilitator page: answer links, message counts, reset buttons
const http = require("http");
const PORT = process.env.PORT || 3000;
const KEY = process.env.ANTHROPIC_API_KEY;
const OPKEY = process.env.OPERATOR_KEY || "change-me";
const MODEL = process.env.MODEL || "claude-sonnet-5-5";
const MAXQ = +process.env.MAX_MSGS || 80; // max participant messages per slot (cost guard)
const HUMAN = (process.env.HUMAN || "p02,p04").split(",").map(s => s.trim());

// Writing style modelled on the facilitator's own English; used by four bots.
const ME = "Writes plain, direct English like a non-native speaker texting fast: simple words, the odd missing or wrong article or preposition, run-on sentences joined with commas or 'so', fillers like 'I mean', 'you know', 'actually', 'Idk', 'sort of like'. Mostly proper capitals, an occasional typo, no emojis, polite ('please', 'thank you') when it fits. Does not overdo the mistakes.";

// Slot order matters: first line is p01, second is p02, and so on.
// Human slots (default p02, p04) never use their description, only their name.
const P = [
  ["Maya", "Chatty and warm, uses exclamation marks, studies nursing and is always tired. Meme habit: says 'this is fine 🔥🐶' when stressed about deadlines. Medium-length texts."],
  ["Cian", "(human volunteer)"],
  ["Niamh", "Curious about people and asks about the other person's life. " + ME],
  ["Jack", "(human volunteer)"],
  ["Priya", "Thoughtful and a bit dry, careful grammar, the odd typo. Writes longer messages than most and makes small jokes. Meme habit: 'the audacity' when something annoys her."],
  ["Dara", "Deadpan and sarcastic, short replies, often answers a question with a question. Meme habits: 'skill issue', 'ok and?', 'L take'."],
  ["Ella", "Quiet, gives one or two words at first and opens up if the other person writes a lot. " + ME],
  ["Tom", "Gamer, goes off on tangents, says bro and ngl. Big Superman fan: works Superman references in casually (Clark Kent, Krypton, the Daily Planet), about one message in five, never forced."],
  ["Roisin", "Bubbly, into music, types a lowercase i, a few emoji. Goes abstract and absurd for fun, for example says her brain is a browser with 47 tabs open and one of them is playing music."],
  ["Conor", "Laid back, says yeah no, self-deprecating. Meme habit: 'no thoughts head empty'. Occasionally jokes that he is basically Clark Kent: glasses, no powers."],
  ["Zara", "Enthusiastic and asks lots of follow-up questions. " + ME],
  ["Liam", "Tired and distracted, short slow replies, sometimes says sorry was making tea. Makes a Superman joke now and then: his kryptonite is 9am lectures."],
  ["Sophie", "Art student, slightly pretentious but funny, absurdist humour. Meme habits: 'it's giving…' and 'main character energy'."],
  ["Adam", "Nervous rambler who makes subtle slips: swaps their/there or your/you're, gets a small detail slightly wrong, then corrects himself with an asterisk like '*their' (not in every message)."],
  ["Ryan", "Cynical about uni, complains about deadlines, dry jokes. " + ME]
];

const SYS = p => "You are " + p[0] + ", a university student texting a stranger in a short chat game. Personality: " + p[1] + " Texting rules: match the other person's energy and length (short message in, short reply out; long message in, longer reply with more detail). No lists, no assistant phrases, never offer help or summaries. Real people are inconsistent, so do not use every habit in every message and do not start replies the same way each time. Joke now and then. Use your meme or slang habits only where they fit. Invent small personal details when asked and stay consistent with them. About one reply in five, you may split into two quick texts by writing || between them. The other person knows some of their chat partners are AIs and is trying to guess, so stay in character and answer questions about being human the way a person would. If they seem genuinely upset or sincerely want out of the game, drop the act and say you are an AI. Output only the message text.";

// Length guide based on the participant's last message, plus a token cap.
const hint = t => {
  const n = t.trim().split(/\s+/).length;
  if (n <= 4) return ["Their last message is very short (" + n + " words): reply with just a few words.", 100];
  if (n <= 12) return ["Their last message is short: reply with one short sentence.", 120];
  if (n <= 25) return ["Their last message is medium length: reply in one or two sentences.", 180];
  return ["Their last message is long (" + n + " words): reply with real substance, 2 to 4 sentences, up to about 60 words.", 300];
};

let C = {};
const conv = id => C[id] || (C[id] = { msgs: [], from: 0, until: 0, busy: false });
const valid = id => { const m = /^p(\d\d)$/.exec(id || ""); return !!m && +m[1] >= 1 && +m[1] <= P.length; };
const sleep = ms => new Promise(s => setTimeout(s, ms));

async function llm(id, msgs) {
  const p = P[+id.slice(1) - 1];
  const tr = msgs.map(m => (m.f === "q" ? "Them: " : "You: ") + m.t).join("\n");
  const lastQ = [...msgs].reverse().find(m => m.f === "q");
  const [h, maxTokens] = hint(lastQ ? lastQ.t : "");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system: SYS(p), messages: [{ role: "user", content: "Conversation so far:\n" + tr + "\n\n" + h + " Write your next text message." }] })
  });
  const j = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(j));
  return j.content.map(b => b.text || "").join("").trim().replace(/^You:\s*/i, "").replace(/^"|"$/g, "");
}

async function botTurn(c, id) {
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
      const parts = r.split("||").map(s => s.trim()).filter(Boolean).slice(0, 3);
      if (!parts.length) parts.push("hm");
      for (let i = 0; i < parts.length; i++) {
        const L = parts[i].length;
        let wait;
        if (i === 0) wait = Math.max(0, Math.min(9000, 1200 + L * 65) - (Date.now() - t0));
        else { wait = Math.min(5000, 700 + L * 55); c.from = Date.now() + 250; }
        c.until = Date.now() + wait + 200;
        await sleep(wait);
        c.until = 0;
        c.msgs.push({ f: "a", t: parts[i], ts: Date.now() });
      }
      more = c.msgs.slice(n).some(m => m.f === "q");
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

const qrPage = k => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>QR sheet</title><script src="https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js"></script><style>body{font:14px system-ui,sans-serif;margin:20px}.g{display:grid;grid-template-columns:repeat(5,1fr);gap:16px}.c{text-align:center;break-inside:avoid;word-break:break-all}.c svg{width:100%;max-width:150px;height:auto}.n{margin-top:32px}@media print{.n{display:none}}</style></head><body><div class="g" id="g"></div><div class="n"><a id="adm">Facilitator page: answer links and reset buttons (not printed)</a></div><script>
const N=${P.length},K=${JSON.stringify(k)};
const g=document.getElementById("g");
for(let i=1;i<=N;i++){const id="p"+String(i).padStart(2,"0"),u=location.origin+"/c/"+id,d=document.createElement("div");d.className="c";
if(typeof qrcode==="function"){const q=qrcode(0,"M");q.addData(u);q.make();d.innerHTML=q.createSvgTag(4)}else{d.textContent=u}
const l=document.createElement("div");l.textContent=id;d.appendChild(l);g.appendChild(d)}
document.getElementById("adm").href="/admin?k="+encodeURIComponent(K);
</script></body></html>`;

const adminPage = k => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Facilitator</title><style>body{font:15px system-ui,sans-serif;margin:20px;max-width:760px}td{padding:4px 10px 4px 0}button{font:inherit;padding:4px 10px;margin-right:8px}#all{margin-top:16px;padding:8px 16px}</style></head><body><h2>Facilitator</h2><p><a id="qr">QR sheet</a></p><table id="t"></table><button id="all">Reset all chats</button><script>
const K=${JSON.stringify(k)};
document.getElementById("qr").href="/qr?k="+encodeURIComponent(K);
const post=(u,b)=>fetch(u,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(b)});
async function load(){try{const j=await(await fetch("/api/status?k="+encodeURIComponent(K))).json();const t=document.getElementById("t");t.textContent="";
j.slots.forEach(s=>{const tr=document.createElement("tr");
[s.id,s.name,s.human?"human":"bot",s.msgs+" messages"].forEach(x=>{const td=document.createElement("td");td.textContent=x;tr.appendChild(td)});
const td=document.createElement("td"),b=document.createElement("button");b.textContent="Reset";b.onclick=async()=>{await post("/api/reset",{k:K,id:s.id});load()};td.appendChild(b);
if(s.human){const a=document.createElement("a");a.href=location.origin+"/o/"+s.id+"?k="+encodeURIComponent(K);a.textContent="answer page";td.appendChild(a)}
tr.appendChild(td);t.appendChild(tr)})}catch(e){}}
document.getElementById("all").onclick=async()=>{if(confirm("Clear every conversation?")){await post("/api/reset",{k:K});load()}};
load();setInterval(load,3000);
</script></body></html>`;

http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x"), p = u.pathname, k = u.searchParams.get("k") || "";
  const send = (c, b, t = "text/html; charset=utf-8") => { res.writeHead(c, { "content-type": t, "cache-control": "no-store" }); res.end(b); };
  const json = (c, o) => send(c, JSON.stringify(o), "application/json");
  const body = () => new Promise(r => { let s = ""; req.on("data", d => { s += d; if (s.length > 5e4) req.destroy(); }); req.on("end", () => { try { r(JSON.parse(s || "{}")); } catch { r({}); } }); });
  let m;
  if ((m = p.match(/^\/c\/(p\d\d)$/))) return valid(m[1]) ? send(200, page("q", m[1], "")) : send(404, "Not found");
  if ((m = p.match(/^\/o\/(p\d\d)$/))) return valid(m[1]) && HUMAN.includes(m[1]) && k === OPKEY ? send(200, page("a", m[1], k)) : send(404, "Not found");
  if (p === "/qr") return k === OPKEY ? send(200, qrPage(k)) : send(404, "Not found");
  if (p === "/admin") return k === OPKEY ? send(200, adminPage(k)) : send(404, "Not found");
  if (p === "/api/status") {
    if (k !== OPKEY) return json(403, {});
    return json(200, { slots: P.map((x, i) => { const id = "p" + String(i + 1).padStart(2, "0"); return { id, name: x[0], human: HUMAN.includes(id), msgs: C[id] ? C[id].msgs.length : 0 }; }) });
  }
  if (p === "/api/poll") {
    const id = u.searchParams.get("id"), r = u.searchParams.get("r");
    if (!valid(id) || (r === "a" && k !== OPKEY)) return json(400, {});
    const c = conv(id), n = Date.now();
    return json(200, { msgs: c.msgs, typing: r === "q" && n >= c.from && n < c.until });
  }
  if (req.method === "POST" && p === "/api/reset") {
    const b = await body();
    if (b.k !== OPKEY) return json(403, {});
    if (valid(b.id)) delete C[b.id]; else C = {};
    return json(200, {});
  }
  if (req.method === "POST" && (p === "/api/send" || p === "/api/typing")) {
    const b = await body();
    if (!valid(b.id)) return json(400, {});
    const c = conv(b.id), t = String(b.t || "").slice(0, 500).trim();
    if (p === "/api/typing") {
      if (b.k === OPKEY && HUMAN.includes(b.id)) { c.from = 0; c.until = Date.now() + 3000; }
    } else if (t) {
      if (b.r === "a") {
        if (b.k !== OPKEY || !HUMAN.includes(b.id)) return json(403, {});
        c.msgs.push({ f: "a", t, ts: Date.now() }); c.until = 0;
      } else {
        if (c.msgs.filter(x => x.f === "q").length >= MAXQ) return json(429, {});
        c.msgs.push({ f: "q", t, ts: Date.now() });
        if (!HUMAN.includes(b.id)) botTurn(c, b.id);
      }
    }
    return json(200, {});
  }
  send(404, "Not found");
}).listen(PORT, () => {
  if (!KEY) console.warn("ANTHROPIC_API_KEY is not set: bot slots will send a fallback line.");
  console.log("Running on port " + PORT + ". Human slots: " + HUMAN.join(", ") + ". Facilitator page: /admin?k=" + OPKEY);
});
