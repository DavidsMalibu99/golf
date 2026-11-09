// Checks maritime-core.js against Chuck's published Nov 7 2026 results.  usage: node tools/test-maritime.js
const M = require('../maritime-core.js');
const assert = require('assert');

// [name, hcp, flight, net, putts, pool]  (Nov 7 2026 standings)
const FIELD = [
 ['Hampton Bryan',12,1,70,28,1],['Jerry Duggan',8,1,73,33,0],['Cary Howell',5,1,73,30,1],['Gary Schuelke',14,1,73,32,1],
 ['Joe Escobar',15,1,73,30,1],['Chad Moore',4,1,73,28,1],['Robert Bell',14,1,74,33,1],['Bill Dawkins',13,1,77,33,0],
 ['Wilson Aldridge',9,1,78,29,1],['Chuck Schuler',16,1,78,29,1],['Jake Kelley',9,1,81,35,1],['Dave Dawson',14,1,81,29,1],
 ['Glenn Green',11,1,83,34,1],['Alan Sonnefeld',16,1,83,36,1],['Adam Denison',14,1,86,32,1],['Dean Horsley',12,1,88,35,1],
 ['David Meyer',10,1,90,37,1],['Karey Carter',15,1,92,32,1],
 ['David Maggard',19,2,69,33,1],['Joey Pannell',19,2,69,26,0],['Jerry Chovanec',34,2,71,29,1],['Ted Duke',21,2,76,36,1],
 ['Jerry January',23,2,76,38,1],['Dan Snyder',22,2,77,33,1],['Steve Woodward',18,2,78,35,1],['Joe Buford',19,2,78,37,0],
 ['Rick White',19,2,78,34,1],['Steve Donohue',32,2,78,31,0],['Richie Smith',18,2,80,28,1],['Gary Hartzo',23,2,80,36,1],
 ['Peter Sanders',22,2,82,31,1],['Walt Kleczkowski',18,2,84,33,0],['Brian Petrossi',19,2,84,36,1],['Wade Battles',31,2,84,31,0],
 ['Mike Cross',20,2,85,33,1],['Mike Black',18,2,89,32,1]
];
// Build a card that hits the gross; later holes (easy ones) take the extra strokes so the hard holes decide playoffs by name order
function card(gross, putts, bias){
  const s = M.PAR.slice(); let d = gross - 71; let i = 0;
  const order = M.BY_SI.slice().reverse();
  while(d !== 0){ const h = order[i % 18]; s[h] += d > 0 ? 1 : -1; d += d > 0 ? -1 : 1; i++; }
  if(bias){ s[M.BY_SI[0]] += bias; s[M.BY_SI[17]] -= bias; }
  const p = Array(18).fill(2); let pd = putts - 36; let k = 0; while(pd){ p[k%18] += pd>0?1:-1; pd += pd>0?-1:1; k++; }
  return { s: Object.assign({}, s), p: Object.assign({}, p) };
}
const players = FIELD.map(([name,hcp,flight,,,pool])=>({name,hcp,flight,pool:!!pool}));
const cards = {};
FIELD.forEach(([name,hcp,,net,putts])=>{ cards[name] = card(net+hcp, putts, 0); });
// Make Duggan win the 73 playoff, then Howell 3rd (Chuck: Duggan won on the 2nd hole, Howell 3rd)
cards['Jerry Duggan'].s[M.BY_SI[0]] -= 1; cards['Jerry Duggan'].s[M.BY_SI[17]] += 1;
cards['Cary Howell'].s[M.BY_SI[1]] -= 1; cards['Cary Howell'].s[M.BY_SI[17]] += 1;
// Maggard beats Pannell on the 1st playoff hole
cards['David Maggard'].s[M.BY_SI[0]] -= 1; cards['David Maggard'].s[M.BY_SI[17]] += 1;

const res = M.computeRound({ players, ctpHoles:[2,11], ctp:{1:{2:{name:'Dave Dawson'},11:{name:'Wilson Aldridge'}},2:{2:{name:'Joe Buford'},11:{name:'Dan Snyder'}}}, escCarry: 27 }, cards);

// Maritime Cup points, both flights, exactly as Chuck's Tournament Standings sheet
const expectCup = {'Hampton Bryan':10,'Jerry Duggan':9,'Cary Howell':8,'Gary Schuelke':6,'Joe Escobar':6,'Chad Moore':6,'Robert Bell':4,
  'Bill Dawkins':3,'Wilson Aldridge':1.5,'Chuck Schuler':1.5,'Jake Kelley':0,'Karey Carter':0,
  'David Maggard':10,'Joey Pannell':9,'Jerry Chovanec':8,'Ted Duke':6.5,'Jerry January':6.5,'Dan Snyder':5,
  'Steve Woodward':2.5,'Joe Buford':2.5,'Rick White':2.5,'Steve Donohue':2.5,'Richie Smith':0,'Mike Black':0};
for(const [n,v] of Object.entries(expectCup)) assert.strictEqual(res.cup[n], v, n+' cup '+res.cup[n]+' expected '+v);

const f1 = res.flights[1].standings;
assert.deepStrictEqual(f1.slice(0,3).map(e=>e.row.name), ['Hampton Bryan','Jerry Duggan','Cary Howell']);
const f2 = res.flights[2].standings;
assert.deepStrictEqual(f2.slice(0,2).map(e=>e.row.name), ['David Maggard','Joey Pannell']);
assert.strictEqual(f2[0].playoffHole, M.BY_SI[0]+1);

// Par 3 sidegame pots: 14 / 4 / 18 players -> $70 / $20 / $90
assert.deepStrictEqual(res.side.map(g=>g.pot), [70,20,90]);
// Strokes on the par 3s match the recap: Donohue (32) gets 6, Escobar (15) 2, Denison (14) 1, Bryan (12) 0
const p3 = h => M.PAR3.reduce((a,i)=>a+M.strokes(h,i),0);
assert.deepStrictEqual([p3(32),p3(15),p3(14),p3(12),p3(19)], [6,2,1,0,5]);
// Escobar Challenge pot = carry + $1 a man
assert.strictEqual(res.esc.pot, 27 + 36);
// Bonus points: Bryan 2 + 1.5 (won flight) = 3.5 before games; Dawson 2 + 1 CTP = 3
assert.strictEqual(res.bonus['Dawson'] , undefined);
assert.strictEqual(res.bonus['Dave Dawson'], 3);
assert.ok(res.bonus['Hampton Bryan'] >= 3.5);
assert.strictEqual(res.bonus['Wilson Aldridge'], 2 + 0.5 + 1);  // 9th/10th + CTP (Chuck: 3.5)

// Season view adds up rounds
const lines = M.roundSummary(res);
const s = M.season([{lines},{lines}], Object.fromEntries(FIELD.map(f=>[f[0],f[1]])));
assert.strictEqual(s.cup[0].cup, 20);
assert.strictEqual(s.pool.total, 29*10);
assert.deepStrictEqual(s.pool.split, [145,87,58]);
console.log('All Maritime checks passed.');
