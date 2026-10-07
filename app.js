/* X-Piano — 100% FREE + SAFE flow
   Paste link -> video ID -> title (noembed/oEmbed, no key) -> lyrics (LRCLIB/lyrics.ovh, no key)
   -> chords (try AI chord detection, else local library, else default) -> Original/Hinglish/English tabs
   No download, no storage. The video plays via YouTube embed.
*/
const $ = (id) => document.getElementById(id);
const state = {
  videoId: null, youtubeUrl: null, title: "", artist: "",
  lyricsLines: [], lyricsLang: "unknown",
  progression: [...window.DEFAULT_PROGRESSION],
  transpose: 0, lang: "original",
  translatedCache: {}, hinglishCache: null,
  chordSource: ""
};

const NOTES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const FLAT_TO_SHARP = { "Db":"C#","Eb":"D#","Gb":"F#","Ab":"G#","Bb":"A#" };

// ---------- YouTube ----------
function extractVideoId(url) {
  if (!url) return null;
  url = url.trim();
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
  if (m) return m[1];
  const u = url.match(/[?&]v=([A-Za-z0-9_-]{6,})/);
  return u ? u[1] : null;
}

async function fetchTitle(videoId, originalUrl) {
  // 1) noembed (CORS friendly, free, no key)
  try {
    const r = await fetch("https://noembed.com/embed?url=" + encodeURIComponent("https://www.youtube.com/watch?v=" + videoId));
    if (r.ok) {
      const j = await r.json();
      if (j.title) return { title: j.title, author: j.author_name || "" };
    }
  } catch (e) {}
  // 2) youtube oEmbed
  try {
    const r = await fetch("https://www.youtube.com/oembed?url=" + encodeURIComponent(originalUrl) + "&format=json");
    if (r.ok) {
      const j = await r.json();
      if (j.title) return { title: j.title, author: j.author_name || "" };
    }
  } catch (e) {}
  return { title: "Unknown Title (" + videoId + ")", author: "" };
}

function parseArtistTitle(full, author) {
  let artist = (author || "").replace(/ - Topic$/i, "").trim();
  let title = full.trim();
  // "Artist - Title" pattern
  const parts = full.split(/\s+[-–—|]\s+/);
  if (parts.length >= 2 && full.length < 140) {
    artist = artist || parts[0].trim();
    title = parts.slice(1).join(" - ").trim();
  }
  // cleanup: "(Official Video)", "[Lyrics]" etc.
  title = title.replace(/\(.*?official.*?\)|\[.*?official.*?\]|\(.*?video.*?\)|\(.*?lyric.*?\)|\[.*?lyric.*?\]/gi, "").trim();
  title = title.replace(/\s{2,}/g, " ");
  return { artist, title: title || full };
}

// ---------- Lyrics ----------
async function fetchLyrics(artist, title) {
  const q = (title + " " + artist).trim();
  // A) LRCLIB search (free, synced+plain, CORS open)
  try {
    const r = await fetch("https://lrclib.net/api/search?q=" + encodeURIComponent(q));
    if (r.ok) {
      const arr = await r.json();
      if (Array.isArray(arr) && arr.length) {
        const best = arr[0];
        const text = best.plainLyrics || best.syncedLyrics?.replace(/\[\d+:\d+\.\d+\]/g, "") || "";
        if (text.trim()) return { lines: cleanLyricLines(text), via: "LRCLIB" };
      }
    }
  } catch (e) {}
  // B) lyrics.ovh (free, no key)
  try {
    if (artist && title) {
      const r = await fetch("https://api.lyrics.ovh/v1/" + encodeURIComponent(artist) + "/" + encodeURIComponent(title));
      if (r.ok) {
        const j = await r.json();
        if (j.lyrics && j.lyrics.trim()) return { lines: cleanLyricLines(j.lyrics), via: "lyrics.ovh" };
      }
    }
  } catch (e) {}
  // C) demo fallback so the UI is never left empty
  const isHi = /tum hi ho|kesariya|apna time/i.test(q);
  const demo = isHi ? window.DEMO_LYRICS_HI : window.DEMO_LYRICS_EN;
  return { lines: cleanLyricLines(demo), via: "Demo lyrics (not found via API — the title may differ slightly)" };
}

function cleanLyricLines(t) {
  return t.split("\n").map(s => s.trim()).filter(Boolean).slice(0, 120);
}

function isHindi(text) { return /[\u0900-\u097F]/.test(text); }

// ---------- Chords ----------
function findLocalProgression(title, artist) {
  const q = (title + " " + artist).toLowerCase();
  for (const e of window.CHORD_DB) {
    if (e.match.some(k => q.includes(k))) return e;
  }
  return null;
}

async function fetchChords(youtubeUrl, title, artist) {
  // 1) local DB match (instant, free, accurate for demo songs)
  const local = findLocalProgression(title, artist);
  if (local) return { progression: [...local.progression], via: "X-Piano chord library • Key " + local.key };

  // 2) Try AI chord detection. On failure, fall back silently.
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);
    const r = await fetch("https://magic-chords.dev/api/v1/analyze/url", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: youtubeUrl }), signal: ctrl.signal
    });
    clearTimeout(t);
    if (r.ok) {
      const j = await r.json();
      const job = j.job_id || j.id;
      if (job) {
        const prog = await pollMagicChords(job);
        if (prog && prog.length) return { progression: prog, via: "AI chord detection" };
      } else if (j.chords && j.chords.length) {
        return { progression: j.chords.map(c => c.chord || c).slice(0, 32), via: "AI chord detection" };
      }
    }
  } catch (e) { /* offline / CORS / timeout -> fallback */ }

  // 3) default 4-chord progression (always works as a last resort)
  return { progression: [...window.DEFAULT_PROGRESSION], via: "Default 4-chord progression (C–G–Am–F)" };
}

async function pollMagicChords(jobId) {
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 3000));
    try {
      const r = await fetch("https://magic-chords.dev/api/v1/jobs/" + jobId + "/result");
      if (!r.ok) continue;
      const j = await r.json();
      const chords = j.chords || j.result?.chords || [];
      if (chords.length) return chords.map(c => (typeof c === "string" ? c : c.chord || c.name)).filter(Boolean).slice(0, 32);
      if (j.status === "failed") return null;
    } catch (e) { return null; }
  }
  return null;
}

// ---------- Transpose + chord notes ----------
function transposeChord(ch, steps) {
  const m = ch.match(/^([A-G][#b]?)(.*)$/);
  if (!m) return ch;
  let root = m[1], suffix = m[2] || "";
  if (FLAT_TO_SHARP[root]) root = FLAT_TO_SHARP[root];
  let i = NOTES.indexOf(root);
  if (i < 0) return ch;
  return NOTES[(i + steps + 120) % 12] + suffix;
}

function chordNotes(ch) {
  const m = ch.match(/^([A-G][#b]?)(.*)$/);
  if (!m) return ["C","E","G"];
  let root = FLAT_TO_SHARP[m[1]] || m[1];
  const suf = (m[2] || "").toLowerCase();
  const minor = suf.startsWith("m") && !suf.startsWith("maj");
  const seven = suf.includes("7");
  const r = NOTES.indexOf(root);
  const third = NOTES[(r + (minor ? 3 : 4)) % 12];
  const fifth = NOTES[(r + 7) % 12];
  const out = [root, third, fifth];
  if (seven) out.push(NOTES[(r + 10) % 12]);
  return out;
}

// ---------- Hindi to Hinglish (offline character map) ----------
const HI_MAP = {"अ":"a","आ":"aa","इ":"i","ई":"ee","उ":"u","ऊ":"oo","ए":"e","ऐ":"ai","ओ":"o","औ":"au","अं":"an","ः":"h","क":"k","ख":"kh","ग":"g","घ":"gh","ङ":"ng","च":"ch","छ":"chh","ज":"j","झ":"jh","ञ":"ny","ट":"t","ठ":"th","ड":"d","ढ":"dh","ण":"n","त":"t","थ":"th","द":"d","ध":"dh","न":"n","प":"p","फ":"ph","ब":"b","भ":"bh","म":"m","य":"y","र":"r","ल":"l","व":"w","श":"sh","ष":"sh","स":"s","ह":"h","ा":"aa","ि":"i","ी":"ee","ु":"u","ू":"oo","े":"e","ै":"ai","ो":"o","ौ":"au","ं":"n","ँ":"n","्":"","़":"","।":"."," ":" ","\n":"\n"};
function hiToHinglish(t) {
  return t.split("").map(c => HI_MAP[c] !== undefined ? HI_MAP[c] : c).join("").replace(/a{3,}/g, "aa");
}

// ---------- English translation (cached, chunked) ----------
async function toEnglish(lines) {
  const key = lines.join("\n").slice(0, 200);
  if (state.translatedCache[key]) return state.translatedCache[key];
  const chunk = lines.join("\n").slice(0, 900); // single call to save the free quota
  try {
    const r = await fetch("https://api.mymemory.translated.net/get?q=" + encodeURIComponent(chunk) + "&langpair=hi|en");
    const j = await r.json();
    const out = (j.responseData?.translatedText || "").split("\n");
    while (out.length < lines.length) out.push(out[out.length - 1] || "");
    state.translatedCache[key] = out;
    return out;
  } catch (e) { return lines.map(() => "(English version unavailable — showing the original instead.)"); }
}

// ---------- Render ----------
function currentProgression() {
  return state.progression.map(c => transposeChord(c, state.transpose));
}

function renderLyrics() {
  const box = $("lyrics");
  box.innerHTML = "";
  const prog = currentProgression();
  state.lyricsLines.forEach((line, i) => {
    const chord = prog[i % prog.length];
    const div = document.createElement("div");
    div.className = "line";
    const cb = document.createElement("span");
    cb.className = "chord"; cb.textContent = chord;
    cb.onclick = () => highlightChord(chord);
    const tx = document.createElement("div");
    tx.className = "txt"; tx.textContent = line;
    div.appendChild(cb); div.appendChild(tx);
    box.appendChild(div);
  });
  if (prog.length) highlightChord(prog[0]);
}

async function renderLang() {
  if (state.lang === "original") {
    renderLyrics();
  } else if (state.lang === "hinglish") {
    const src = state.lyricsLines.join("\n");
    state.lyricsLinesHinglish = state.lyricsLines.map(l => isHindi(l) ? hiToHinglish(l) : l);
    const keep = state.lyricsLines;
    state.lyricsLines = state.lyricsLinesHinglish;
    renderLyrics();
    state.lyricsLines = keep;
  } else {
    $("lyrics").innerHTML = "<p class='muted'>Finding the English version…</p>";
    const en = await toEnglish(state.lyricsLines);
    const keep = state.lyricsLines;
    state.lyricsLines = en;
    renderLyrics();
    state.lyricsLines = keep;
  }
}

// ---------- Piano ----------
const WHITE = ["C","D","E","F","G","A","B"];
function buildPiano() {
  const p = $("piano");
  p.innerHTML = "";
  const row = document.createElement("div");
  row.className = "piano-row";
  const whites = [];
  for (let oct = 0; oct < 2; oct++) {
    WHITE.forEach(n => {
      const d = document.createElement("div");
      d.className = "key-w"; d.dataset.note = n; d.dataset.oct = oct;
      d.title = n;
      row.appendChild(d); whites.push(d);
    });
  }
  p.appendChild(row);
  // black keys positioned by white index
  const blackAfter = { 0:"C#", 1:"D#", 3:"F#", 4:"G#", 5:"A#" };
  whites.forEach((w, idx) => {
    const pos = idx % 7;
    if (blackAfter[pos] !== undefined) {
      const b = document.createElement("div");
      b.className = "key-b"; b.dataset.note = blackAfter[pos];
      const whiteW = 100 / whites.length;
      b.style.left = `calc(${(idx + 1) * whiteW}% - 13px)`;
      b.title = blackAfter[pos];
      p.appendChild(b);
    }
  });
}

function highlightChord(chord) {
  $("current-chord").textContent = chord;
  const notes = chordNotes(chord);
  document.querySelectorAll("#piano .key-w, #piano .key-b").forEach(k => {
    k.classList.toggle("active", notes.includes(k.dataset.note));
  });
}

// ---------- Main flow ----------
async function handleSubmit(url) {
  hideError();
  const vid = extractVideoId(url);
  if (!vid) return showError("That YouTube link didn't work. Paste a youtube.com/watch?v=... or youtu.be/... link.");
  state.videoId = vid; state.youtubeUrl = "https://www.youtube.com/watch?v=" + vid;
  state.transpose = 0; $("tp-val").textContent = "0";
  $("result").hidden = true; $("loading").hidden = false;

  try {
    $("loading-text").textContent = "Finding your song…";
    const { title: full, author } = await fetchTitle(vid, state.youtubeUrl);
    const { artist, title } = parseArtistTitle(full, author);
    state.title = title; state.artist = artist;
    $("song-title").textContent = title;
    $("song-meta").textContent = (artist ? artist + " • " : "") + "YouTube • " + vid;

    $("player").innerHTML = `<iframe src="https://www.youtube.com/embed/${vid}" title="player" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;

    $("loading-text").textContent = "Finding lyrics…";
    const lyr = await fetchLyrics(artist, title);
    state.lyricsLines = lyr.lines.length ? lyr.lines : ["(No lyrics found for this video — try another link.)"];
    state.lyricsLang = isHindi(state.lyricsLines.join(" ")) ? "hindi" : "english";

    $("loading-text").textContent = "Finding piano chords…";
    const ch = await fetchChords(state.youtubeUrl, title, artist);
    state.progression = ch.progression.length ? ch.progression : [...window.DEFAULT_PROGRESSION];
    state.chordSource = ch.via;
    $("chord-source").textContent = "Chords source: " + ch.via;

    setLang("original");
    $("result").hidden = false;
    $("result").scrollIntoView({ behavior: "smooth" });
  } catch (e) {
    showError("Something went wrong: " + e.message);
  } finally {
    $("loading").hidden = true;
  }
}

function setLang(l) {
  state.lang = l;
  document.querySelectorAll(".lang-toggle button").forEach(b => b.classList.toggle("active", b.dataset.lang === l));
  renderLang();
}

function showError(m) { const e = $("error"); e.textContent = m; e.hidden = false; }
function hideError() { $("error").hidden = true; }

// auto-scroll
let scrollTimer = null;
function setupAutoscroll() {
  $("autoscroll").onchange = (e) => {
    clearInterval(scrollTimer);
    if (e.target.checked) {
      scrollTimer = setInterval(() => { $("lyrics").parentElement.scrollBy({ top: 24, behavior: "smooth" }); }, 1200);
    }
  };
}

// ---------- wire ----------
document.addEventListener("DOMContentLoaded", () => {
  buildPiano(); setupAutoscroll();
  $("link-form").addEventListener("submit", (e) => { e.preventDefault(); handleSubmit($("yt-url").value); });
  document.querySelectorAll(".chip").forEach(c => c.onclick = () => { $("yt-url").value = c.dataset.url; handleSubmit(c.dataset.url); });
  document.querySelectorAll(".lang-toggle button").forEach(b => b.onclick = () => setLang(b.dataset.lang));
  $("tp-up").onclick = () => { state.transpose++; $("tp-val").textContent = state.transpose; renderLyrics(); };
  $("tp-down").onclick = () => { state.transpose--; $("tp-val").textContent = state.transpose; renderLyrics(); };
});
