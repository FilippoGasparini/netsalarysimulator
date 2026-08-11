# Da RAL a netto — prototipo per task JetHR

Calcolatore che parte da una retribuzione annua lorda e restituisce netto annuo, netto mensile e il dettaglio di ogni voce trattenuta, con la formula che l'ha prodotta.

**Anno d'imposta 2026.** Impiegato a tempo indeterminato, settore privato, residente a Milano, senza agevolazioni.

## Come si apre

Apri `index.html` in un browser. Non serve altro: nessun build, nessuna dipendenza, nessuna chiamata di rete oltre ai font. Funziona anche offline e da file locale. Ho fatto questa scelta perchè trattandosi di un MVP per take home assignment non era necessaria un'architettura in Python con Flask/FastAPI.

Per lanciare i test da riga di comando:

```bash
node verifica.mjs
```

## Come funziona il calcolo

Il motore vive nel blocco `<script id="motore">` di `index.html`: sono funzioni pure, senza dipendenze dal DOM. `verifica.mjs` non lo duplica, lo **estrae** dalla pagina e lo valuta, così i test girano per costruzione sullo stesso codice che serve l'interfaccia, e non su una copia che può divergere.

L'ordine conta, perché ogni passo definisce la base del successivo.

1. **Contributi previdenziali** — 9,19% sulla RAL, più 1% sulla quota oltre 56.224 €, con massimale a 122.295 €. Vanno tolti per primi: sono deducibili e abbassano la base imponibile IRPEF.
2. **Imponibile fiscale** = RAL − contributi. Senza altri redditi coincide col reddito complessivo, che è il parametro a cui guardano quasi tutte le misure successive.
3. **IRPEF lorda** — aliquote progressive per scaglioni: 23% / 33% / 43%.
4. **Detrazione per lavoro dipendente** (art. 13 TUIR) — formula decrescente sul reddito complessivo, più 65 € fissi nella fascia 25.001–35.000 €. Il rapporto interno alla formula si tronca alla quarta cifra decimale, non si arrotonda.
5. **Taglio del cuneo** — due misure alternative: fino a 20.000 € di reddito una somma che non concorre al reddito, oltre una detrazione aggiuntiva che si azzera a 40.000 €.
6. **IRPEF netta** = lorda − detrazioni, con pavimento a zero. Le detrazioni non generano credito: quello che eccede si perde, e il prototipo lo dichiara esplicitamente riga per riga.
7. **Trattamento integrativo** — 1.200 € sotto i 15.000 € di reddito, se c'è capienza.
8. **Addizionali** regionale e comunale sull'imponibile, senza detrazioni.
9. **Netto** = RAL − contributi − imposte + somme esenti.

## Parametri e fonti

| Voce | Valore | Riferimento |
|---|---|---|
| Aliquote IRPEF | 23% ≤ 28.000 · 33% ≤ 50.000 · 43% oltre | Art. 11 TUIR, come modificato dalla L. 199/2025 (Legge di Bilancio 2026), che ha portato il secondo scaglione dal 35% al 33% |
| Contributi a carico dipendente | 9,19% · +1% oltre 56.224 € · massimale 122.295 € | Circolare INPS n. 6 del 30 gennaio 2026 |
| Detrazione lavoro dipendente | 1.955 € · 1.910 + 1.190 × (28.000 − RC)/13.000 · 1.910 × (50.000 − RC)/22.000 · +65 € tra 25.001 e 35.000 | Art. 13 c. 1 e 1.1 TUIR; minimo 690 € per il tempo indeterminato |
| Cuneo, somma esente | 7,1% ≤ 8.500 · 5,3% ≤ 15.000 · 4,8% ≤ 20.000, sull'imponibile | Art. 1 c. 4-5 L. 207/2024; percentuale applicata al reddito imponibile, circ. AdE 4/2025 |
| Cuneo, ulteriore detrazione | 1.000 € fino a 32.000 · 1.000 × (40.000 − RC)/8.000 fino a 40.000 | Art. 1 c. 6-9 L. 207/2024 |
| Trattamento integrativo | 1.200 € sotto 15.000 €, con capienza | Art. 1 D.L. 3/2020 |
| Addizionale regionale Lombardia | 1,23% · 1,58% · 1,72% · 1,73% | Delibera regionale, banca dati Dipartimento delle Finanze |
| Addizionale comunale Milano | 0,80%, esenzione fino a 23.000 € | Comune di Milano, regolamento addizionale comunale IRPEF |

I parametri sono raccolti in un unico oggetto `PARAMETRI_2026` in cima al motore: cambiare anno d'imposta significa toccare quello, non la logica.

## Semplificazioni

Assunte:

- Impiegato a tempo indeterminato, full time, rapporto attivo tutto l'anno.
- Domicilio fiscale a Milano per l'intero anno.
- Nessun familiare a carico, nessun onere detraibile o deducibile, nessun regime agevolato.
- Nessun altro reddito: reddito complessivo = imponibile da lavoro dipendente.
- RAL interamente imponibile: niente welfare, fringe benefit, rimborsi esenti, straordinari o premi a tassazione agevolata.
- TFR fuori dal netto: è retribuzione differita a tassazione separata.
- Somma esente e trattamento integrativo **si sommano** al netto invece di essere ricavati dalla RAL, perché sono crediti erogati dal datore e recuperati in compensazione, non parte del lordo contrattuale.

Fuori perimetro:

- Il singolo cedolino. Il calcolo è annuale e poi diviso: nel mese reale le detrazioni seguono i giorni del mese e la tredicesima non se le porta dietro, quindi i singoli mesi si discostano dalla media.
- Conguaglio di fine anno e più rapporti nello stesso anno.
- Taglio forfetario di 440 € sulle detrazioni per oneri oltre 200.000 € di reddito: qui non ci sono oneri detraibili.
- Contribuzione a carico azienda e costo del lavoro.
- Esenzioni locali diverse dalla soglia di Milano.

## Quattro gradini nella norma

Facendo scorrere il calcolo su tutte le RAL da 0 a 200.000 € emergono quattro punti in cui **il netto scende mentre il lordo sale**.

| Soglia (imponibile) | RAL corrispondente | Cosa succede | Costo | Serve per rientrare |
|---|---|---|---|---|
| 8.500 € | 9.360,20 € | La somma esente scende dal 7,1% al 5,3% | −152,98 € | +208 € di RAL |
| 15.000 € | 16.518,00 € | Decade il trattamento integrativo, quasi compensato dal salto della detrazione art. 13 | −130,10 € | +202 € di RAL |
| 23.000 € | 25.327,61 € | Si attiva l'addizionale comunale di Milano sull'intero imponibile | −183,99 € | +310 € di RAL |
| 35.000 € | 38.542,01 € | Decade la maggiorazione di 65 € della detrazione | −64,99 € | +166 € di RAL |

Il prototipo lo segnala all'utente: se la RAL inserita cade appena oltre una di queste soglie, compare un avviso che dice di quanto andrebbe abbassata e quanto netto in più ne verrebbe. È il caso d'uso che mi sembra più utile per chi progetta un piano retributivo: un aumento da 200 € su una RAL di 25.200 € può ridurre lo stipendio che il dipendente porta a casa.

## Verifica

`node verifica.mjs` esegue tre livelli di controllo.

1. **Dieci casi di prova** con valori attesi calcolati a mano dalle formule di legge, non copiati dall'output del codice. Coprono il caso standard, l'esenzione comunale, la somma esente del cuneo, il contributo aggiuntivo dell'1% oltre la prima fascia, l'azzeramento della detrazione oltre 50.000 € e i due lati della soglia comunale.
2. **Settanta invarianti strutturali** su quattordici livelli di RAL: quadratura del conto, netto mai negativo, IRPEF netta mai negativa, non cumulabilità di somma esente e ulteriore detrazione.
3. **Rilevamento dei gradini**: il calcolo scorre da 0 a 200.000 € a passi di 10 € e verifica che le discontinuità siano esattamente le quattro soglie dichiarate.

Gli stessi dieci casi girano anche in pagina a ogni caricamento, in fondo alla schermata.

## Se lavorassi in JetHR

- **Demo in Python**, per portarlo verso un prodotto reale, sposterei il calculation engine su un backend Python, trasformandolo in un componente indipendente e testabile, utilizzabile da più prodotti e canali. Valuterei React+Next.js per Front-End.
- **Calcolo inverso**: dato un netto obiettivo, la RAL necessaria. È la domanda che si fa in sede di offerta, e il gradino di Milano la rende meno banale di quanto sembri.
- **Comune e regione parametrici**, leggendo la tabella del Dipartimento delle Finanze invece di cablare Milano.
- **Familiari a carico e oneri detraibili**, i due fattori che spostano di più il risultato reale.
- **Cedolino mese per mese** invece della media annuale, con la tredicesima trattata come è davvero.

---

Prototipo a scopo dimostrativo.
