# Firebase setup stream

Ho aggiornato `stream/stream.html` con una grafica dark tipo portale streaming, login/registrazione Firebase e salvataggio dati utente.

## Cose da attivare in Firebase

1. Authentication > Sign-in method > abilita Email/Password.
2. Firestore Database > crea database.
3. Rules > incolla il contenuto di `firebase-firestore-rules.txt`.

## Collezioni usate

- `users/{uid}`: profilo base utente
- `users/{uid}/watchProgress/{mediaKey}`: continua a guardare
- `users/{uid}/myList/{itemId}`: mia lista

## Player

Il template è pronto per sorgenti video legali MP4/HLS. Apri `stream/stream.html` e cerca:

```js
const LEGAL_VIDEO_SOURCES = {
  // "movie_550": "https://tuo-dominio.it/video/fight-club-demo.mp4",
  // "tv_1399_s1_e1": "https://tuo-dominio.it/video/episodio-demo.mp4"
};
```

Aggiungi solo URL di video che possiedi o che hai licenza di usare.
