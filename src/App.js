import { useState, useEffect } from "react";

// ─── URL State Persistence ────────────────────────────────────────────────────
const encodeState = obj => {
  try {
    const str = JSON.stringify(obj);
    // Unicode-safe base64 (handles Spanish accents, ñ, etc.)
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g,
      (_, p) => String.fromCharCode(parseInt(p, 16))));
  } catch { return null; }
};

const decodeState = str => {
  if (!str) return null;
  try {
    const decoded = decodeURIComponent(
      Array.from(atob(str), c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
    );
    return JSON.parse(decoded);
  } catch { return null; }
};

const loadFromURL = () => decodeState(window.location.hash.slice(1));

// ─── CSS ──────────────────────────────────────────────────────────────────────
const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:#080a10;color:#e8eaf0;font-family:'IBM Plex Mono',monospace;-webkit-tap-highlight-color:transparent}
input[type=number]::-webkit-inner-spin-button,input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none}
input[type=number]{-moz-appearance:textfield}
.app{min-height:100vh;padding:16px;max-width:980px;margin:0 auto}
.hd{font-family:'Bebas Neue',sans-serif;letter-spacing:2px}
.groups-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:14px}
.round-tabs{display:flex;gap:8px;margin-bottom:20px;overflow-x:auto;padding-bottom:4px;-webkit-overflow-scrolling:touch;scrollbar-width:none}
.round-tabs::-webkit-scrollbar{display:none}
.ko-row{display:flex;align-items:center;gap:12px}
.ko-team{flex:1;min-width:60px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ko-team-home{text-align:right}
.ko-score-area{display:flex;gap:6px;align-items:center;justify-content:center;flex-shrink:0}
.ko-action{min-width:110px;flex-shrink:0;text-align:center}
.hero-title{font-size:72px}
.hero-sub{font-size:28px;letter-spacing:8px}
.phase-title{font-size:40px}

@media(max-width:640px){
  .app{padding:12px}
  .groups-grid{grid-template-columns:1fr}
  .hero-title{font-size:48px}
  .hero-sub{font-size:18px;letter-spacing:3px}
  .phase-title{font-size:28px}
  .ko-row{flex-wrap:wrap;gap:8px}
  .ko-team{min-width:calc(50% - 55px)}
  .ko-score-area{order:3;width:100%;justify-content:center;padding:4px 0}
  .ko-team-home{order:1}
  .ko-team-away{order:2}
  .ko-action{order:4;width:100%;min-width:unset}
  .ko-action button{width:100% !important}
}
`;

const C = {
  bg:'#080a10', surface:'#0e1018', card:'#13151f', border:'#1e2233',
  accent:'#c8f000', accentBg:'rgba(200,240,0,0.06)', accentBorder:'rgba(200,240,0,0.25)',
  text:'#e8eaf0', muted:'#4a5270', mutedLt:'#7a829a',
  win:'#c8f000', draw:'#f0b800', loss:'#f05050',
  gold:'#f0c040', silver:'#9098b0',
};

// ─── Data Helpers ─────────────────────────────────────────────────────────────
const shuffle = arr => {
  const a = [...arr];
  for (let i = a.length-1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i+1));
    [a[i],a[j]] = [a[j],a[i]];
  }
  return a;
};

const ROUND_NAMES = {2:'FINAL',4:'SEMIFINALES',8:'CUARTOS DE FINAL',16:'OCTAVOS DE FINAL',32:'RONDA DE 32'};
const rn = n => ROUND_NAMES[n] || `RONDA DE ${n}`;

function createGroups(teams) {
  const t = shuffle(teams);
  const ng = Math.max(1, Math.ceil(t.length / 4));
  const groups = Array.from({length:ng}, (_,i) => ({id:String.fromCharCode(65+i), teams:[], matches:[]}));
  t.forEach((team, i) => groups[i % ng].teams.push(team));
  groups.forEach(g => {
    const ts = g.teams;
    for (let i = 0; i < ts.length; i++)
      for (let j = i+1; j < ts.length; j++)
        g.matches.push({id:`${g.id}_${i}_${j}`, home:ts[i], away:ts[j], hs:'', as:'', played:false});
  });
  return groups;
}

function getStandings(group) {
  const s = Object.fromEntries(group.teams.map(t => [t, {t,pj:0,w:0,d:0,l:0,gf:0,gc:0,pts:0}]));
  group.matches.filter(m => m.played).forEach(m => {
    const h=s[m.home], a=s[m.away], hg=+m.hs, ag=+m.as;
    h.pj++; a.pj++; h.gf+=hg; h.gc+=ag; a.gf+=ag; a.gc+=hg;
    if (hg>ag){h.w++;h.pts+=3;a.l++;} else if (hg<ag){a.w++;a.pts+=3;h.l++;} else {h.d++;h.pts++;a.d++;a.pts++;}
  });
  return Object.values(s).sort((a,b) => b.pts-a.pts || (b.gf-b.gc)-(a.gf-a.gc) || b.gf-a.gf);
}

function createKnockout(groups) {
  const seeds = groups.flatMap(g => {
    const st = getStandings(g);
    return [st[0]?.t, st[1]?.t].filter(Boolean);
  });
  let size = 1;
  while (size < seeds.length) size *= 2;
  const padded = [...seeds, ...Array(size - seeds.length).fill(null)];
  const r1 = Array.from({length:size/2}, (_,i) => {
    const home=padded[i], away=padded[size-1-i], bye=!home||!away;
    return {id:`r0m${i}`, home:home||away, away:bye?null:away, hs:'', as:'', played:bye, winner:bye?(home||away):null};
  });
  const rounds = [{name:rn(size), matches:r1}];
  let cur = size/2;
  while (cur >= 2) {
    rounds.push({name:rn(cur), matches:Array.from({length:cur/2}, (_,i) => ({
      id:`r${rounds.length}m${i}`, home:null, away:null, hs:'', as:'', played:false, winner:null
    }))});
    cur /= 2;
  }
  // propagate bye wins
  for (let r = 0; r < rounds.length-1; r++)
    rounds[r].matches.forEach((m,i) => {
      if (m.winner) {
        const nm = rounds[r+1].matches[Math.floor(i/2)];
        if (i%2===0) nm.home = m.winner; else nm.away = m.winner;
      }
    });
  return rounds;
}

// ─── Shared Components ────────────────────────────────────────────────────────
const Btn = ({children, variant='primary', onClick, disabled, style={}}) => {
  const base = {fontFamily:"'Bebas Neue',sans-serif", letterSpacing:'1px', border:'none', cursor:'pointer',
    borderRadius:4, transition:'all .15s', WebkitTapHighlightColor:'transparent',
    opacity:disabled?.4:1, pointerEvents:disabled?'none':'all', ...style};
  const v = {
    primary: {background:C.accent, color:C.bg, padding:'11px 22px', fontSize:16},
    ghost:   {background:'transparent', color:C.text, padding:'9px 16px', fontSize:13, border:`1px solid ${C.border}`},
  };
  return <button style={{...base, ...v[variant]}} onClick={onClick}>{children}</button>;
};

const Tag = ({children, color=C.accent}) => (
  <span style={{fontFamily:"'Bebas Neue',sans-serif", letterSpacing:'1px', fontSize:11,
    padding:'2px 8px', borderRadius:3, background:'rgba(200,240,0,0.08)',
    color, border:`1px solid ${color}33`}}>{children}</span>
);

const ScoreInput = ({value, onChange}) => (
  <input type="number" min="0" inputMode="numeric" value={value} onChange={e => onChange(e.target.value)}
    style={{width:54, textAlign:'center', background:C.surface, border:`1px solid ${C.border}`,
      color:C.text, fontFamily:"'IBM Plex Mono',monospace", fontSize:20, fontWeight:600,
      padding:'8px 4px', borderRadius:4, outline:'none', touchAction:'manipulation'}}
    onFocus={e => e.target.style.borderColor=C.accent}
    onBlur={e  => e.target.style.borderColor=C.border}
  />
);

// ─── Setup Phase ──────────────────────────────────────────────────────────────
function SetupPhase({teams, onAdd, onRemove, onStart}) {
  const [val, setVal] = useState('');
  const add = () => {
    val.trim().split(',').map(s => s.trim()).filter(Boolean).forEach(n => { if (!teams.includes(n)) onAdd(n); });
    setVal('');
  };
  const ng = Math.max(1, Math.ceil(teams.length / 4));

  return (
    <div>
      <div style={{textAlign:'center', padding:'32px 0 40px'}}>
        <div className="hd hero-title" style={{color:C.accent, lineHeight:.9, letterSpacing:4}}>PÁDEL</div>
        <div className="hd hero-sub" style={{color:C.text, marginTop:6}}>TOURNAMENT MANAGER</div>
        <div style={{color:C.muted, fontSize:11, marginTop:10, letterSpacing:2}}>GRUPOS + ELIMINATORIAS · FORMATO COPA DEL MUNDO</div>
      </div>

      <div style={{background:C.card, border:`1px solid ${C.border}`, borderRadius:8, padding:'20px'}}>
        <div className="hd" style={{fontSize:18, marginBottom:14, color:C.mutedLt}}>REGISTRAR EQUIPOS</div>
        <div style={{display:'flex', gap:8, marginBottom:18}}>
          <input
            style={{flex:1, minWidth:0, background:C.surface, border:`1px solid ${C.border}`, color:C.text,
              fontFamily:"'IBM Plex Mono',monospace", fontSize:14, padding:'11px 12px', borderRadius:4, outline:'none'}}
            placeholder="Nombre (o varios separados por coma)"
            value={val} onChange={e => setVal(e.target.value)}
            onKeyDown={e => e.key==='Enter' && add()}
            onFocus={e => e.target.style.borderColor=C.accent}
            onBlur={e  => e.target.style.borderColor=C.border}
          />
          <Btn onClick={add}>+</Btn>
        </div>

        {teams.length === 0 ? (
          <div style={{textAlign:'center', padding:'28px 0', color:C.muted, fontSize:13}}>Añade al menos 4 equipos</div>
        ) : (
          <>
            <div style={{display:'flex', flexWrap:'wrap', gap:7, marginBottom:16}}>
              {teams.map(t => (
                <div key={t} style={{display:'flex', alignItems:'center', gap:7, background:C.surface,
                  border:`1px solid ${C.border}`, borderRadius:4, padding:'7px 11px', fontSize:12}}>
                  <span style={{maxWidth:130, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{t}</span>
                  <button onClick={() => onRemove(t)} style={{background:'none', border:'none', color:C.muted,
                    cursor:'pointer', fontSize:18, lineHeight:1, padding:'0 2px', flexShrink:0}}>×</button>
                </div>
              ))}
            </div>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center',
              flexWrap:'wrap', gap:10, paddingTop:14, borderTop:`1px solid ${C.border}`}}>
              <div style={{fontSize:11, color:C.muted}}>
                <span style={{color:C.text, fontWeight:600}}>{teams.length}</span> equipos →{' '}
                <span style={{color:C.accent, fontWeight:600}}>{ng} grupo{ng>1?'s':''}</span> →{' '}
                <span style={{color:C.mutedLt}}>{ng*2} clasificados</span>
              </div>
              <Btn onClick={onStart} disabled={teams.length < 4}>SORTEAR Y EMPEZAR →</Btn>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Groups Phase ─────────────────────────────────────────────────────────────
function GroupsPhase({groups, onScore, onConfirm, onAdvance}) {
  const total  = groups.reduce((a,g) => a + g.matches.length, 0);
  const played = groups.reduce((a,g) => a + g.matches.filter(m => m.played).length, 0);
  const allDone = total === played;

  return (
    <div>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start',
        marginBottom:18, flexWrap:'wrap', gap:12}}>
        <div>
          <div className="hd phase-title" style={{color:C.accent}}>FASE DE GRUPOS</div>
          <div style={{color:C.muted, fontSize:11, marginTop:2}}>Los 2 primeros de cada grupo clasifican</div>
        </div>
        {allDone && <Btn onClick={onAdvance}>AVANZAR →</Btn>}
      </div>

      {/* Progress bar */}
      {!allDone && (
        <div style={{display:'flex', gap:10, alignItems:'center', marginBottom:16, padding:'10px 14px',
          background:C.surface, border:`1px solid ${C.border}`, borderRadius:6, fontSize:12}}>
          <div style={{flex:1, background:C.border, borderRadius:2, height:4, overflow:'hidden'}}>
            <div style={{width:`${(played/total)*100}%`, height:'100%', background:C.accent, transition:'width .4s'}}/>
          </div>
          <span style={{color:C.accent, flexShrink:0, fontSize:11}}>{played}/{total} partidos</span>
        </div>
      )}

      <div className="groups-grid">
        {groups.map(g => <GroupCard key={g.id} group={g} onScore={onScore} onConfirm={onConfirm}/>)}
      </div>
    </div>
  );
}

function GroupCard({group, onScore, onConfirm}) {
  const st = getStandings(group);
  const done = group.matches.every(m => m.played);

  return (
    <div style={{background:C.card, border:`1px solid ${done?C.accentBorder:C.border}`,
      borderRadius:8, padding:'16px', transition:'border-color .3s'}}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12}}>
        <div className="hd" style={{fontSize:26}}>GRUPO {group.id}</div>
        {done && <Tag>✓ LISTO</Tag>}
      </div>

      {/* Standings table */}
      <table style={{width:'100%', fontSize:11, borderCollapse:'collapse', marginBottom:14}}>
        <thead>
          <tr style={{color:C.muted, borderBottom:`1px solid ${C.border}`}}>
            <th style={{textAlign:'left', padding:'3px 0', width:16}}>#</th>
            <th style={{textAlign:'left', padding:'3px 5px'}}>Equipo</th>
            <th style={{textAlign:'center', width:24}}>PJ</th>
            <th style={{textAlign:'center', width:24}}>PG</th>
            <th style={{textAlign:'center', width:24}}>PP</th>
            <th style={{textAlign:'center', width:32}}>GD</th>
            <th style={{textAlign:'center', width:36, color:C.accent}}>PTS</th>
          </tr>
        </thead>
        <tbody>
          {st.map((s, i) => {
            const gd = s.gf - s.gc;
            return (
              <tr key={s.t} style={{borderTop:`1px solid ${C.border}`, background:i<2?C.accentBg:'transparent'}}>
                <td style={{padding:'6px 0', color:i===0?C.gold:i===1?C.silver:C.muted, fontWeight:700}}>{i+1}</td>
                <td style={{padding:'6px 5px', maxWidth:90, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
                  {i<2 && <span style={{color:C.accent, marginRight:3, fontSize:8}}>▶</span>}{s.t}
                </td>
                <td style={{textAlign:'center', color:C.muted}}>{s.pj}</td>
                <td style={{textAlign:'center'}}>{s.w}</td>
                <td style={{textAlign:'center', color:s.l>0?C.loss:C.muted}}>{s.l}</td>
                <td style={{textAlign:'center', color:gd>0?C.win:gd<0?C.loss:C.muted}}>{gd>0?'+':''}{gd}</td>
                <td style={{textAlign:'center', color:C.accent, fontWeight:700, fontSize:13}}>{s.pts}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Matches */}
      <div className="hd" style={{fontSize:12, color:C.muted, marginBottom:7}}>PARTIDOS</div>
      <div style={{display:'flex', flexDirection:'column', gap:6}}>
        {group.matches.map(m => (
          <div key={m.id} style={{display:'flex', alignItems:'center', gap:5,
            background:m.played?C.accentBg:C.surface,
            border:`1px solid ${m.played?C.accentBorder:C.border}`,
            borderRadius:4, padding:'7px 9px', fontSize:11}}>
            <span style={{flex:1, textAlign:'right', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
              color:m.played&&+m.hs>+m.as?C.text:C.mutedLt}}>{m.home}</span>
            {m.played ? (
              <div style={{display:'flex', gap:4, alignItems:'center', minWidth:54,
                justifyContent:'center', fontSize:16, fontWeight:700}}>
                <span style={{color:+m.hs>+m.as?C.win:+m.hs<+m.as?C.loss:C.draw}}>{m.hs}</span>
                <span style={{color:C.muted, fontSize:10}}>-</span>
                <span style={{color:+m.as>+m.hs?C.win:+m.as<+m.hs?C.loss:C.draw}}>{m.as}</span>
              </div>
            ) : (
              <div style={{display:'flex', gap:4, alignItems:'center'}}>
                <ScoreInput value={m.hs} onChange={v => onScore(group.id, m.id, 'hs', v)}/>
                <span style={{color:C.muted, fontSize:10}}>-</span>
                <ScoreInput value={m.as} onChange={v => onScore(group.id, m.id, 'as', v)}/>
                <button onClick={() => onConfirm(group.id, m.id)}
                  disabled={m.hs===''||m.as===''}
                  style={{fontFamily:"'Bebas Neue',sans-serif", fontSize:14, padding:'8px 10px',
                    background:'transparent', border:`1px solid ${C.border}`, color:C.text,
                    borderRadius:4, cursor:'pointer', opacity:m.hs===''||m.as===''?.4:1,
                    touchAction:'manipulation', WebkitTapHighlightColor:'transparent'}}>✓</button>
              </div>
            )}
            <span style={{flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
              color:m.played&&+m.as>+m.hs?C.text:C.mutedLt}}>{m.away}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Knockout Phase ───────────────────────────────────────────────────────────
function KnockoutPhase({rounds, onSetScore, onConfirm}) {
  const firstActive = rounds.findIndex(r => r.matches.some(m => !m.played && m.home && m.away));
  const [tab, setTab] = useState(() => Math.max(0, rounds.findIndex(r => r.matches.some(m => !m.played && m.home && m.away))));

  return (
    <div>
      <div style={{marginBottom:20}}>
        <div className="hd phase-title" style={{color:C.accent}}>ELIMINATORIAS</div>
        <div style={{color:C.muted, fontSize:11, marginTop:2}}>Sin empates · El ganador pasa automáticamente</div>
      </div>

      <div className="round-tabs">
        {rounds.map((r, i) => {
          const done = r.matches.every(m => m.played);
          const active = i === tab;
          const current = i === firstActive;
          return (
            <button key={i} onClick={() => setTab(i)} style={{
              fontFamily:"'Bebas Neue',sans-serif", letterSpacing:'1px',
              padding:'9px 16px', fontSize:13, borderRadius:4, cursor:'pointer', flexShrink:0,
              border:`1px solid ${active?C.accent:done?C.accentBorder:C.border}`,
              background:active?C.accent:'transparent',
              color:active?C.bg:done?C.accent:current?C.text:C.muted,
              position:'relative', transition:'all .15s', WebkitTapHighlightColor:'transparent'}}>
              {r.name}
              {current && !active && (
                <span style={{position:'absolute', top:-3, right:-3, width:7, height:7, borderRadius:'50%', background:C.accent}}/>
              )}
            </button>
          );
        })}
      </div>

      <div style={{display:'flex', flexDirection:'column', gap:10}}>
        {rounds[tab]?.matches.map((m, i) => (
          <KOMatch key={m.id} match={m} roundIdx={tab} matchIdx={i} onSetScore={onSetScore} onConfirm={onConfirm}/>
        ))}
      </div>
    </div>
  );
}

function KOMatch({match, roundIdx, matchIdx, onSetScore, onConfirm}) {
  const ready = match.home && match.away;
  const tiedErr = ready && !match.played && match.hs!=='' && match.as!=='' && +match.hs===+match.as;

  return (
    <div style={{background:C.card, borderRadius:8, padding:'14px 16px',
      border:`1px solid ${match.played?C.accentBorder:ready?C.border:'rgba(255,255,255,0.04)'}`,
      opacity:ready?1:0.45, transition:'opacity .3s'}}>
      <div className="ko-row">
        <div className="ko-team ko-team-home">
          <div style={{fontSize:14, fontWeight:600,
            color:match.played?match.winner===match.home?C.accent:C.muted:C.text}}>
            {match.home || 'Por definir'}
          </div>
        </div>

        <div className="ko-score-area">
          {match.played ? (
            <div style={{display:'flex', gap:8, alignItems:'center', minWidth:80,
              justifyContent:'center', fontSize:26, fontWeight:700}}>
              <span style={{color:match.winner===match.home?C.accent:C.muted}}>{match.hs}</span>
              <span style={{color:C.muted, fontSize:13}}>—</span>
              <span style={{color:match.winner===match.away?C.accent:C.muted}}>{match.as}</span>
            </div>
          ) : ready ? (
            <>
              <ScoreInput value={match.hs} onChange={v => onSetScore(roundIdx, matchIdx, 'hs', v)}/>
              <span style={{color:C.muted, fontSize:12}}>—</span>
              <ScoreInput value={match.as} onChange={v => onSetScore(roundIdx, matchIdx, 'as', v)}/>
            </>
          ) : (
            <div style={{minWidth:80, textAlign:'center', color:C.muted,
              fontFamily:"'Bebas Neue',sans-serif", letterSpacing:2, fontSize:12}}>VS</div>
          )}
        </div>

        <div className="ko-team ko-team-away">
          <div style={{fontSize:14, fontWeight:600,
            color:match.played?match.winner===match.away?C.accent:C.muted:C.text}}>
            {match.away || 'Por definir'}
          </div>
        </div>

        <div className="ko-action">
          {match.played ? (
            <>
              <Tag>GANADOR</Tag>
              <div style={{fontSize:11, color:C.accent, marginTop:5, fontWeight:700,
                overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{match.winner}</div>
            </>
          ) : ready ? (
            <Btn onClick={() => onConfirm(roundIdx, matchIdx)} disabled={match.hs===''||match.as===''||tiedErr}>
              CONFIRMAR
            </Btn>
          ) : <div/>}
        </div>
      </div>

      {tiedErr && (
        <div style={{marginTop:10, fontSize:11, color:C.draw, textAlign:'center'}}>
          ⚠ En eliminatorias no puede haber empate
        </div>
      )}
    </div>
  );
}

// ─── Champion ─────────────────────────────────────────────────────────────────
function ChampionPhase({champion, onReset}) {
  return (
    <div style={{textAlign:'center', padding:'60px 20px'}}>
      <div style={{fontSize:64, marginBottom:14}}>🏆</div>
      <div className="hd" style={{fontSize:16, color:C.muted, letterSpacing:6, marginBottom:6}}>CAMPEÓN DEL TORNEO</div>
      <div className="hd" style={{fontSize:58, color:C.accent, lineHeight:1, marginBottom:10, wordBreak:'break-word'}}>{champion}</div>
      <div style={{color:C.mutedLt, fontSize:13, marginBottom:40}}>¡Felicidades al campeón! 🎉</div>
      <Btn variant="ghost" onClick={onReset}>↩ NUEVO TORNEO</Btn>
    </div>
  );
}

// ─── Root App ─────────────────────────────────────────────────────────────────
const INIT = loadFromURL();

export default function TournamentApp() {
  const [phase,    setPhase]    = useState(INIT?.phase    || 'setup');
  const [teams,    setTeams]    = useState(INIT?.teams    || []);
  const [groups,   setGroups]   = useState(INIT?.groups   || []);
  const [ko,       setKo]       = useState(INIT?.ko       || []);
  const [champion, setChampion] = useState(INIT?.champion || null);

  // Persist full state to URL hash on every change
  useEffect(() => {
    const encoded = encodeState({phase, teams, groups, ko, champion});
    if (encoded) window.history.replaceState(null, '', `#${encoded}`);
  }, [phase, teams, groups, ko, champion]);

  // ── Setup ──
  const addTeam    = n => { if (n && !teams.includes(n)) setTeams(t => [...t, n]); };
  const removeTeam = n => setTeams(t => t.filter(x => x !== n));
  const start = () => { setGroups(createGroups(teams)); setPhase('groups'); };

  // ── Groups ──
  const updateScore = (gId, mId, f, v) =>
    setGroups(gs => gs.map(g => g.id!==gId ? g : {
      ...g, matches: g.matches.map(m => m.id!==mId ? m : {...m, [f]:v})
    }));

  const confirmMatch = (gId, mId) =>
    setGroups(gs => gs.map(g => g.id!==gId ? g : {
      ...g, matches: g.matches.map(m => {
        if (m.id!==mId) return m;
        const ok = m.hs!==''&&m.as!==''&&!isNaN(+m.hs)&&!isNaN(+m.as)&&+m.hs>=0&&+m.as>=0;
        return ok ? {...m, played:true} : m;
      })
    }));

  const advanceToKO = () => { setKo(createKnockout(groups)); setPhase('knockout'); };

  // ── Knockout ──
  const setKOScore = (ri, mi, f, v) =>
    setKo(k => k.map((r,i) => i!==ri ? r : {
      ...r, matches: r.matches.map((m,j) => j!==mi ? m : {...m, [f]:v})
    }));

  const confirmKO = (ri, mi) => {
    const m = ko[ri].matches[mi];
    if (!m || m.hs==='' || m.as==='' || +m.hs===+m.as) return;
    const winner = +m.hs > +m.as ? m.home : m.away;

    let newKo = ko.map((r,i) => i!==ri ? r : {
      ...r, matches: r.matches.map((mx,j) => j!==mi ? mx : {...mx, played:true, winner})
    });

    // Propagate winner to next round slot
    if (ri + 1 < newKo.length) {
      const nmi = Math.floor(mi / 2);
      newKo = newKo.map((r,i) => i!==ri+1 ? r : {
        ...r, matches: r.matches.map((mx,j) => j!==nmi ? mx : {
          ...mx, ...(mi%2===0 ? {home:winner} : {away:winner})
        })
      });
    }

    setKo(newKo);
    if (ri + 1 >= ko.length) { setChampion(winner); setPhase('champion'); }
  };

  const reset = () => {
    setPhase('setup'); setTeams([]); setGroups([]); setKo([]); setChampion(null);
  };

  const showHeader = phase !== 'setup' && phase !== 'champion';

  return (
    <>
      <style>{STYLES}</style>
      <div className="app">
        {showHeader && (
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center',
            marginBottom:20, paddingBottom:14, borderBottom:`1px solid ${C.border}`,
            flexWrap:'wrap', gap:10}}>
            <div style={{display:'flex', alignItems:'center', gap:8}}>
              <span className="hd" style={{fontSize:20, color:C.accent}}>PÁDEL</span>
              <span className="hd" style={{fontSize:20, color:C.muted}}>TOURNAMENT</span>
            </div>
            <div style={{display:'flex', alignItems:'center', gap:8}}>
              <Tag>{phase==='groups' ? 'GRUPOS' : 'ELIMINATORIAS'}</Tag>
              <Btn variant="ghost" style={{fontSize:11, padding:'7px 12px'}} onClick={reset}>↩ REINICIAR</Btn>
            </div>
          </div>
        )}

        {phase==='setup'    && <SetupPhase    teams={teams} onAdd={addTeam} onRemove={removeTeam} onStart={start}/>}
        {phase==='groups'   && <GroupsPhase   groups={groups} onScore={updateScore} onConfirm={confirmMatch} onAdvance={advanceToKO}/>}
        {phase==='knockout' && <KnockoutPhase rounds={ko} onSetScore={setKOScore} onConfirm={confirmKO}/>}
        {phase==='champion' && <ChampionPhase champion={champion} onReset={reset}/>}
      </div>
    </>
  );
}
