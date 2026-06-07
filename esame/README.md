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
