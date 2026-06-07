import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy, limit, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const $ = id => document.getElementById(id);

const state = { user:null, dip:new Map(), badge:new Map(), accessi:[], terminali:new Map(), presenze:new Map(), demo:{enabled:false,entrataScenario:'IN_ORARIO',uscitaScenario:'REGOLARE'}, unsubs:[] };

function toast(msg){ const t=$('toast'); t.textContent=msg; t.classList.remove('hidden'); setTimeout(()=>t.classList.add('hidden'),2600); }
function cleanUid(v){ return String(v||'').replaceAll(':','').replaceAll(' ','').trim().toUpperCase(); }
function fmtDate(v){ try{ if(!v) return '---'; if(v.toDate) return v.toDate().toLocaleString('it-IT'); return new Date(v).toLocaleString('it-IT'); }catch{return String(v)} }
function todayKey(){ return new Date().toISOString().slice(0,10); }
function pill(v){ const s=String(v||'---'); return `<span class="badgepill ${s.toLowerCase()}">${s}</span>`; }
function minutesToHM(m){ m=Number(m||0); return `${Math.floor(m/60)}h ${m%60}m`; }
function penaltyMinutes(a){
  const type = a?.tipoTimbratura;
  const basis = type === 'entrata' ? Number(a?.ritardoMinuti || 0) : type === 'uscita' ? Number(a?.uscitaAnticipataMinuti || 0) : 0;
  if(basis >= 15){
    // Ogni 15 minuti COMPLETI = 30 minuti persi.
    // Esempio: 35 min -> 1h, 45 min -> 1h30.
    return Math.floor(basis / 15) * 30;
  }
  return Number(a?.penalitaMinuti ?? Math.round(Number(a?.penalitaOre||0)*60));
}
function penaltyEuro(a){
  const mins = penaltyMinutes(a);
  const paga = Number(a?.pagaOrariaSimulata || 0);
  if(paga > 0) return (mins / 60) * paga;
  return Number(a?.penalitaEuro || 0);
}
function employeeName(id){ const d=state.dip.get(id); return d ? `${d.nome||''} ${d.cognome||''}`.trim() || id : id || '---'; }
function toDate(v){ try{ if(!v) return null; if(v.toDate) return v.toDate(); if(typeof v.seconds==='number') return new Date(v.seconds*1000); const d=new Date(v); return isNaN(d.getTime()) ? null : d; }catch{return null} }
function durationBetween(start, end=new Date()){
  const a=toDate(start); if(!a) return '---';
  const mins=Math.max(0, Math.floor((end-a)/60000));
  const h=Math.floor(mins/60); const m=mins%60;
  if(h<=0) return `${m} min`;
  return `${h}h ${m}m`;
}
function findBadgeByDipendente(id){ return [...state.badge.values()].find(b=>b.idDipendente===id); }
function workSchedule(d){
  const o=d?.orarioLavoro||{};
  return {inizio:o.inizio||'08:00', pausaInizio:o.pausaInizio||'12:00', pausaFine:o.pausaFine||'13:00', fine:o.fine||'17:00'};
}
function scheduleText(d){ const w=workSchedule(d); return `${w.inizio}-${w.pausaInizio} / ${w.pausaFine}-${w.fine}`; }
function timeToMin(t, fallback=0){ try{ const [h,m]=String(t).split(':').map(Number); return h*60+m; }catch{return fallback;} }
function workMinutesBetween(startMin, endMin, w){
  if(endMin <= startMin) return 0;
  let total = endMin - startMin;
  const bs = timeToMin(w.pausaInizio, -1), be = timeToMin(w.pausaFine, -1);
  if(bs >= 0 && be > bs){
    const os = Math.max(startMin, bs), oe = Math.min(endMin, be);
    if(oe > os) total -= (oe - os);
  }
  return Math.max(0,total);
}
function workingDurationBetween(start, end=new Date(), d){
  const s=toDate(start); if(!s) return '---';
  const sm=s.getHours()*60+s.getMinutes();
  const em=end.getHours()*60+end.getMinutes();
  return minutesToHM(workMinutesBetween(sm, em, workSchedule(d)));
}
function todayAccessesFor(id){ const t=todayKey(); return state.accessi.filter(a=>a.idDipendente===id && (a.dataOperativa===t || (toDate(a.dataOra)?.toISOString().slice(0,10)===t))); }
function todayPresenceFor(id){ const t=todayKey(); return [...state.presenze.values()].find(p=>p.idDipendente===id && p.dataOperativa===t) || null; }

async function isAdmin(user){ return (await getDoc(doc(db,'admins',user.uid))).exists(); }
function clearUnsubs(){ state.unsubs.forEach(u=>{try{u()}catch{}}); state.unsubs=[]; }

$('loginBtn').onclick = async()=>{
  $('loginError').textContent='';
  try{
    const cred = await signInWithEmailAndPassword(auth, $('email').value.trim(), $('password').value);
    if(!(await isAdmin(cred.user))){
      const uid=cred.user.uid;
      await signOut(auth);
      $('loginError').textContent=`Login riuscito, ma questo utente non è admin.\nCrea in Firestore il documento admins/${uid}`;
    }
  }catch(e){ $('loginError').textContent=e.message || String(e); }
};
$('logoutBtn').onclick = ()=>signOut(auth);

onAuthStateChanged(auth, async user=>{
  if(!user){
    clearUnsubs();
    $('loginScreen').classList.remove('hidden');
    $('appShell').classList.add('hidden');
    if($('userEmail')) $('userEmail').textContent='Non connesso';
    return;
  }
  if(!(await isAdmin(user))){ await signOut(auth); return; }
  state.user=user;
  $('loginScreen').classList.add('hidden');
  $('appShell').classList.remove('hidden');
  if($('userEmail')) $('userEmail').textContent=user.email;
  startRealtime();
});

document.querySelectorAll('.nav').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('.nav').forEach(x=>x.classList.remove('active')); b.classList.add('active');
  document.querySelectorAll('.view').forEach(x=>x.classList.remove('active')); $(b.dataset.view).classList.add('active');
  const titles={home:['Home','Panoramica generale del sistema.'],presenze:['Dipendenti live','Card visive di entrata/uscita e tempo di lavoro.'],dipendenti:['Dipendenti','Anagrafica, orari e regole di lavoro.'],badge:['Badge NFC','Associa badge NFC ai dipendenti.'],storico:['Storico accessi','Turni accoppiati: entrata e uscita nella stessa riga.'],terminali:['Terminali','Gestione telefoni lettori NFC.'],demo:['Modalità demo','Switch per simulare combo entrata/uscita.']};
  $('pageTitle').textContent=titles[b.dataset.view][0]; $('pageSub').textContent=titles[b.dataset.view][1];
});

function startRealtime(){
  clearUnsubs();
  state.unsubs.push(onSnapshot(collection(db,'dipendenti'), snap=>{ state.dip.clear(); snap.forEach(d=>state.dip.set(d.id,{id:d.id,...d.data()})); renderAll(); }));
  state.unsubs.push(onSnapshot(collection(db,'badge'), snap=>{ state.badge.clear(); snap.forEach(d=>state.badge.set(d.id,{uid:d.id,...d.data()})); renderAll(); }));
  state.unsubs.push(onSnapshot(query(collection(db,'accessi'), orderBy('dataOra','desc'), limit(300)), snap=>{ state.accessi=[]; snap.forEach(d=>state.accessi.push({id:d.id,...d.data()})); renderAll(); }));
  state.unsubs.push(onSnapshot(collection(db,'terminali'), snap=>{ state.terminali.clear(); snap.forEach(d=>state.terminali.set(d.id,{id:d.id,...d.data()})); renderTerminali(); renderHome(); }));
  state.unsubs.push(onSnapshot(collection(db,'presenze_giornaliere'), snap=>{ state.presenze.clear(); snap.forEach(d=>state.presenze.set(d.id,{id:d.id,...d.data()})); renderAll(); }));
  state.unsubs.push(onSnapshot(doc(db,'impostazioni_demo','global'), snap=>{ if(snap.exists()) state.demo={...state.demo,...snap.data()}; fillDemo(); renderHome(); }));
}
function renderAll(){ renderHome(); renderPresenzeCards(); renderDip(); renderBadge(); renderFilters(); renderAccessi(); }

function renderHome(){
  const t=todayKey(); const today=state.accessi.filter(a=>a.dataOperativa===t || (a.dataOra?.toDate && a.dataOra.toDate().toISOString().slice(0,10)===t));
  $('hDip').textContent=state.dip.size;
  $('hBadgeAttivi').textContent=[...state.badge.values()].filter(b=>b.stato==='attivo').length;
  $('hBadgeBloccati').textContent=[...state.badge.values()].filter(b=>['bloccato','smarrito'].includes(b.stato)).length;
  $('hAccessiOggi').textContent=today.length;
  $('hEntrate').textContent=today.filter(a=>a.tipoTimbratura==='entrata').length;
  $('hUscite').textContent=today.filter(a=>a.tipoTimbratura==='uscita').length;
  $('hRitardi').textContent=today.filter(a=>Number(a.ritardoMinuti||0)>0).length;
  $('hPenalita').textContent=minutesToHM(today.reduce((sum,a)=>sum+penaltyMinutes(a),0));
  $('homeRecent').innerHTML=state.accessi.slice().sort((a,b)=>accessSortDate(b)-accessSortDate(a)).slice(0,8).map(a=>`<div class="listitem"><strong>${a.nomeCompleto||a.uid} ${pill(a.tipoTimbratura)} ${pill(a.esito)}</strong><span>${fmtDate(a.dataOra)} · ${a.motivo||'---'} · ritardo ${a.ritardoMinuti||0} min · penalità ${minutesToHM(penaltyMinutes(a))}</span></div>`).join('') || '<div class="muted">Nessuna timbratura.</div>';
  $('homeDemo').innerHTML=`<strong>${state.demo.enabled?'Demo ATTIVA':'Demo disattivata'}</strong><br>Entrata: ${labelScenario(state.demo.entrataScenario)}<br>Uscita: ${labelScenario(state.demo.uscitaScenario)}<br><br><span class="muted">Con app v0.5.x: 1ª lettura = entrata, 2ª lettura = uscita.</span>`;
}


function renderPresenzeCards(){
  const box = $('employeeCards');
  if(!box) return;
  const now = new Date();
  const employees = [...state.dip.values()].sort((a,b)=>String(a.cognome||a.nome||a.id).localeCompare(String(b.cognome||b.nome||b.id)));
  $('presenzeClock') && ($('presenzeClock').textContent = 'Aggiornato: ' + now.toLocaleTimeString('it-IT', {hour:'2-digit', minute:'2-digit'}));
  if(!employees.length){ box.innerHTML = '<div class="card emptyState">Nessun dipendente registrato.</div>'; return; }
  box.innerHTML = employees.map(d=>{
    const name = `${d.nome||''} ${d.cognome||''}`.trim() || d.id;
    const pres = todayPresenceFor(d.id);
    const b = findBadgeByDipendente(d.id);
    const todayRows = todayAccessesFor(d.id);
    const todayEntrata = pres?.ultimaEntrataOra ? {oraRegistrata:pres.ultimaEntrataOra, dataOra:pres.ultimaEntrataAt} : todayRows.find(a=>a.tipoTimbratura==='entrata');
    const todayUscita = pres?.ultimaUscitaOra ? {oraRegistrata:pres.ultimaUscitaOra, dataOra:pres.ultimaUscitaAt} : todayRows.find(a=>a.tipoTimbratura==='uscita');
    const latestToday = pres?.ultimoTipo ? {tipoTimbratura:pres.ultimoTipo, oraRegistrata:pres.ultimoOrario} : todayRows[0];

    let status = 'Non entrato';
    let cls = 'notstarted';
    let timeInfo = 'Nessuna entrata oggi';

    if(latestToday?.tipoTimbratura === 'entrata'){
      status = 'Dentro'; cls = 'inside';
      timeInfo = 'Lavora da ' + workingDurationBetween(todayEntrata?.dataOra, now, d);
    } else if(latestToday?.tipoTimbratura === 'uscita'){
      status = 'Uscito'; cls = 'outside';
      timeInfo = 'Uscito alle ' + (todayUscita?.oraRegistrata || latestToday.oraRegistrata || '---');
    }

    const ritardo = pres?.ritardoMinuti ?? todayEntrata?.ritardoMinuti ?? 0;
    const penalitaMin = pres?.penalitaMinuti ?? penaltyMinutes(todayEntrata) + penaltyMinutes(todayUscita);
    const oreLavorate = pres?.oreLavorateMinuti ?? todayUscita?.oreLavorateMinuti ?? 0;
    const turno = scheduleText(d);
    const w = workSchedule(d);
    return `<div class="employee-card ${cls}">
      <div class="employee-top"><span class="employee-status ${cls}">${status}</span><span class="employee-id">${d.id}</span></div>
      <h3>${name}</h3>
      <p class="muted">${d.reparto || 'Reparto non impostato'} · ${d.ruolo || 'Ruolo non impostato'}</p>
      <div class="working-time">${timeInfo}</div>
      <div class="employee-info-grid">
        <div><span>Turno</span><strong>${turno}</strong></div>
        <div><span>Pausa</span><strong>${w.pausaInizio} - ${w.pausaFine}</strong></div>
        <div><span>Badge</span><strong>${b?.uid || '---'}</strong></div>
        <div><span>Entrata</span><strong>${todayEntrata?.oraRegistrata || '---'}</strong></div>
        <div><span>Uscita</span><strong>${todayUscita?.oraRegistrata || '---'}</strong></div>
        <div><span>Ritardo</span><strong>${ritardo} min</strong></div>
        <div><span>Penalità</span><strong>${minutesToHM(penalitaMin)}</strong></div>
        <div><span>Ore lavorate</span><strong>${minutesToHM(oreLavorate)}</strong></div>
      </div>
      <div class="employee-footer">Ultimo stato: <b>${status}</b></div>
    </div>`;
  }).join('');
}

function renderDip(){
  $('dipTable').innerHTML=[...state.dip.values()].map(d=>`<tr><td>${d.id}</td><td>${d.nome||''} ${d.cognome||''}</td><td>${d.reparto||'---'}</td><td>${pill(d.stato)}</td><td>${scheduleText(d)}</td><td>Toll. ${d.orarioLavoro?.tolleranzaRitardoMinuti??5} min<br>Pausa ${d.orarioLavoro?.pausaInizio||'12:00'}-${d.orarioLavoro?.pausaFine||'13:00'}<br>Scatto 15 min → 30 min<br>€${d.pagaOrariaSimulata??10}/h</td><td><div class="rowactions"><button class="btn secondary" data-edit-dip="${d.id}">Modifica</button><button class="btn danger" data-del-dip="${d.id}">Elimina</button></div></td></tr>`).join('');
  document.querySelectorAll('[data-edit-dip]').forEach(b=>b.onclick=()=>fillDip(b.dataset.editDip));
  document.querySelectorAll('[data-del-dip]').forEach(b=>b.onclick=()=>delDip(b.dataset.delDip));
}
function fillDip(id){ const d=state.dip.get(id); if(!d)return; const o=d.orarioLavoro||{}; $('dipId').value=d.id; $('dipNome').value=d.nome||''; $('dipCognome').value=d.cognome||''; $('dipReparto').value=d.reparto||''; $('dipRuolo').value=d.ruolo||''; $('dipStato').value=d.stato||'attivo'; $('dipInizio').value=o.inizio||'08:00'; $('dipPausaInizio').value=o.pausaInizio||'12:00'; $('dipPausaFine').value=o.pausaFine||'13:00'; $('dipFine').value=o.fine||'17:00'; $('dipTolleranza').value=o.tolleranzaRitardoMinuti??5; $('dipSoglia').value=o.sogliaPenalitaMinuti??15; $('dipPaga').value=d.pagaOrariaSimulata??10; toast('Dipendente caricato'); }
$('saveDip').onclick=async()=>{ const id=$('dipId').value.trim().toUpperCase(); if(!id)return toast('Inserisci ID dipendente'); await setDoc(doc(db,'dipendenti',id),{nome:$('dipNome').value.trim(),cognome:$('dipCognome').value.trim(),reparto:$('dipReparto').value.trim(),ruolo:$('dipRuolo').value.trim(),stato:$('dipStato').value,orarioLavoro:{inizio:$('dipInizio').value.trim()||'08:00',pausaInizio:$('dipPausaInizio').value.trim()||'12:00',pausaFine:$('dipPausaFine').value.trim()||'13:00',fine:$('dipFine').value.trim()||'17:00',tolleranzaRitardoMinuti:Number($('dipTolleranza').value||5),sogliaPenalitaMinuti:Number($('dipSoglia').value||15)},pagaOrariaSimulata:Number($('dipPaga').value||10),aggiornatoIl:serverTimestamp(),aggiornatoDa:state.user.uid},{merge:true}); toast('Dipendente salvato'); };
$('clearDip').onclick=()=>{ ['dipId','dipNome','dipCognome','dipReparto','dipRuolo'].forEach(id=>$(id).value=''); $('dipInizio').value='08:00'; $('dipPausaInizio').value='12:00'; $('dipPausaFine').value='13:00'; $('dipFine').value='17:00'; $('dipTolleranza').value=5; $('dipSoglia').value=15; $('dipPaga').value=10; };
async function delDip(id){ if(confirm('Eliminare '+id+'?')){ await deleteDoc(doc(db,'dipendenti',id)); toast('Dipendente eliminato'); } }

function renderBadge(){
  $('badgeTable').innerHTML=[...state.badge.values()].map(b=>`<tr><td><b>${b.uid}</b></td><td>${employeeName(b.idDipendente)}<br><span class="muted">${b.idDipendente||''}</span></td><td>${pill(b.stato)}</td><td>${b.tipo||'---'}</td><td>${fmtDate(b.ultimoUtilizzo)}<br><span class="muted">${b.ultimoTipoTimbratura||''}</span></td><td><div class="rowactions"><button class="btn secondary" data-edit-badge="${b.uid}">Modifica</button><button class="btn warning" data-block="${b.uid}">Blocca</button><button class="btn primary" data-unblock="${b.uid}">Sblocca</button><button class="btn danger" data-del-badge="${b.uid}">Elimina</button></div></td></tr>`).join('');
  document.querySelectorAll('[data-edit-badge]').forEach(b=>b.onclick=()=>fillBadge(b.dataset.editBadge));
  document.querySelectorAll('[data-block]').forEach(b=>b.onclick=()=>setBadgeStatus(b.dataset.block,'bloccato'));
  document.querySelectorAll('[data-unblock]').forEach(b=>b.onclick=()=>setBadgeStatus(b.dataset.unblock,'attivo'));
  document.querySelectorAll('[data-del-badge]').forEach(b=>b.onclick=()=>delBadge(b.dataset.delBadge));
}
function fillBadge(uid){ const b=state.badge.get(uid); if(!b)return; $('bUid').value=b.uid; $('bDip').value=b.idDipendente||''; $('bStato').value=b.stato||'attivo'; $('bTipo').value=b.tipo||'MIFARE Classic 1K'; $('bNote').value=b.note||''; toast('Badge caricato'); }
$('saveBadge').onclick=async()=>{ const uid=cleanUid($('bUid').value); const dip=$('bDip').value.trim().toUpperCase(); if(!uid||!dip)return toast('UID e ID dipendente obbligatori'); await setDoc(doc(db,'badge',uid),{idDipendente:dip,stato:$('bStato').value,tipo:$('bTipo').value.trim()||'MIFARE Classic 1K',note:$('bNote').value.trim(),aggiornatoIl:serverTimestamp(),aggiornatoDa:state.user.uid},{merge:true}); toast('Badge salvato'); };
$('clearBadge').onclick=()=>{ $('bUid').value=''; $('bDip').value=''; $('bStato').value='attivo'; $('bTipo').value='MIFARE Classic 1K'; $('bNote').value=''; };
async function setBadgeStatus(uid,stato){ await updateDoc(doc(db,'badge',uid),{stato,aggiornatoIl:serverTimestamp(),aggiornatoDa:state.user.uid}); toast('Badge '+stato); }
async function delBadge(uid){ if(confirm('Eliminare badge '+uid+'?')){ await deleteDoc(doc(db,'badge',uid)); toast('Badge eliminato'); } }

function renderFilters(){
  const old=$('fDip').value; $('fDip').innerHTML='<option value="">Tutti</option>'+[...state.dip.values()].map(d=>`<option value="${d.id}">${d.id} - ${d.nome||''} ${d.cognome||''}</option>`).join(''); $('fDip').value=old;
}
['fDip','fTipo','fEsito','fSearch'].forEach(id=>$(id).addEventListener('input',renderAccessi));
$('resetFilters').onclick=()=>{ $('fDip').value=''; $('fTipo').value=''; $('fEsito').value=''; $('fSearch').value=''; renderAccessi(); };
$('clearAllAccessi').onclick=async()=>{
  if(!confirm('Eliminare TUTTI gli accessi e resettare il giro entrata/uscita?')) return;
  const snap = await getDocs(collection(db,'accessi'));
  let count = 0;
  for(const d of snap.docs){ await deleteDoc(doc(db,'accessi',d.id)); count++; }
  const presSnap = await getDocs(collection(db,'presenze_giornaliere'));
  for(const d of presSnap.docs){ await deleteDoc(doc(db,'presenze_giornaliere',d.id)); }
  toast('Accessi eliminati: '+count+' · giro demo resettato');
};
async function deleteAccesso(id){
  if(!confirm('Eliminare questo accesso dallo storico?')) return;
  await deleteDoc(doc(db,'accessi',id));
  toast('Accesso eliminato');
}
function accessDateKey(a){
  return a?.dataOperativa || (toDate(a?.dataOra)?.toISOString().slice(0,10)) || 'senza-data';
}
function accessSortDate(a){
  // Per accoppiare entrata/uscita usiamo il momento reale in cui è stata salvata la timbratura.
  // In demo dataOra può essere sempre 08:35/17:00, quindi se usassimo dataOra le coppie successive verrebbero ordinate male.
  return toDate(a?.registratoIl) || toDate(a?.dataOra) || new Date(0);
}
function accessEvents(pair){
  return [pair.entry, pair.exit, pair.event].filter(Boolean);
}
function pairLatestDate(pair){
  return accessEvents(pair).map(accessSortDate).sort((a,b)=>b-a)[0] || new Date(0);
}
function pairMatchesType(pair, tipo){
  if(!tipo) return true;
  const ev = accessEvents(pair);
  if(tipo === 'negato') return ev.some(a => a.esito === 'negato' || a.tipoTimbratura === 'negato');
  return ev.some(a => a.tipoTimbratura === tipo);
}
function buildAccessPairs(rows){
  const groups = new Map();
  rows.forEach(a=>{
    const key = `${a.idDipendente || 'sconosciuto'}|${accessDateKey(a)}`;
    if(!groups.has(key)) groups.set(key, []);
    groups.get(key).push(a);
  });

  const pairs = [];
  for(const [key, group] of groups.entries()){
    const [idDipendente, dataOperativa] = key.split('|');
    // Non eliminiamo le timbrature uguali: in modalità demo due cicli possono avere la stessa ora simulata
    // ma sono eventi diversi. L'anti-doppia lettura è gestito dall'app Android.
    const sorted = group.slice().sort((a,b)=>accessSortDate(a)-accessSortDate(b));
    let openEntry = null;

    sorted.forEach(a=>{
      const type = a.tipoTimbratura;
      const isNormal = a.esito === 'consentito' && (type === 'entrata' || type === 'uscita');

      if(!isNormal){
        pairs.push({ idDipendente, dataOperativa, event:a });
        return;
      }

      if(type === 'entrata'){
        if(openEntry){
          pairs.push({ idDipendente, dataOperativa, entry:openEntry, exit:null });
        }
        openEntry = a;
      }else if(type === 'uscita'){
        if(openEntry){
          pairs.push({ idDipendente, dataOperativa, entry:openEntry, exit:a });
          openEntry = null;
        }else{
          pairs.push({ idDipendente, dataOperativa, entry:null, exit:a });
        }
      }
    });

    if(openEntry){
      pairs.push({ idDipendente, dataOperativa, entry:openEntry, exit:null });
    }
  }

  return pairs.sort((a,b)=>pairLatestDate(b)-pairLatestDate(a));
}

function accessSimpleBlock(a, type){
  const label = type === 'entrata' ? 'Entrata' : type === 'uscita' ? 'Uscita' : 'Evento';
  if(!a){
    return `<div class="histTime empty"><span>${label}</span><strong>---</strong><small>Non registrata</small></div>`;
  }
  const extra = type === 'entrata'
    ? `Ritardo ${a.ritardoMinuti || 0} min`
    : type === 'uscita'
      ? `Anticipo ${a.uscitaAnticipataMinuti || 0} min · Straord. ${a.straordinarioMinuti || 0} min`
      : (a.motivo || a.esito || '---');
  const cls = type === 'entrata' ? 'entry' : type === 'uscita' ? 'exit' : 'denied';
  return `<div class="histTime ${cls}">
    <div class="histTimeTop"><span>${label}</span><button class="plainX" data-del-accesso="${a.id}" title="Elimina timbratura">×</button></div>
    <strong>${a.oraRegistrata || fmtDate(a.dataOra)}</strong>
    <small>Prevista ${a.oraPrevista || '---'} · ${extra}</small>
  </div>`;
}

function renderAccessi(){
  const dip=$('fDip').value, tipo=$('fTipo').value, esito=$('fEsito').value, q=$('fSearch').value.toLowerCase().trim();
  const base=state.accessi.filter(a=>(!dip||a.idDipendente===dip)&&(!esito||a.esito===esito)&&(!q||JSON.stringify(a).toLowerCase().includes(q)));
  const pairs=buildAccessPairs(base).filter(p=>pairMatchesType(p,tipo));

  $('accessiTable').innerHTML=pairs.map(p=>{
    const ev = accessEvents(p);
    const first = p.entry || p.exit || p.event || {};
    const summary = p.exit || p.entry || p.event || {};
    const penMin = ev.reduce((sum,a)=>sum+penaltyMinutes(a),0);
    const penEuro = ev.reduce((sum,a)=>sum+penaltyEuro(a),0);
    const uid = first.uid || '---';
    const name = first.nomeCompleto || employeeName(first.idDipendente || p.idDipendente);
    const dateLabel = p.dataOperativa && p.dataOperativa !== 'senza-data' ? p.dataOperativa : fmtDate(pairLatestDate(p));
    const rowCls = p.event ? 'denied' : (p.entry && p.exit ? 'complete' : 'open');
    const entrataBlock = p.event ? accessSimpleBlock(p.event, 'evento') : accessSimpleBlock(p.entry, 'entrata');
    const uscitaBlock = p.event ? accessSimpleBlock(null, 'uscita') : accessSimpleBlock(p.exit, 'uscita');
    const action = ev.length > 1
      ? `<button class="btn danger smallBtn" data-del-pair="${ev.map(x=>x.id).join(',')}">Elimina coppia</button>`
      : `<button class="btn danger smallBtn" data-del-accesso="${ev[0]?.id || ''}">Elimina</button>`;

    return `<article class="historyItem ${rowCls}">
      <div class="histMain">
        <div class="histPerson">
          <span class="histDate">${dateLabel}</span>
          <strong>${name}</strong>
          <small>${first.idDipendente || p.idDipendente || '---'} · ${uid}</small>
        </div>
        <div class="histTimes">${entrataBlock}${uscitaBlock}</div>
      </div>
      <div class="histSummary">
        <div><span>Ore</span><b>${minutesToHM(summary.oreLavorateMinuti)}</b></div>
        <div><span>Ritardo</span><b>${summary.ritardoMinuti || p.entry?.ritardoMinuti || 0} min</b></div>
        <div><span>Anticipo</span><b>${summary.uscitaAnticipataMinuti || 0} min</b></div>
        <div><span>Penalità</span><b>${minutesToHM(penMin)}</b><small>€${penEuro.toFixed(2)}</small></div>
      </div>
      <div class="histActions">${action}</div>
    </article>`;
  }).join('') || '<div class="emptyHistory">Nessun accesso con questi filtri.</div>';

  document.querySelectorAll('[data-del-accesso]').forEach(b=>b.onclick=()=>deleteAccesso(b.dataset.delAccesso));
  document.querySelectorAll('[data-del-pair]').forEach(b=>b.onclick=async()=>{
    const ids = String(b.dataset.delPair||'').split(',').filter(Boolean);
    if(!ids.length) return;
    if(!confirm('Eliminare questa coppia entrata/uscita?')) return;
    for(const id of ids){ await deleteDoc(doc(db,'accessi',id)); }
    toast('Coppia eliminata');
  });
}

function renderTerminali(){
  $('terminaliTable').innerHTML=[...state.terminali.values()].map(t=>`<tr><td>${t.id}</td><td>${t.nome||'---'}</td><td>${t.puntoAccesso||'---'}</td><td>${pill(t.stato)}</td><td>${fmtDate(t.ultimoOnline)}</td><td>${t.ultimaLetturaUid||'---'}</td><td>${t.ultimaTimbraturaTipo||'---'}<br><span class="muted">${fmtDate(t.ultimaTimbraturaAt)}</span></td><td><div class="rowactions"><button class="btn primary" data-term-a="${t.id}">Attiva</button><button class="btn warning" data-term-w="${t.id}">In attesa</button><button class="btn danger" data-term-b="${t.id}">Blocca</button></div></td></tr>`).join('');
  document.querySelectorAll('[data-term-a]').forEach(b=>b.onclick=()=>setTerm(b.dataset.termA,'attivo'));
  document.querySelectorAll('[data-term-w]').forEach(b=>b.onclick=()=>setTerm(b.dataset.termW,'in_attesa'));
  document.querySelectorAll('[data-term-b]').forEach(b=>b.onclick=()=>setTerm(b.dataset.termB,'bloccato'));
}
async function setTerm(id,stato){ await updateDoc(doc(db,'terminali',id),{stato,aggiornatoIl:serverTimestamp(),aggiornatoDa:state.user.uid}); toast('Terminale '+stato); }

function labelScenario(s){ return {IN_ORARIO:'entrata in orario 07:58',RITARDO_LIEVE:'ritardo lieve 08:12',RITARDO_GRAVE:'ritardo grave 08:35',REGOLARE:'uscita regolare 17:00',STRAORDINARIO:'uscita in ritardo / straordinario 17:35',ANTICIPATA:'uscita anticipata 16:20'}[s]||s; }
let demoSaveTimer = null;
let applyingRemoteDemo = false;
function fillDemo(){
  applyingRemoteDemo = true;
  $('demoEnabled').checked=!!state.demo.enabled;
  $('demoEntrata').value=state.demo.entrataScenario||'IN_ORARIO';
  $('demoUscita').value=state.demo.uscitaScenario||'REGOLARE';
  updatePreview();
  applyingRemoteDemo = false;
}
function toggleDemoOptions(){
  const on = $('demoEnabled').checked;
  $('demoOptions').classList.toggle('hidden', !on);
  $('demoOffMessage').classList.toggle('hidden', on);
  $('demoSaveStatus').textContent = on ? 'Salvataggio automatico attivo' : 'Demo OFF';
}
function updatePreview(){
  toggleDemoOptions();
  $('demoPreview').innerHTML=`<b>${$('demoEnabled').checked?'Demo attiva':'Demo disattivata'}</b><br>Prima lettura badge → ENTRATA: ${labelScenario($('demoEntrata').value)}<br>Seconda lettura badge → USCITA: ${labelScenario($('demoUscita').value)}`;
}
async function forceNextTimbratura(tipo){
  for(const p of state.presenze.values()){
    await setDoc(doc(db,'presenze_giornaliere',p.id),{
      prossimaTimbratura: tipo,
      resetDemoIl: serverTimestamp(),
      resetDemoDa: state.user.uid
    },{merge:true});
  }
}
function scheduleDemoAutoSave(resetOnEnable=false){
  if(applyingRemoteDemo || !state.user) return;
  updatePreview();
  $('demoSaveStatus').textContent = 'Salvataggio...';
  clearTimeout(demoSaveTimer);
  demoSaveTimer = setTimeout(async()=>{
    const wasOff = !state.demo.enabled;
    const isOn = $('demoEnabled').checked;
    await setDoc(doc(db,'impostazioni_demo','global'),{
      enabled:isOn,
      entrataScenario:$('demoEntrata').value,
      uscitaScenario:$('demoUscita').value,
      aggiornatoIl:serverTimestamp(),
      aggiornatoDa:state.user.uid
    },{merge:true});
    if(resetOnEnable && isOn && wasOff){ await forceNextTimbratura('entrata'); }
    $('demoSaveStatus').textContent = isOn ? 'Salvato automaticamente' : 'Demo OFF salvata';
  }, 450);
}
$('demoEnabled').onchange=()=>scheduleDemoAutoSave(true);
$('demoEntrata').onchange=()=>scheduleDemoAutoSave(false);
$('demoUscita').onchange=()=>scheduleDemoAutoSave(false);
$('resetPresenze').onclick=async()=>{ if(!confirm('Resetto tutte le presenze giornaliere: la prossima lettura sarà ENTRATA?')) return; await forceNextTimbratura('entrata'); toast('Reset demo fatto: prossima lettura = ENTRATA'); };
$('forceUscita').onclick=async()=>{ if(!confirm('Forzo tutte le presenze: la prossima lettura sarà USCITA?')) return; await forceNextTimbratura('uscita'); toast('Prossima lettura impostata su USCITA'); };
setInterval(()=>renderPresenzeCards(), 30000);
fillDemo();
