import json,sys
def fix(t):
    s=t.index('const APP_DATA = ')+17
    d,n=json.JSONDecoder().raw_decode(t[s:])
    if not d['yearly']:
        d['yearly']=[{'name':p['name'],'hcp':p['hcp'],'pts':0,'scores':[0]*34} for p in d['roster']]
        d['weeklyPayout']=[{'name':p['name'],'results':['']*34,'total':0} for p in d['roster']]
        t=t[:s]+json.dumps(d,separators=(',',':'))+t[s+n:]
    rep=[
     ("  const sorted = [...APP_DATA.yearly].sort((a,b)=>b.pts-a.pts);\n  const medals = ['🥇','🥈','🥉'];\n  document.getElementById('yr-body').innerHTML = sorted.map((p,rank)=>(rank===3?playBetterRow(dates.length+2):'')+`\n    <tr>\n      <td class=\"fw\" style=\"min-width:130px\"><span class=\"medal\">${medals[rank]||LOSER_EMOJI}</span> ${p.name}</td>",
      "  const sorted = [...APP_DATA.yearly].sort((a,b)=>b.pts-a.pts || a.name.localeCompare(b.name));\n  const medals = ['🥇','🥈','🥉'];\n  const anyPts = sorted.some(p => p.pts > 0); // no medals or faces before the first week is played\n  document.getElementById('yr-body').innerHTML = sorted.map((p,rank)=>(anyPts&&rank===3?playBetterRow(dates.length+2):'')+`\n    <tr>\n      <td class=\"fw\" style=\"min-width:130px\"><span class=\"medal\">${anyPts?(medals[rank]||LOSER_EMOJI):''}</span> ${p.name}</td>"),
     ("  const sortedPayout = [...APP_DATA.weeklyPayout].sort((a,b)=>(b.total||0)-(a.total||0));\n  const payoutMedals = ['🥇','🥈','🥉'];\n  document.getElementById('wp-body').innerHTML = sortedPayout.map((p,rank)=>(rank===3?playBetterRow(dates.length+2):'')+`\n    <tr>\n      <td class=\"fw\" style=\"min-width:130px\"><span class=\"medal\">${payoutMedals[rank]||LOSER_EMOJI}</span> ${p.name}</td>",
      "  const sortedPayout = [...APP_DATA.weeklyPayout].sort((a,b)=>(b.total||0)-(a.total||0) || a.name.localeCompare(b.name));\n  const payoutMedals = ['🥇','🥈','🥉'];\n  const anyPaid = sortedPayout.some(p => p.results.some(r => ['1','2','3','P'].includes(r)));\n  document.getElementById('wp-body').innerHTML = sortedPayout.map((p,rank)=>(anyPaid&&rank===3?playBetterRow(dates.length+2):'')+`\n    <tr>\n      <td class=\"fw\" style=\"min-width:130px\"><span class=\"medal\">${anyPaid?(payoutMedals[rank]||LOSER_EMOJI):''}</span> ${p.name}</td>"),
    ]
    for a,b in rep:
        if t.count(a)!=1: raise SystemExit('pattern not found once')
        t=t.replace(a,b)
    return t
for f in sys.argv[1:]:
    src=open(f).read(); out=fix(src); open(f,'w').write(out); print('fixed',f)
