// Flippancy — local-only decision + retro app
// All data lives in localStorage. No network. No tracking. No nonsense.

const STORE_KEY = "flippancy_v1";
const THEME_KEY = "flippancy_theme";

const state = {
  mode: "gentle",
  retroType: "daily",
};

// ---------- storage ----------

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return { decisions: [], retros: [] };
    const parsed = JSON.parse(raw);
    return {
      decisions: parsed.decisions || [],
      retros: parsed.retros || [],
    };
  } catch {
    return { decisions: [], retros: [] };
  }
}

function save(data) {
  localStorage.setItem(STORE_KEY, JSON.stringify(data));
}

let data = load();

// ---------- theme ----------

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(THEME_KEY, theme);
}

applyTheme(localStorage.getItem(THEME_KEY) || "dark");

document.getElementById("theme").addEventListener("click", () => {
  const cur = document.documentElement.getAttribute("data-theme") || "dark";
  applyTheme(cur === "dark" ? "light" : "dark");
});

// ---------- tabs ----------

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.tab).classList.add("active");
    if (btn.dataset.tab === "history") renderHistory();
    if (btn.dataset.tab === "retro") renderRetroForm();
  });
});

// ---------- decide ----------

document.querySelectorAll(".mode").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".mode").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.mode = btn.dataset.mode;
  });
});

document.getElementById("addOption").addEventListener("click", () => {
  const wrap = document.getElementById("options");
  if (wrap.children.length >= 5) return;
  const input = document.createElement("input");
  input.className = "opt";
  input.placeholder = `Option ${String.fromCharCode(65 + wrap.children.length)} — another choice`;
  wrap.appendChild(input);
  input.focus();
});

document.getElementById("decideBtn").addEventListener("click", () => {
  const opts = [...document.querySelectorAll(".opt")]
    .map((i) => i.value.trim())
    .filter(Boolean);
  if (opts.length < 2) {
    shake(document.getElementById("options"));
    return;
  }

  const btn = document.getElementById("decideBtn");
  const phrases = {
    gentle: "Thinking it through…",
    brutal: "Cutting the crap…",
    sarcastic: "Wow, deciding is hard, huh…",
  };
  btn.textContent = phrases[state.mode];
  btn.disabled = true;

  setTimeout(() => {
    const verdict = argue(opts);
    renderResult(opts, verdict);
    document.getElementById("llmBtn").classList.remove("hidden");
    document.getElementById("llmBtn").dataset.options = JSON.stringify(opts);
    btn.textContent = "Arguing… I mean, deciding ➜";
    btn.disabled = false;
  }, 700);
});

// ---------- decision logic ----------

const toneLib = {
  gentle: {
    pick: (winner, losers) =>
      `Go with <b>${escape(winner)}</b>. The others aren't wrong — they're just not this one, for you, right now.`,
    roast: (history) =>
      history.length
        ? `<br><br><i>By the way — you've gone back and forth on similar things ${history.length} time${
            history.length === 1 ? "" : "s"
          } before. Trust yourself this time?</i>`
        : "",
  },
  brutal: {
    pick: (winner, losers) =>
      `<b>${escape(winner)}</b>. Stop hedging. The others are just exits you're keeping open so you don't have to commit. Pick this and move.`,
    roast: (history) =>
      history.length
        ? `<br><br><i>You've chickened out ${history.length} time${
            history.length === 1 ? "" : "s"
          } on stuff like this. Don't be that person again.</i>`
        : `<br><br><i>First decision logged. Try not to overrule it in 20 minutes.</i>`,
  },
  sarcastic: {
    pick: (winner, losers) =>
      `Oh look, after all that drama, it's <b>${escape(winner)}</b>. Shocking. Truly nobody could've seen that coming. Anyway — go do it.`,
    roast: (history) =>
      history.length
        ? `<br><br><i>Also, fun fact: this is decision #${history.length + 1} you've stress-asked about. We should start a support group.</i>`
        : `<br><br><i>Welcome to your first one. Try to make it a streak.</i>`,
  },
};

function argue(opts) {
  // deterministic-ish scoring with a little chaos
  const scored = opts.map((o, i) => {
    const seed = hash(o + Date.now().toString().slice(0, -4) + i);
    const pros = makeProCon(o, "pro", seed);
    const cons = makeProCon(o, "con", seed + 7);
    return { opt: o, pros, cons, score: pseudo(seed) };
  });

  // bias the pick a bit by mode: gentle leans toward middle, brutal toward highest, sarcastic toward chaos
  let winner;
  if (state.mode === "gentle") {
    scored.sort((a, b) => Math.abs(a.score - 0.5) - Math.abs(b.score - 0.5));
    winner = scored[0];
  } else if (state.mode === "brutal") {
    scored.sort((a, b) => b.score - a.score);
    winner = scored[0];
  } else {
    // sarcastic: pick randomly but feel confident
    winner = scored[Math.floor(pseudo(hash("sarc-" + opts.join())) * scored.length)];
  }

  const losers = scored.filter((s) => s.opt !== winner.opt);
  return { winner, losers };
}

function makeProCon(opt, kind, seed) {
  // generate from a small library keyed by tone
  const lib = {
    pro: [
      `You keep coming back to "${opt}" — that means something.`,
      `It actually fits the life you're building, not the one you're escaping.`,
      `Future-you will probably thank present-you for this.`,
      `It's the option you'd quietly choose if nobody was watching.`,
      `You already know. You just want permission.`,
      `Cheaper regret than the alternative.`,
    ],
    con: [
      `It's the safer pick. Safer isn't always the right pick.`,
      `You might wonder "what if" for about a week. Then you'll forget.`,
      `It asks something of you. The others don't.`,
      `Easy to explain to other people, harder to explain to yourself.`,
      `It solves today's problem, but maybe not next month's.`,
      `You could be wrong. You won't know until you try.`,
    ],
  };
  const arr = lib[kind];
  return arr[seed % arr.length];
}

function pseudo(n) {
  // simple deterministic 0..1
  const x = Math.sin(n) * 10000;
  return x - Math.floor(x);
}

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function renderResult(opts, verdict) {
  const { winner, losers } = verdict;
  const out = document.getElementById("decideResult");
  const similarHistory = data.decisions.filter((d) =>
    d.options.some((o) => opts.some((x) => similarity(o, x) > 0.5))
  );

  const argueHtml = [winner, ...losers]
    .map(
      (s) => `
        <div>
          <strong>${escape(s.opt)}</strong>
          <div class="argue">
            <div class="pro">+ ${s.pros}</div>
            <div class="con">− ${s.cons}</div>
          </div>
        </div>
      `
    )
    .join("");

  const tone = toneLib[state.mode];
  const pick = tone.pick(winner.opt, losers) + tone.roast(similarHistory);

  out.innerHTML = `
    <h3>🧠 The case for each</h3>
    ${argueHtml}
    <div class="pick">${pick}</div>
  `;
  out.classList.remove("hidden");

  // save
  data.decisions.unshift({
    id: Date.now(),
    createdAt: new Date().toISOString(),
    options: opts,
    pick: winner.opt,
    mode: state.mode,
  });
  // cap to last 100
  data.decisions = data.decisions.slice(0, 100);
  save(data);
}

function similarity(a, b) {
  a = a.toLowerCase();
  b = b.toLowerCase();
  const setA = new Set(a.split(/\s+/));
  const setB = new Set(b.split(/\s+/));
  const inter = [...setA].filter((x) => setB.has(x)).length;
  const union = new Set([...setA, ...setB]).size || 1;
  return inter / union;
}

function escape(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

function shake(el) {
  el.style.transition = "transform 0.05s";
  el.style.transform = "translateX(-6px)";
  setTimeout(() => (el.style.transform = "translateX(6px)"), 50);
  setTimeout(() => (el.style.transform = "translateX(-4px)"), 100);
  setTimeout(() => (el.style.transform = "translateX(0)"), 150);
}

// ---------- retro ----------

const questions = {
  daily: [
    { key: "win", q: "What went well today?", hint: "even tiny stuff counts" },
    { key: "drain", q: "What drained you?", hint: "name it, don't perform" },
    { key: "tomorrow", q: "One small win to chase tomorrow?", hint: "specific, doable" },
  ],
  weekly: [
    { key: "win", q: "What were your wins this week?" },
    { key: "drain", q: "What kept draining you?" },
    { key: "lesson", q: "Biggest lesson learned?" },
    { key: "drop", q: "What are you dropping next week?" },
    { key: "double", q: "What are you doubling down on?" },
  ],
};

document.querySelectorAll(".retro-type").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".retro-type").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.retroType = btn.dataset.type;
    renderRetroForm();
  });
});

function renderRetroForm() {
  const form = document.getElementById("retroForm");
  form.innerHTML = "";
  questions[state.retroType].forEach((q) => {
    const wrap = document.createElement("div");
    wrap.className = "q";
    wrap.innerHTML = `
      <label>${q.q}${q.hint ? `<span class="hint">${q.hint}</span>` : ""}</label>
      <textarea name="${q.key}" rows="2" placeholder="be honest, no one's reading this but you"></textarea>
    `;
    form.appendChild(wrap);
  });
  document.getElementById("retroStatus").textContent = "";
}

renderRetroForm();

document.getElementById("saveRetro").addEventListener("click", () => {
  const form = document.getElementById("retroForm");
  const answers = {};
  let any = false;
  questions[state.retroType].forEach((q) => {
    const el = form.elements[q.key];
    const v = el.value.trim();
    if (v) any = true;
    answers[q.key] = v;
  });
  if (!any) {
    shake(form);
    return;
  }
  data.retros.unshift({
    id: Date.now(),
    createdAt: new Date().toISOString(),
    type: state.retroType,
    answers,
  });
  data.retros = data.retros.slice(0, 200);
  save(data);

  const status = document.getElementById("retroStatus");
  status.textContent = "Saved. Future-you says thanks ✨";
  form.reset();
  setTimeout(() => (status.textContent = ""), 3000);
});

// ---------- history ----------

function renderHistory() {
  const list = document.getElementById("historyList");
  const items = [
    ...data.decisions.map((d) => ({ kind: "decision", ...d })),
    ...data.retros.map((r) => ({ kind: "retro", ...r })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  if (!items.length) {
    list.innerHTML = `<div class="empty">Nothing here yet. Make a decision or write a retro to get started.</div>`;
    return;
  }

  list.innerHTML = items
    .map((it) => {
      const when = new Date(it.createdAt).toLocaleString();
      if (it.kind === "decision") {
        return `
          <div class="entry">
            <div class="meta">
              <span class="tag">🎯 Decision · ${escape(it.mode)}</span>
              <span class="when">${when}</span>
            </div>
            <div class="pick-line">→ ${escape(it.pick)}</div>
            <div class="answers"><div><span>Options:</span>${it.options.map(escape).join(" · ")}</div></div>
          </div>
        `;
      }
      const a = it.answers;
      const rows = Object.entries(a)
        .filter(([, v]) => v)
        .map(([k, v]) => `<div><span>${escape(k)}:</span>${escape(v)}</div>`)
        .join("");
      return `
        <div class="entry">
          <div class="meta">
            <span class="tag">📓 Retro · ${escape(it.type)}</span>
            <span class="when">${when}</span>
          </div>
          <div class="answers">${rows}</div>
        </div>
      `;
    })
    .join("");
}

document.getElementById("exportBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `flippancy-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById("clearBtn").addEventListener("click", () => {
  if (!confirm("Wipe everything? Can't undo this.")) return;
  data = { decisions: [], retros: [] };
  save(data);
  renderHistory();
});

// ---------- import ----------

const importStatus = document.getElementById("importStatus");
let pendingImport = null;

document.getElementById("importFile").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const parsed = JSON.parse(ev.target.result);
      const decisions = Array.isArray(parsed.decisions) ? parsed.decisions : [];
      const retros = Array.isArray(parsed.retros) ? parsed.retros : [];

      if (!decisions.length && !retros.length) {
        importStatus.textContent = "Hmm, that file doesn't look right.";
        return;
      }

      pendingImport = { decisions, retros, fileName: file.name };
      importStatus.innerHTML = `Found <b>${decisions.length}</b> decisions and <b>${retros.length}</b> retros. <button id="confirmMerge" class="ghost" style="padding:4px 10px;margin-left:6px">Merge</button> <button id="confirmReplace" class="ghost" style="padding:4px 10px">Replace</button> <button id="cancelImport" class="ghost" style="padding:4px 10px">Cancel</button>`;

      document.getElementById("confirmMerge").onclick = () => doImport("merge");
      document.getElementById("confirmReplace").onclick = () => doImport("replace");
      document.getElementById("cancelImport").onclick = () => {
        pendingImport = null;
        importStatus.textContent = "Import cancelled.";
        e.target.value = "";
      };
    } catch (err) {
      importStatus.textContent = "Couldn't read that file. Is it a Flippancy export?";
    }
  };
  reader.readAsText(file);
});

function doImport(mode) {
  if (!pendingImport) return;
  const { decisions, retros } = pendingImport;

  if (mode === "replace") {
    if (!confirm("Replace everything with the imported data? Your current data will be lost.")) return;
    data = { decisions, retros };
  } else {
    // merge: dedupe by id, prefer imported
    const seen = new Set();
    const merged = [];
    [...data.decisions, ...decisions].forEach((d) => {
      if (!d || d.id == null) return;
      if (seen.has(d.id)) return;
      seen.add(d.id);
      merged.push(d);
    });
    const seenR = new Set();
    const mergedR = [];
    [...data.retros, ...retros].forEach((r) => {
      if (!r || r.id == null) return;
      if (seenR.has(r.id)) return;
      seenR.add(r.id);
      mergedR.push(r);
    });
    data = {
      decisions: merged.sort((a, b) => (b.id || 0) - (a.id || 0)),
      retros: mergedR.sort((a, b) => (b.id || 0) - (a.id || 0)),
    };
  }

  save(data);
  renderHistory();
  importStatus.textContent = `Imported ✓ (${decisions.length} decisions, ${retros.length} retros)`;
  pendingImport = null;
  document.getElementById("importFile").value = "";
}

// ---------- LLM (Gemini) ----------

const KEY_STORAGE = "flippancy_gemini_key";

function getKey() {
  return localStorage.getItem(KEY_STORAGE) || "";
}

function setKey(k) {
  if (k) localStorage.setItem(KEY_STORAGE, k);
  else localStorage.removeItem(KEY_STORAGE);
}

const apiKeyBar = document.getElementById("apiKeyBar");
const apiKeyInput = document.getElementById("apiKeyInput");
const llmBtn = document.getElementById("llmBtn");
const saveKeyBtn = document.getElementById("saveKey");

function refreshKeyUi() {
  const has = !!getKey();
  apiKeyBar.classList.toggle("hidden", has);
  llmBtn.classList.toggle("hidden", !has);
  if (has) apiKeyInput.value = "";
}

refreshKeyUi();

saveKeyBtn.addEventListener("click", () => {
  const k = apiKeyInput.value.trim();
  if (!k) return;
  setKey(k);
  refreshKeyUi();
  apiKeyInput.value = "";
});

// show key bar if user clicks the button while no key
llmBtn.addEventListener("click", () => {
  if (!getKey()) {
    apiKeyBar.classList.remove("hidden");
    apiKeyInput.focus();
    return;
  }
  runLlm();
});

function buildPrompt(opts, mode) {
  // The whole point: short, structured, no waffle.
  return `You are Flippancy, a sharp decision coach. Given a list of options and a tone, return a JSON object ONLY. No prose, no markdown, no code fences.

Tones:
- gentle: warm, validating, "you already know"
- brutal: direct, cuts hedging, calls out avoidance
- sarcastic: dry, playful, light roast

Rules:
- ONE pro and ONE con per option, each under 14 words.
- Pick exactly one option.
- The "verdict" is ONE sentence, under 25 words, matching the tone.
- The "roast" is OPTIONAL — only include if the user has a real pattern to call out. Max 15 words. If there's nothing genuine to say, omit the field entirely.
- Never invent context the user didn't give.
- No disclaimers, no "it depends", no "consider all options equally".

Output schema (return ONLY this JSON):
{
  "options": [
    {"name": "<option text>", "pro": "<short pro>", "con": "<short con>"},
    ...
  ],
  "pick": "<option text>",
  "verdict": "<one sharp sentence>",
  "roast": "<optional, omit if nothing real>"
}

Tone: ${mode}
Options: ${JSON.stringify(opts)}

Return JSON now.`;
}

async function runLlm() {
  const opts = JSON.parse(llmBtn.dataset.options || "[]");
  if (opts.length < 2) return;

  const originalText = llmBtn.textContent;
  const phrases = {
    gentle: "Asking Gemini gently…",
    brutal: "Asking Gemini to cut the crap…",
    sarcastic: "Asking Gemini to roll its eyes…",
  };
  llmBtn.textContent = phrases[state.mode] || "Thinking…";
  llmBtn.disabled = true;

  try {
    const key = getKey();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(key)}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(opts, state.mode) }] }],
        generationConfig: {
          temperature: state.mode === "sarcastic" ? 0.9 : 0.4,
          maxOutputTokens: 600,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      let msg;
      if (res.status === 429) {
        msg = "Hit Gemini's free tier rate limit. Wait a minute (or switch keys in Settings).";
      } else if (res.status === 403) {
        msg = "API key rejected. Check it's valid at aistudio.google.com/apikey.";
      } else if (res.status === 400) {
        msg = "Bad request to Gemini. The prompt might be too long or malformed.";
      } else {
        msg = `Gemini error ${res.status}. ${errText.slice(0, 120)}`;
      }
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }

    const json = await res.json();
    const raw = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) throw new Error("Empty response from Gemini.");

    // strip any accidental fences just in case
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error("Gemini returned non-JSON. Try again.");
    }

    renderLlmResult(parsed);
  } catch (err) {
    const out = document.getElementById("decideResult");
    out.innerHTML = `
      <h3>⚠️ Couldn't reach Gemini</h3>
      <div class="argue"><div class="con">${escape(err.message)}</div></div>
      <div class="sub" style="margin-top:10px">Check your API key, or try the local take above. <button id="resetKey" class="ghost" style="padding:4px 10px;margin-left:6px">Reset key</button></div>
    `;
    out.classList.remove("hidden");
    document.getElementById("resetKey").onclick = () => {
      setKey("");
      refreshKeyUi();
    };
  } finally {
    llmBtn.textContent = originalText;
    llmBtn.disabled = false;
  }
}

function renderLlmResult(p) {
  const out = document.getElementById("decideResult");
  const argueHtml = (p.options || [])
    .map(
      (o) => `
        <div>
          <strong>${escape(o.name)}</strong>
          <div class="argue">
            <div class="pro">+ ${escape(o.pro)}</div>
            <div class="con">− ${escape(o.con)}</div>
          </div>
        </div>
      `
    )
    .join("");

  const roast = p.roast ? `<br><br><i>${escape(p.roast)}</i>` : "";

  out.innerHTML = `
    <h3>✨ The real take</h3>
    ${argueHtml}
    <div class="pick">${escape(p.verdict || `Go with ${escape(p.pick)}.`)}${roast}</div>
  `;
  out.classList.remove("hidden");
}
