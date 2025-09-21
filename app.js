// ====== Stan ======
let deckImages = [];           // [{url,name,dataURL}] — dataURL to miniaturka zapisywana w historii
let filenameByURL = new Map(); // url -> name
let selectedSlotEl = null;
let currentSpread = null;

let readings = JSON.parse(localStorage.getItem("tarotReadings") || "[]");
let customSpreads = JSON.parse(localStorage.getItem("customSpreads") || "[]");

let page = 1;
const pageSize = 10;

// ====== skróty ======
const $ = sel => document.querySelector(sel);
const spreadEl   = $("#spread");
const galleryEl  = $("#gallery");
const deckInfoEl = $("#deckInfo");
const toastEl    = $("#toast");

// ====== helpery UI ======
function toast(msg){ toastEl.textContent = msg; toastEl.classList.add("show"); setTimeout(()=> toastEl.classList.remove("show"), 1600); }
const conf = $("#qConfidence"), confOut = $("#qConfOut"); if(conf&&confOut) conf.addEventListener("input", ()=> confOut.textContent = conf.value + "%");

// ====== motyw ======
const themeToggle = $("#themeToggle");
function setTheme(light){
  const isLight = !!light;
  document.addEventListener("DOMContentLoaded", () => {
  setTheme(localStorage.getItem("themeLight") === "1");

  const tgl = document.getElementById("themeToggle");
  if (tgl) {
    tgl.addEventListener("click", () => {
      const isLight = !(document.documentElement.classList.contains("light") || document.body.classList.contains("light"));
      setTheme(isLight);
    });
  }
});


  // przełącz klasę na <html> i <body> – zero wątpliwości co do zasięgu zmiennych
  document.documentElement.classList.toggle("light", isLight);
  document.body.classList.toggle("light", isLight);

  // ikonka na przycisku
  const btn = document.getElementById("themeToggle");
  if (btn) btn.textContent = isLight ? "☀️" : "🌙";

  // zapisz preferencję
  localStorage.setItem("themeLight", isLight ? "1" : "0");

  // kolor paska przeglądarki / PWA
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", isLight ? "#f7f7fb" : "#151522");
}

// ====== PWA (opcjonalnie) ======
let deferredPrompt; const installBtn=$("#installBtn");
window.addEventListener("beforeinstallprompt",(e)=>{e.preventDefault();deferredPrompt=e;installBtn.style.display="inline-block";});
installBtn.addEventListener("click", async()=>{ if(!deferredPrompt) return; deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt=null; installBtn.style.display="none"; });
if ("serviceWorker" in navigator) { navigator.serviceWorker.register("./service-worker.js").catch(()=>{}); }

// ====== utils ======
function blobToDataURL(blob){ return new Promise(res=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.readAsDataURL(blob); }); }
function loadImage(url){ return new Promise((res,rej)=>{ const i=new Image(); i.onload=()=>res(i); i.onerror=rej; i.src=url; }); }
// tworzy miniaturę do historii (mniejszy rozmiar → stabilny zapis)
async function makeThumbDataURL(url, maxH=220){
  const img = await loadImage(url);
  const ratio = img.width / img.height;
  const h = Math.min(maxH, img.height);
  const w = Math.round(h * ratio);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0, w, h);
  return c.toDataURL("image/jpeg", 0.82); // kompresja
}

// ====== Wczytywanie ZIP ======
$("#deckZip").addEventListener("change", async (e)=>{
  const file = e.target.files[0]; if(!file) return;
  try{
    const zip = await JSZip.loadAsync(file);
    const files = Object.values(zip.files)
      .filter(f => /\.(png|jpg|jpeg|gif|webp)$/i.test(f.name) && !f.dir)
      .sort((a,b)=> a.name.localeCompare(b.name,'pl',{numeric:true}));

    deckImages = []; filenameByURL.clear();
    for (const f of files){
      const blob = await f.async("blob");
      const url = URL.createObjectURL(blob);
      // generujemy dataURL-miniaturę od razu
      const thumb = await makeThumbDataURL(url, 220);
      deckImages.push({url, name:f.name, dataURL:thumb});
      filenameByURL.set(url, f.name);
    }
    deckInfoEl.textContent = `Załadowano ${deckImages.length} kart z ZIP.`;
    renderGallery(); toast("Talia z ZIP wczytana");
  }catch(err){
    console.error("ZIP error:", err);
    deckInfoEl.textContent = "Błąd ZIP — sprawdź obrazy JPG/PNG.";
    renderGallery();
  }finally{ e.target.value=""; }
});

// ====== Wczytywanie wielu obrazów ======
$("#deckImgs").addEventListener("change", async (e)=>{
  const files = Array.from(e.target.files || []).filter(f => /\.(png|jpg|jpeg|gif|webp)$/i.test(f.name));
  if(!files.length) return;
  deckImages = []; filenameByURL.clear();

  files.sort((a,b)=> a.name.localeCompare(b.name,'pl',{numeric:true}));
  for(const f of files){
    const url = URL.createObjectURL(f);
    const thumb = await makeThumbDataURL(url, 220);
    deckImages.push({url, name:f.name, dataURL:thumb});
    filenameByURL.set(url, f.name);
  }
  deckInfoEl.textContent = `Załadowano ${deckImages.length} kart (bez ZIP).`;
  renderGallery(); e.target.value=""; toast("Talia z obrazów wczytana");
});

// ====== Galeria ======
function renderGallery(){
  galleryEl.innerHTML = "";
  if(!deckImages.length){ galleryEl.classList.add("empty"); galleryEl.textContent="Galeria jest pusta — wgraj ZIP lub wybierz obrazy."; return; }
  galleryEl.classList.remove("empty");
  deckImages.forEach(({url,name})=>{
    const img=document.createElement("img");
    img.src=url; img.className="thumb"; img.title=name;
    img.addEventListener("click", ()=> placeSpecificCard(url));
    galleryEl.appendChild(img);
  });
}

// ====== Rozkłady domyślne ======
const spreadsDefault = {
  threeCards: [
    {key:"past",   label:"Przeszłość"},
    {key:"now",    label:"Teraźniejszość"},
    {key:"future", label:"Przyszłość"},
  ],
  cross: [
    {key:"situation", label:"Sytuacja"},
    {key:"challenge", label:"Wyzwanie"},
    {key:"advice",    label:"Rada"},
    {key:"outcome",   label:"Wynik"},
  ]
};

// ====== Render przycisków rozkładów (default + custom) ======
const spreadBtns = $("#spreadBtns");
function renderSpreadButtons(){
  spreadBtns.querySelectorAll("[data-custom]").forEach(el=> el.remove());
  customSpreads.forEach(cs=>{
    const b=document.createElement("button");
    b.className="btn"; b.dataset.custom=cs.id; b.textContent=`${cs.name} • własny`;
    b.addEventListener("click", ()=> buildCustomSpread(cs));
    spreadBtns.appendChild(b);

    // mały przycisk kasowania
    const del=document.createElement("button");
    del.className="btn subtle cbtn del"; del.textContent="Usuń";
    del.addEventListener("click",(ev)=>{ ev.stopPropagation(); deleteCustom(cs.id); });
    const wrap=document.createElement("span"); wrap.className="cbtn"; wrap.appendChild(b); wrap.appendChild(del);
    spreadBtns.appendChild(wrap);
  });
}
renderSpreadButtons();

spreadBtns.querySelectorAll("[data-spread]").forEach(btn=>{
  btn.addEventListener("click", ()=> buildDefaultSpread(btn.dataset.spread));
});

function buildDefaultSpread(type){
  currentSpread = type;
  spreadEl.className = type; spreadEl.innerHTML = "";
  spreadsDefault[type].forEach(sp=>{
    const slot=document.createElement("div"); slot.className="slot";
    slot.innerHTML = `<div class="label">${sp.label}</div><div class="card" data-key="${sp.key}">?</div>`;
    const cardEl = slot.querySelector(".card");
    cardEl.addEventListener("click", ()=> setActiveSlot(cardEl));
    spreadEl.appendChild(slot);
  });
  selectedSlotEl=null;
}

function setActiveSlot(cardEl){
  document.querySelectorAll(".slot").forEach(sl=> sl.classList.remove("active"));
  selectedSlotEl = cardEl; cardEl.parentElement.classList.add("active");
}

function placeSpecificCard(url){
  if(!selectedSlotEl){ toast("Kliknij najpierw slot w rozkładzie"); return; }
  selectedSlotEl.innerHTML=""; const img=document.createElement("img"); img.src=url; selectedSlotEl.appendChild(img);
  const reversed=$("#reversedMode").checked; selectedSlotEl.classList.toggle("reversed", reversed);
}

$("#clearSpread").addEventListener("click", ()=>{
  if(!currentSpread) return;
  spreadEl.querySelectorAll(".card").forEach(c=>{ c.classList.remove("reversed"); c.innerHTML="?"; });
  document.querySelectorAll(".slot").forEach(sl=> sl.classList.remove("active")); selectedSlotEl=null;
});

// ====== Kreator rozkładów ======
const dName=$("#dName"), dType=$("#dType"), dSlots=$("#dSlots"), dRows=$("#dRows"), dCols=$("#dCols"), dLabels=$("#dLabels"), dList=$("#dList");
const dGridWrap=$("#dGridWrap"), dSlotsWrap=$("#dSlotsWrap");

function toggleDesignerInputs(){
  const t=dType.value;
  if(t==="grid"){ dGridWrap.classList.remove("hidden"); dSlotsWrap.classList.add("hidden"); }
  else { dGridWrap.classList.add("hidden"); dSlotsWrap.classList.remove("hidden"); }
}
dType.addEventListener("change", toggleDesignerInputs); toggleDesignerInputs();

$("#dSave").addEventListener("click", ()=>{
  const name=(dName.value||"").trim(); if(!name) return toast("Podaj nazwę rozkładu");
  const type=dType.value;
  let labels=(dLabels.value||"").split("\n").map(s=>s.trim()).filter(Boolean);

  let meta={};
  if(type==="grid"){
    const rows=Math.max(1,Math.min(6, Number(dRows.value||1)));
    const cols=Math.max(1,Math.min(6, Number(dCols.value||1)));
    const total=rows*cols;
    if(!labels.length) labels=Array.from({length:total},(_,i)=>`Karta ${i+1}`);
    if(labels.length>total) labels=labels.slice(0,total);
    if(labels.length<total){
      for(let i=labels.length;i<total;i++) labels.push(`Karta ${i+1}`);
    }
    meta={rows, cols};
  }else{
    const slots = Math.max(1,Math.min(12, Number(dSlots.value||3)));
    if(!labels.length) labels=Array.from({length:slots},(_,i)=>`Karta ${i+1}`);
    if(labels.length>slots) labels=labels.slice(0,slots);
    if(labels.length<slots){ for(let i=labels.length;i<slots;i++) labels.push(`Karta ${i+1}`); }
  }

  const id = Date.now().toString(36);
  const def = { id, name, type, labels, meta };
  customSpreads.unshift(def);
  localStorage.setItem("customSpreads", JSON.stringify(customSpreads));
  renderSpreadButtons(); renderCustomList(); toast("Zapisano rozkład");
});

function renderCustomList(){
  dList.innerHTML="";
  if(!customSpreads.length){ dList.innerHTML=`<div class="muted">Brak własnych rozkładów.</div>`; return; }
  customSpreads.forEach(cs=>{
    const row=document.createElement("div"); row.className="chips";
    row.innerHTML = `<span class="chip">${cs.name}</span> <button class="btn subtle del">Usuń</button>`;
    row.querySelector(".del").addEventListener("click", ()=> deleteCustom(cs.id));
    dList.appendChild(row);
  });
}
function deleteCustom(id){
  customSpreads = customSpreads.filter(x=>x.id!==id);
  localStorage.setItem("customSpreads", JSON.stringify(customSpreads));
  renderSpreadButtons(); renderCustomList(); toast("Usunięto rozkład");
}
renderCustomList();

function buildCustomSpread(cs){
  currentSpread = `custom:${cs.id}`;
  spreadEl.className = cs.type.startsWith("line") ? `custom-${cs.type}` : "custom-grid";
  spreadEl.innerHTML="";

  const items = cs.labels.map((label,i)=>({ key:`c${i+1}`, label }));

  if(cs.type==="grid"){
    const {rows, cols} = cs.meta;
    spreadEl.style.display="grid";
    spreadEl.style.gridTemplateColumns = `repeat(${cols}, auto)`;
    spreadEl.style.gap = "1rem";
  }else{
    spreadEl.style.display="";
    spreadEl.style.gridTemplateColumns="";
  }

  items.forEach(sp=>{
    const slot=document.createElement("div"); slot.className="slot";
    slot.innerHTML = `<div class="label">${sp.label}</div><div class="card" data-key="${sp.key}">?</div>`;
    const cardEl = slot.querySelector(".card");
    cardEl.addEventListener("click", ()=> setActiveSlot(cardEl));
    spreadEl.appendChild(slot);
  });
  selectedSlotEl=null;
}

// ====== Zapis historii (miniatury, async) ======
$("#saveReading").addEventListener("click", async ()=>{
  if(!currentSpread){ toast("Wybierz rozkład"); return; }

  const cardEls = Array.from(spreadEl.querySelectorAll(".card"));
  let any = cardEls.some(c => c.querySelector("img"));
  if(!any){ toast("Wstaw przynajmniej jedną kartę"); return; }

  const cards = await Promise.all(cardEls.map(async el=>{
    const img = el.querySelector("img");
    const key = el.dataset.key;
    const label = el.parentElement.querySelector(".label").textContent;
    let name = "", dataURL = null, reversed=el.classList.contains("reversed");
    if(img){
      name = filenameByURL.get(img.src) || "";
      const found = deckImages.find(d=> d.url===img.src);
      dataURL = found ? found.dataURL : await makeThumbDataURL(img.src, 220);
    }
    return {key,label,name,reversed,dataURL};
  }));

  const note = {
    question : ($("#qQuestion")?.value || "").trim(),
    context  : ($("#qContext")?.value || "").trim(),
    feelings : ($("#qFeelings")?.value || "").trim(),
    interpretation : ($("#qInterpretation")?.value || "").trim(),
    insights : ($("#qInsights")?.value || "").trim(),
    actions  : ($("#qActions")?.value || "").trim(),
    tags     : ($("#qTags")?.value || "").trim(),
    confidence : Number($("#qConfidence")?.value || 0),
    freeText : ($("#noteInput")?.value || "").trim()
  };

  const reading = { id: Date.now(), when: new Date().toLocaleString(), type: currentSpread, cards, note };
  readings.unshift(reading);
  localStorage.setItem("tarotReadings", JSON.stringify(readings));
  $("#noteInput").value=""; renderHistory(); toast("Zapisano do historii");
  document.querySelectorAll(".slot").forEach(sl=> sl.classList.remove("active")); selectedSlotEl=null;
});

// ====== Historia ======
const historyBox=$("#history"), pageInfo=$("#pageInfo");
$("#prevPage").addEventListener("click", ()=>{ if(page>1){ page--; renderHistory(); }});
$("#nextPage").addEventListener("click", ()=>{ const max=Math.max(1,Math.ceil(readings.length/pageSize)); if(page<max){ page++; renderHistory(); }});

function escapeHTML(s){ return (s||"").replace(/[<>&"]/g,m=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[m])); }
function block(title, content){ if(!content) return ""; return `<div class="blk"><div class="blk-h">${title}</div><div class="blk-b">${escapeHTML(content)}</div></div>`; }

function renderHistory(){
  const maxPage = Math.max(1, Math.ceil(readings.length/pageSize));
  if(page>maxPage) page = maxPage;
  pageInfo.textContent = `Strona ${page}/${maxPage} • zapisów: ${readings.length}`;
  historyBox.innerHTML="";

  const start=(page-1)*pageSize, list=readings.slice(start,start+pageSize);
  list.forEach(r=>{
    let n=r.note; if(typeof n==="string") n={freeText:n};
    const title = r.type==="threeCards" ? "3 Karty" : r.type==="cross" ? "Mini Krzyż" : "Własny";
    const tags  = (n?.tags||"").split(",").map(t=>t.trim()).filter(Boolean);
    const miniTitle = n?.question ? `— <i>${escapeHTML(n.question)}</i>` : "";

    const item=document.createElement("div"); item.className="reading";
    item.innerHTML = `
      <div class="meta">📌 ${title} ${miniTitle} • <b>${r.when}</b></div>
      <div class="mini"></div>
      <details class="note-details">
        <summary>Szczegóły</summary>
        ${block("Kontekst", n?.context)}
        ${block("Emocje", n?.feelings)}
        ${block("Interpretacja", n?.interpretation)}
        ${block("Wnioski", n?.insights)}
        ${block("Działania", n?.actions)}
        ${tags.length ? `<div class="chips">${tags.map(t=>`<span class="chip">#${escapeHTML(t)}</span>`).join(" ")}</div>` : ""}
        ${Number.isFinite(n?.confidence) ? `<div class="muted">Pewność: <b>${n.confidence}%</b></div>` : ""}
        ${block("Notatki", n?.freeText)}
      </details>
      <div class="toolbar"><button class="btn subtle" data-del="${r.id}">Usuń</button></div>
    `;

    const mini=item.querySelector(".mini");
    r.cards.forEach(c=>{
      if(!c.dataURL) return;
      const img=document.createElement("img"); img.src=c.dataURL; if(c.reversed) img.style.transform="rotate(180deg)";
      img.title=`${c.label}${c.name ? " • "+c.name : ""}${c.reversed?" (odwr.)":""}`; mini.appendChild(img);
    });
    historyBox.appendChild(item);
  });

  historyBox.querySelectorAll("[data-del]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const id=Number(btn.dataset.del);
      readings = readings.filter(x=>x.id!==id);
      localStorage.setItem("tarotReadings", JSON.stringify(readings));
      renderHistory(); toast("Usunięto zapis");
    });
  });
}
renderHistory();
/* ==== TWARDY INIT PRZEŁĄCZNIKA MOTYWU ==== */
(function () {
  // Bezpieczne "apply" – ustawia motyw wg localStorage
  function setThemeSafe(isLight) {
    const root = document.documentElement;
    document.body.classList.toggle("light", !!isLight);
    root.classList.toggle("light", !!isLight);

    const btn = document.getElementById("themeToggle");
    if (btn) btn.textContent = isLight ? "☀️" : "🌙";

    localStorage.setItem("themeLight", isLight ? "1" : "0");

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", isLight ? "#f7f7fb" : "#151522");

    console.log("[theme] applied:", isLight ? "LIGHT" : "DARK");
  }

  // Wystawiamy globalną awaryjną funkcję (możesz wywołać w konsoli: __themeToggle())
  window.__themeToggle = function () {
    const isLightNow =
      document.body.classList.contains("light") ||
      document.documentElement.classList.contains("light");
    setThemeSafe(!isLightNow);
  };

  // Po załadowaniu DOM: ustaw i podłącz klik
  function arm() {
    const saved = localStorage.getItem("themeLight") === "1";
    setThemeSafe(saved);

    const tgl = document.getElementById("themeToggle");
    if (!tgl) {
      console.warn("[theme] #themeToggle nie znaleziony – sprawdź HTML");
      return;
    }
    // Usuwamy ewentualne stare listenery i dodajemy nasz
    tgl.onclick = null;
    tgl.addEventListener("click", window.__themeToggle);
    console.log("[theme] switch armed");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", arm);
  } else {
    arm();
  }
})();
