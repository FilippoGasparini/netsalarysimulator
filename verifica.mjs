/**
 * verifica.mjs — esegue i casi di prova del motore da riga di comando.
 *
 *   node verifica.mjs
 *
 * Il motore non viene duplicato: questo script estrae il blocco
 * <script id="motore"> da index.html e lo valuta. È quindi garantito
 * che i test girino esattamente sul codice che serve la pagina.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const qui = dirname(fileURLToPath(import.meta.url));
const pagina = readFileSync(join(qui, 'index.html'), 'utf8');

const blocco = pagina.match(/<script id="motore">([\s\S]*?)<\/script>/);
if (!blocco) {
  console.error('Motore non trovato in index.html: cerco <script id="motore">.');
  process.exit(1);
}

const modulo = { exports: {} };
vm.createContext(globalThis);
vm.runInThisContext(`(function(module, exports){${blocco[1]}\n})`)(modulo, modulo.exports);

const { calcolaNetto, eseguiProve, arrotonda2, SOGLIE_CRITICHE } = modulo.exports;

const soldi = n => new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

console.log('\nVerifica del motore — anno d\'imposta 2026\n');

const esiti = eseguiProve();
let falliti = 0;

for (const e of esiti) {
  if (!e.superata) falliti++;
  const marchio = e.superata ? '  ok  ' : ' FAIL ';
  console.log(
    `[${marchio}] ${e.nome.padEnd(12)} ${e.campo.padEnd(24)} atteso ${soldi(e.atteso).padStart(11)}   ottenuto ${soldi(e.ottenuto).padStart(11)}`
  );
  if (!e.superata) console.log(`          ↳ ${e.verifica}`);
}

console.log(`\n${esiti.length - falliti}/${esiti.length} prove superate.\n`);

// Controlli di coerenza strutturale: valgono per qualsiasi RAL.
const invarianti = [];
for (const ral of [0, 5000, 8500, 15000, 20000, 23000, 28000, 32000, 40000, 50000, 56224, 75000, 122295, 300000]) {
  const r = calcolaNetto({ ral, mensilita: 13 });

  invarianti.push({
    ral,
    nome: 'quadratura: RAL − trattenute + esenti = netto',
    ok: Math.abs(arrotonda2(ral - r.totaleTrattenute + r.cuneo.sommaEsente + r.trattamento.importo) - arrotonda2(r.nettoAnnuo)) < 0.01
  });
  invarianti.push({ ral, nome: 'netto mai negativo', ok: r.nettoAnnuo >= 0 });
  invarianti.push({ ral, nome: 'netto mai superiore alla RAL più le somme esenti', ok: r.nettoAnnuo <= ral + r.cuneo.sommaEsente + r.trattamento.importo + 0.01 });
  invarianti.push({ ral, nome: 'IRPEF netta mai negativa', ok: r.irpefNetta >= 0 });
  invarianti.push({ ral, nome: 'somma esente e ulteriore detrazione non cumulabili', ok: !(r.cuneo.sommaEsente > 0 && r.cuneo.detrazione > 0) });
}

const invariantiRotte = invarianti.filter(i => !i.ok);
if (invariantiRotte.length === 0) {
  console.log(`Invarianti: ${invarianti.length} controlli superati su 14 livelli di RAL.\n`);
} else {
  for (const i of invariantiRotte) console.log(`[ FAIL ] RAL ${i.ral}: ${i.nome}`);
  console.log('');
}

/* --------------------------------------------------------------------------
   Gradini. Il netto non è monotono rispetto alla RAL: alcune misure si
   attivano o decadono sull'intero importo, non sull'eccedenza. Il test non
   pretende monotonia, verifica che i punti di discontinuità siano esattamente
   le soglie dichiarate in SOGLIE_CRITICHE — un quinto gradino imprevisto
   segnalerebbe un errore nei parametri.
-------------------------------------------------------------------------- */
console.log('Gradini rilevati scorrendo la RAL da 0 a 200.000 € a passi di 10 €:\n');

const gradini = [];
let precedente = null;
for (let ral = 0; ral <= 200000; ral += 10) {
  const r = calcolaNetto({ ral, mensilita: 13 });
  if (precedente && r.nettoAnnuo < precedente.netto - 0.01) {
    gradini.push({ ral, imponibile: r.imponibile, salto: r.nettoAnnuo - precedente.netto });
  }
  precedente = { ral, netto: r.nettoAnnuo };
}

const attese = SOGLIE_CRITICHE.map(s => s.imponibile);
let gradiniInattesi = 0;
for (const g of gradini) {
  // il gradino deve cadere entro 10 € di imponibile sopra una soglia dichiarata
  const soglia = attese.find(s => g.imponibile > s && g.imponibile - s < 10);
  if (soglia) {
    console.log(`[  ok  ] RAL ${soldi(g.ral).padStart(10)} → imponibile supera ${soldi(soglia)}: netto ${soldi(g.salto)} €`);
  } else {
    gradiniInattesi++;
    console.log(`[ FAIL ] RAL ${soldi(g.ral).padStart(10)} → gradino non previsto, imponibile ${soldi(g.imponibile)}: netto ${soldi(g.salto)} €`);
  }
}
const sogliePerse = attese.filter(s => !gradini.some(g => g.imponibile > s && g.imponibile - s < 10));
for (const s of sogliePerse) console.log(`[ FAIL ] soglia dichiarata a ${soldi(s)} di imponibile ma nessun gradino rilevato`);

console.log(`\n${gradini.length - gradiniInattesi}/${gradini.length} gradini corrispondono alle soglie dichiarate.\n`);

process.exit(falliti + invariantiRotte.length + gradiniInattesi + sogliePerse.length > 0 ? 1 : 0);
