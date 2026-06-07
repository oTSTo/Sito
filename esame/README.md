# Azienda Badge NFC — Dashboard v11

## Novità v10
- **Login screen separata**: quando non sei autenticato vedi solo il form di login, la sidebar e l'app sono completamente nascosti
- **Restyling completo**: font DM Sans/DM Mono, palette più raffinata, menu laterale riorganizzato con gruppi (Panoramica / Gestione / Dati)
- **Sidebar migliorata**: sezioni etichettate, icone, user box con indicatore connessione, pulsante Esci integrato
- **Form cards**: titoli chiari, campo `.field` con label+input allineati, layout grid migliorato
- **Stat cards**: monospace font, accenti colorati per categoria
- **Filtri storico**: layout a griglia, bottoni azione raggruppati

## Setup
1. Configura `firebase-config.js` con le tue credenziali Firebase
2. Apri `index.html` in un server locale (es. `npx serve .` oppure Live Server)
3. Crea in Firestore il documento `admins/{uid}` per il tuo utente

## File
| File | Descrizione |
|------|-------------|
| `index.html` | Struttura HTML con login screen separata |
| `styles.css` | Stili completi v10 |
| `app.js` | Logica Firebase + rendering |
| `firebase-config.js` | Credenziali Firebase (da configurare) |
| `firestore.rules` | Regole Firestore |


## Novità v11
- Storico accessi a 4 timbrature: entrata mattina, uscita pranzo, entrata pomeriggio, uscita sera.
- Riepilogo paghe ultimi 30 giorni visibile in dashboard.
- Esporta CSV mensile con ore lavorate, paga oraria, straordinari, penalità e totale.
- Evidenzia penalità su ritardi/uscite anticipate e straordinari su uscita oltre orario.


## Novità v12
- Storico accessi: supporto a più cicli nello stesso giorno tramite `turnoIndex`.
- Modalità demo: aggiunta `Data simulata`, così puoi simulare giorni diversi senza aspettare date reali.
- Se ripeti più entrate/uscite nello stesso giorno, la dashboard mostra ciclo 1, ciclo 2, ecc.


## Novità v13
- Nuova sezione menu: **Riepilogo paghe**.
- Lo **Storico accessi** ora mostra solo le timbrature/accessi.
- Il riepilogo paghe ha selezione mese, ricerca dipendente e pulsante **Esporta CSV mensile**.
- Aggiunto storico automatico dei mesi disponibili: se nello storico accessi ci sono mesi precedenti, compaiono come card cliccabili.


## Novità v14
- Aggiunta favicon del sito nella scheda del browser.
- File icona: `aziendabadge.ico`.
- Collegamento aggiunto in `index.html`:
  `<link rel="icon" href="./aziendabadge.ico" type="image/x-icon">`


## Novità v15
- Rimossa la sezione **Dipendenti live** dal menu.
- Rimossa la schermata con le card live dei dipendenti.
- Restano disponibili Home, Dipendenti, Badge NFC, Storico accessi, Riepilogo paghe, Terminali e Modalità demo.
