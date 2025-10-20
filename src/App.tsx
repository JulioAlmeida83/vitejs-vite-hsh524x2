import React, { useEffect, useMemo, useRef, useState } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";
import { Toaster, toast } from "sonner";

/** =========================
 *  Storage & opções padrão
 *  ========================= */
const STORAGE_KEY = "racEntriesV2";        // <- V2 por conta das novas colunas
const OPTIONS_KEY  = "racOptionsV2";

const DEFAULT_OPTIONS = {
  DURATIONS   : ["Até 5 min", "5 a 15 min", "15 a 30 min", "30 a 45 min", "45 a 60 min", "> 60 min"],
  UNIDADES    : ["CJ", "NLC"],
  ATIVIDADES  : ["Parecer", "Cota", "Despacho", "Minuta de Informações em MS", "Minutas"],
  INTERACOES  : ["Interação Zap", "Interação Email", "Interação Telefone", "Reunião interna CJ"],
  COM_QUEM    : ["ColegasCJ", "ExpedienteCJ", "SubConsultoria", "SubConsultoria_grupo_NLC"], // base para sugestões
} as const;

function pad2(n: number) { return n.toString().padStart(2, "0"); }
function todayISO() { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function timeOptions(start = 7, end = 21, stepMin = 5) { const out: string[] = []; for (let h = start; h <= end; h++) { for (let m = 0; m < 60; m += stepMin) { if (h === end && m > 0) break; out.push(`${pad2(h)}:${pad2(m)}`); } } return out; }
const HORAS = timeOptions(7, 21, 5);

/** =========================
 *  Tipos
 *  ========================= */
type Difficulty = "Baixa" | "Média" | "Alta" | "Altíssima";

type Entry = {
  id        : string;
  unidade   : string;
  atividade : string;      // "" quando não selecionado
  interacao : string;      // "" quando não selecionado
  comQuem   : string[];    // até 3 itens; vazio quando não houver Interação
  duracao   : string;
  data      : string;
  hora      : string;
  urgente   : boolean;
  dificuldade: Difficulty;
  observacoes?: string;
  observacoesAudio?: string;
};

/** =========================
 *  Persistência e migração
 *  ========================= */
function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

function migrateV1ToV2(v1: any[]): Entry[] {
  // versões antigas tinham "destino" (string). Convertemos para comQuem: [destino].
  return (v1 || []).map((e: any) => ({
    id        : e.id ?? crypto.randomUUID(),
    unidade   : e.unidade ?? "",
    atividade : e.atividade ?? "",
    interacao : e.interacao ?? "",
    comQuem   : e.destino ? [String(e.destino)] : (Array.isArray(e.comQuem) ? e.comQuem : []),
    duracao   : e.duracao ?? "",
    data      : e.data ?? todayISO(),
    hora      : e.hora ?? "08:00",
    urgente   : Boolean(e.urgente ?? false),
    dificuldade: (["Baixa","Média","Alta","Altíssima"] as Difficulty[]).includes(e.dificuldade) ? e.dificuldade : "Média",
    observacoes: e.observacoes ?? "",
    observacoesAudio: e.observacoesAudio ?? undefined,
  }));
}

function load(): Entry[] {
  // Tenta V2
  const v2 = safeParse<Entry[]>(localStorage.getItem(STORAGE_KEY), null as any);
  if (Array.isArray(v2)) return v2;
  // Se não tiver V2, tenta V1 e migra
  const v1 = safeParse<any[]>(localStorage.getItem("racEntriesV1"), []);
  const migrated = migrateV1ToV2(v1);
  return migrated;
}

function save(entries: Entry[]) { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)); }

function loadOptions(){ 
  const obj = safeParse<any>(localStorage.getItem(OPTIONS_KEY), {});
  // também incorpora chaves antigas para manter personalizações do usuário
  const legacy = safeParse<any>(localStorage.getItem("racOptionsV1"), {});
  return { ...DEFAULT_OPTIONS, ...legacy, ...obj };
}
function saveOptions(opts: any){ localStorage.setItem(OPTIONS_KEY, JSON.stringify(opts)); }

/** =========================
 *  Utilidades
 *  ========================= */
function durationMinutes(label: Entry["duracao"]) {
  switch (label) {
    case "Até 5 min": return 5;
    case "5 a 15 min": return 10;
    case "15 a 30 min": return 22;
    case "30 a 45 min": return 37;
    case "45 a 60 min": return 52;
    case "> 60 min": return 75;
    default: return 0;
  }
}

function toCSV(entries: Entry[]) {
  const headers = ["id","unidade","atividade","interacao","comQuem","duracao","data","hora","urgente","dificuldade","observacoes"];
  const lines = [headers.join(",")];
  for (const e of entries) {
    const rowMap: Record<string,string> = {
      id: e.id,
      unidade: e.unidade,
      atividade: e.atividade,
      interacao: e.interacao,
      comQuem: (e.comQuem||[]).join("; "),
      duracao: e.duracao,
      data: e.data,
      hora: e.hora,
      urgente: e.urgente ? "Sim" : "Não",
      dificuldade: e.dificuldade,
      observacoes: e.observacoes ?? "",
    };
    const row = headers.map(h => {
      const v = rowMap[h] ?? "";
      const needsQuote = /[",\n]/.test(String(v));
      return needsQuote ? `"${String(v).replace(/"/g,'""')}"` : String(v);
    });
    lines.push(row.join(","));
  }
  return lines.join("\n");
}

function download(filename: string, content: string, mime = "text/plain") {
  const blob = new Blob([content], { type: mime + ";charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

/** =========================
 *  UI helpers
 *  ========================= */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{border:"1px solid #e5e7eb", borderRadius:16, padding:16}}>
      <div style={{fontWeight:600, marginBottom:12}}>{title}</div>
      {children}
    </div>
  );
}
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{display:"grid", gridTemplateColumns:"160px 1fr", alignItems:"center", gap:8, marginBottom:10}}>
      <label style={{fontSize:12, color:"#6b7280"}}>{label}</label>
      <div>{children}</div>
    </div>
  );
}

/** =========================
 *  Hooks
 *  ========================= */
function useEntries() {
  const [entries, setEntries] = useState<Entry[]>([]);
  useEffect(()=>{ setEntries(load()); },[]);
  useEffect(()=>{ save(entries); },[entries]);
  return { entries, setEntries };
}
function useOptions(){
  const [opts, setOpts] = useState<any>(loadOptions());
  useEffect(()=>{ saveOptions(opts); }, [opts]);
  return { opts, setOpts };
}

/** =========================
 *  Formulário
 *  ========================= */
function EntryForm({ onSubmit, initial, onCancel, opts }: {
  onSubmit: (e: Entry) => void;
  initial?: Partial<Entry>;
  onCancel?: () => void;
  opts: { DURATIONS: string[]; UNIDADES: string[]; ATIVIDADES: string[]; INTERACOES: string[]; COM_QUEM: string[] };
}) {
  const [unidade, setUnidade] = useState<string>(initial?.unidade ?? (opts.UNIDADES[0] || ""));
  const [atividade, setAtividade] = useState<string>(initial?.atividade ?? ""); // "" = null
  const [interacao, setInteracao] = useState<string>(initial?.interacao ?? ""); // "" = null
  const [comQuem, setComQuem]     = useState<string[]>(Array.isArray(initial?.comQuem) ? initial!.comQuem! : []);
  const [duracao, setDuracao]     = useState<string>(initial?.duracao ?? (opts.DURATIONS[0] || ""));
  const [data, setData]           = useState<string>(initial?.data ?? todayISO());
  const [hora, setHora]           = useState<string>(initial?.hora ?? (new Date().toTimeString().slice(0,5)));
  const [urgente, setUrgente]     = useState<boolean>(Boolean(initial?.urgente ?? false));
  const [dificuldade, setDificuldade] = useState<Difficulty>((initial?.dificuldade as Difficulty) ?? "Média");
  const [obs, setObs]             = useState<string>(initial?.observacoes ?? "");
  const [audioData, setAudioData] = useState<string | undefined>(initial?.observacoesAudio);

  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Exclusão mútua: ao selecionar um, zera o outro.
  function onChangeAtividade(v: string){
    setAtividade(v);
    if (v) { setInteracao(""); setComQuem([]); }
  }
  function onChangeInteracao(v: string){
    setInteracao(v);
    if (v) { setAtividade(""); } // e libera comQuem
  }

  // "Com quem" até 3 itens
  function addComQuem(v: string){
    const value = v.trim();
    if (!value) return;
    setComQuem(prev => {
      const next = Array.from(new Set([...prev, value]));
      if (next.length > 3) {
        toast.error("Máximo de 3 itens em 'Com quem'.");
        return prev;
      }
      return next;
    });
  }
  function removeComQuem(v: string){
    setComQuem(prev => prev.filter(x => x !== v));
  }

  // Gravação de áudio
  async function startRec(){
    try{
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = (e)=>{ if(e.data.size>0) chunksRef.current.push(e.data); };
      mr.onstop = ()=>{
        const mime = mr.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mime });
        const reader = new FileReader();
        reader.onload = ()=> setAudioData(String(reader.result));
        reader.readAsDataURL(blob);
        stream.getTracks().forEach(t=>t.stop());
      };
      mr.start();
      setIsRecording(true);
      toast.message("Gravando… toque em Parar");
    } catch {
      toast.error("Permissão de microfone negada");
    }
  }
  function stopRec(){ const mr = mediaRecorderRef.current; if (mr && mr.state !== "inactive") mr.stop(); setIsRecording(false); }
  function clearAudio(){ setAudioData(undefined); }

  const editingId = initial?.id;

  // Validação simples ao salvar
  function handleSubmit(){
    if (!atividade && !interacao) {
      toast.error("Escolha Atividade ou Interação.");
      return;
    }
    if (interacao && comQuem.length === 0) {
      toast.error("Preencha 'Com quem' (até 3) quando houver Interação.");
      return;
    }
    const entry: Entry = {
      id: editingId ?? crypto.randomUUID(),
      unidade, atividade, interacao, comQuem,
      duracao, data, hora,
      urgente, dificuldade,
      observacoes: obs, observacoesAudio: audioData
    };
    onSubmit(entry);
  }

  return (
    <Section title={editingId ? "Editar registro" : "Novo registro"}>
      <Row label="Unidade">
        <select value={unidade} onChange={e=>setUnidade(e.target.value)} style={{width:"100%", padding:8, borderRadius:10, border:"1px solid #e5e7eb"}}>
          {opts.UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
      </Row>

      <Row label="Atividade (excludente)">
        <select value={atividade} onChange={e=>onChangeAtividade(e.target.value)} style={{width:"100%", padding:8, borderRadius:10, border:"1px solid #e5e7eb"}}>
          <option value="">{`— selecione —`}</option>
          {opts.ATIVIDADES.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
      </Row>

      <Row label="Interação (excludente)">
        <select value={interacao} onChange={e=>onChangeInteracao(e.target.value)} style={{width:"100%", padding:8, borderRadius:10, border:"1px solid #e5e7eb"}}>
          <option value="">{`— selecione —`}</option>
          {opts.INTERACOES.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
      </Row>

      {Boolean(interacao) && (
        <Row label="Com quem (até 3)">
          <div>
            <div style={{display:"flex", gap:8, marginBottom:8}}>
              <input id="comQuemInput" placeholder="Digite e Enter para adicionar" onKeyDown={(e:any)=>{ if(e.key==='Enter'){ addComQuem(e.currentTarget.value); e.currentTarget.value=''; } }} style={{flex:1, padding:8, borderRadius:10, border:"1px solid #e5e7eb"}}/>
              <select onChange={e=>{ if(e.target.value){ addComQuem(e.target.value); e.target.selectedIndex = 0; }}} style={{padding:8, borderRadius:10, border:"1px solid #e5e7eb"}}>
                <option value="">{`Sugestões`}</option>
                {opts.COM_QUEM.map(x => <option key={x} value={x}>{x}</option>)}
              </select>
            </div>
            <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
              {comQuem.map(v => (
                <span key={v} style={{display:"inline-flex", alignItems:"center", gap:6, padding:"4px 8px", borderRadius:12, background:"#f3f4f6", fontSize:12}}>
                  {v}
                  <button onClick={()=>removeComQuem(v)} title="Remover" style={{border:"none", background:"transparent", cursor:"pointer"}}>×</button>
                </span>
              ))}
              {comQuem.length===0 && <span style={{fontSize:12, color:"#6b7280"}}>Adicione até 3 nomes/setores</span>}
            </div>
          </div>
        </Row>
      )}

      <Row label="Duração">
        <select value={duracao} onChange={e=>setDuracao(e.target.value)} style={{width:"100%", padding:8, borderRadius:10, border:"1px solid #e5e7eb"}}>
          {opts.DURATIONS.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
      </Row>

      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12}}>
        <Row label="Data">
          <input type="date" value={data} onChange={e=>setData(e.target.value)} style={{width:"100%", padding:8, borderRadius:10, border:"1px solid #e5e7eb"}}/>
        </Row>
        <Row label="Hora">
          <select value={hora} onChange={e=>setHora(e.target.value)} style={{width:"100%", padding:8, borderRadius:10, border:"1px solid #e5e7eb"}}>
            {HORAS.map(h => <option key={h} value={h}>{h}</option>)}
          </select>
        </Row>
      </div>

      <Row label="Urgente">
        <label style={{display:"inline-flex", alignItems:"center", gap:8, fontSize:14}}>
          <input type="checkbox" checked={urgente} onChange={e=>setUrgente(e.target.checked)} /> Marcar como urgente
        </label>
      </Row>

      <Row label="Dificuldade">
        <select value={dificuldade} onChange={e=>setDificuldade(e.target.value as Difficulty)} style={{width:"100%", padding:8, borderRadius:10, border:"1px solid #e5e7eb"}}>
          {(["Baixa","Média","Alta","Altíssima"] as Difficulty[]).map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </Row>

      <Row label="Observações">
        <div>
          <input placeholder="Opcional" value={obs} onChange={e=>setObs(e.target.value)} style={{width:"100%", padding:8, borderRadius:10, border:"1px solid #e5e7eb"}}/>
          <div style={{display:"flex", gap:8, alignItems:"center", marginTop:8}}>
            {/* Gravação de áudio */}
            {isRecording ? (
              <button type="button" onClick={stopRec} style={{display:"inline-flex", alignItems:"center", gap:6, padding:"8px 12px", borderRadius:10, border:"1px solid #ef4444", background:"#fee2e2"}}>⏹️ Parar</button>
            ) : (
              <button type="button" onClick={startRec} style={{display:"inline-flex", alignItems:"center", gap:6, padding:"8px 12px", borderRadius:10, border:"1px solid #e5e7eb", background:"#fff"}}>🎙️ Gravar áudio</button>
            )}
            {audioData && (
              <>
                <audio src={audioData} controls style={{height:36}}/>
                <button type="button" onClick={()=>setAudioData(undefined)} title="Remover áudio" style={{display:"inline-flex", alignItems:"center", gap:6, padding:"8px 12px", borderRadius:10, border:"1px solid #e5e7eb", background:"#fff"}}>×</button>
              </>
            )}
            {!audioData && !isRecording && <span style={{fontSize:12, color:"#6b7280"}}>(opcional) Grave uma nota falada</span>}
          </div>
        </div>
      </Row>

      <div style={{display:"flex", gap:8, justifyContent:"flex-end", marginTop:8}}>
        {onCancel && (
          <button onClick={onCancel} style={{display:"inline-flex", alignItems:"center", gap:6, padding:"8px 12px", borderRadius:10, border:"1px solid #e5e7eb", background:"#fff"}}>× Cancelar</button>
        )}
        <button onClick={handleSubmit} style={{display:"inline-flex", alignItems:"center", gap:6, padding:"8px 12px", borderRadius:10, border:"1px solid #0ea5e9", background:"#0ea5e9", color:"#fff"}}>💾 {editingId ? "Salvar" : "Registrar"}</button>
      </div>
    </Section>
  );
}

/** =========================
 *  Telas auxiliares
 *  ========================= */
function Summary({ entries }: { entries: Entry[] }) {
  const totalMin = useMemo(() => entries.reduce((acc, e) => acc + durationMinutes(e.duracao), 0), [entries]);
  const horas = (totalMin/60).toFixed(1);
  const porAtividade = useMemo(()=>{
    const map = new Map<string, number>();
    for (const e of entries) {
      const chave = e.atividade || e.interacao || "(sem tipo)";
      map.set(chave, (map.get(chave)||0)+1);
    }
    return Array.from(map.entries()).map(([name, qty])=>({ name, qty }));
  },[entries]);

  return (
    <Section title="Resumo">
      <div style={{display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:12}}>
        <div style={{padding:12, borderRadius:12, background:"#f3f4f6"}}>
          <div style={{fontSize:12, color:"#6b7280"}}>Registros</div>
          <div style={{fontSize:24, fontWeight:600}}>{entries.length}</div>
        </div>
        <div style={{padding:12, borderRadius:12, background:"#f3f4f6"}}>
          <div style={{fontSize:12, color:"#6b7280"}}>Tempo estimado</div>
          <div style={{fontSize:24, fontWeight:600}}>{horas} h</div>
        </div>
        <div style={{padding:12, borderRadius:12, background:"#f3f4f6"}}>
          <div style={{fontSize:12, color:"#6b7280"}}>Urgentes</div>
          <div style={{fontSize:24, fontWeight:600}}>{entries.filter(e=>e.urgente).length}</div>
        </div>
      </div>
      <div style={{height:240}}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={porAtividade}>
            <XAxis dataKey="name" interval={0} angle={-15} textAnchor="end" height={60}/>
            <YAxis allowDecimals={false}/>
            <Tooltip />
            <Bar dataKey="qty" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Section>
  );
}

function ListRow({ e, onEdit, onDelete }: { e: Entry; onEdit: (e: Entry)=>void; onDelete: (id:string)=>void }){
  const tipo = e.atividade || e.interacao || "(sem tipo)";
  return (
    <div style={{display:"grid", gridTemplateColumns:"1fr 120px 160px", alignItems:"center", gap:12, padding:12, border:"1px solid #e5e7eb", borderRadius:12}}>
      <div>
        <div style={{fontWeight:600}}>
          {tipo} <span style={{fontSize:12, color:"#6b7280"}}>• {e.unidade}</span>
          {e.urgente && <span style={{marginLeft:8, fontSize:12, color:"#b91c1c", fontWeight:700}}>URGENTE</span>}
        </div>
        <div style={{fontSize:12, color:"#6b7280"}}>{e.data} às {e.hora} — {e.duracao} — Dificuldade: {e.dificuldade}</div>
        {!!e.comQuem.length && <div style={{fontSize:12, marginTop:4}}>Com quem: {e.comQuem.join(", ")}</div>}
        {e.observacoes && <div style={{fontSize:12, marginTop:4}}>{e.observacoes}</div>}
        {e.observacoesAudio && (<div style={{marginTop:6}}><audio src={e.observacoesAudio} controls style={{width:"100%"}}/></div>)}
      </div>
      <div style={{fontSize:12}}>{e.interacao ? "Interação" : "Atividade"}</div>
      <div style={{display:"flex", gap:8, justifyContent:"flex-end"}}>
        <button onClick={()=>onEdit(e)} title="Editar" style={{display:"inline-flex", alignItems:"center", gap:6, padding:"6px 10px", border:"1px solid #e5e7eb", borderRadius:10, background:"#fff"}}>✏️</button>
        <button onClick={()=>onDelete(e.id)} title="Excluir" style={{display:"inline-flex", alignItems:"center", gap:6, padding:"6px 10px", border:"1px solid #e5e7eb", borderRadius:10, background:"#fff"}}>🗑️</button>
      </div>
    </div>
  );
}

/** =========================
 *  App
 *  ========================= */
export default function App() {
  const [tab, setTab] = useState<"registrar"|"lista"|"resumo"|"config">("registrar");
  const { entries, setEntries } = useEntries();
  const { opts, setOpts } = useOptions();
  const [editing, setEditing] = useState<Entry|null>(null);
  const [query, setQuery] = useState("");
  const [filterUnidade, setFilterUnidade] = useState<string>("todas");
  const [rangeStart, setRangeStart] = useState<string>("");
  const [rangeEnd, setRangeEnd] = useState<string>("");

  const filtered = useMemo(()=>{
    return entries.filter(e=>{
      const q = query.trim().toLowerCase();
      const campoTipo = (e.atividade || e.interacao || "").toLowerCase();
      const campoComQuem = (e.comQuem || []).join(" ").toLowerCase();
      const okQ = !q || [campoTipo, campoComQuem, e.observacoes||""].some(s=>s.includes(q));
      const okU = filterUnidade === "todas" || e.unidade === filterUnidade;
      const okStart = !rangeStart || e.data >= rangeStart;
      const okEnd = !rangeEnd || e.data <= rangeEnd;
      return okQ && okU && okStart && okEnd;
    });
  }, [entries, query, filterUnidade, rangeStart, rangeEnd]);

  function upsert(entry: Entry){
    setEntries(prev => {
      const idx = prev.findIndex(p=>p.id===entry.id);
      if (idx === -1) return [entry, ...prev];
      const copy = [...prev];
      copy[idx] = entry; return copy;
    });
    setEditing(null);
    toast.success("Registro salvo");
  }
  function remove(id: string){
    setEntries(prev => prev.filter(p=>p.id!==id));
    toast.message("Registro excluído");
  }

  function exportCSV(){ const csv = toCSV(filtered); download(`rac_export_${todayISO()}.csv`, csv, "text/csv"); }
  function exportJSON(){ download(`rac_backup_${todayISO()}.json`, JSON.stringify(entries, null, 2), "application/json"); }
  function importJSON(ev: React.ChangeEvent<HTMLInputElement>){
    const file = ev.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        if (Array.isArray(data)) {
          // aceitamos tanto V1 quanto V2 no import
          const normalized = data[0]?.comQuem || data[0]?.destino
            ? migrateV1ToV2(data)
            : data;
          const ok = normalized.every((d:any) => d.id && d.data && d.hora);
          if (!ok) throw new Error("Formato inválido");
          setEntries(normalized);
          toast.success("Backup importado");
        } else throw new Error("Estrutura inválida");
      } catch (e:any) {
        toast.error(`Falha ao importar: ${e.message || e}`);
      }
    };
    reader.readAsText(file);
  }

  function exportOptions(){ download(`rac_options_${todayISO()}.json`, JSON.stringify(opts, null, 2), "application/json"); }
  function importOptions(ev: React.ChangeEvent<HTMLInputElement>){
    const file = ev.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try{
        const data = JSON.parse(String(reader.result));
        const merged = { ...DEFAULT_OPTIONS, ...data };
        setOpts(merged);
        toast.success("Opções atualizadas");
      } catch(e:any){
        toast.error(`Falha ao importar opções: ${e.message||e}`);
      }
    };
    reader.readAsText(file);
  }
  function addTo(listKey: keyof typeof DEFAULT_OPTIONS, value: string){
    if (!value.trim()) return;
    setOpts((prev:any)=> ({ ...prev, [listKey]: Array.from(new Set([...(prev[listKey]||[]), value.trim()])) }));
  }
  function removeFrom(listKey: keyof typeof DEFAULT_OPTIONS, value: string){
    setOpts((prev:any)=> ({ ...prev, [listKey]: (prev[listKey]||[]).filter((x:string)=>x!==value) }));
  }

  return (
    <div style={{maxWidth:900, margin:"0 auto", padding:"16px 16px 96px"}}>
      <Toaster richColors />

      <header style={{display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, marginBottom:16}}>
        <div>
          <div style={{fontSize:24, fontWeight:700}}>RAC Mobile</div>
          <div style={{fontSize:12, color:"#6b7280"}}>Coleta diária simples • 100% local (offline)</div>
        </div>
        <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
          <button onClick={exportCSV} style={{display:"inline-flex", alignItems:"center", gap:6, padding:"8px 12px", borderRadius:10, border:"1px solid #e5e7eb", background:"#f8fafc"}}>⤵️ CSV</button>
          <button onClick={exportJSON} style={{display:"inline-flex", alignItems:"center", gap:6, padding:"8px 12px", borderRadius:10, border:"1px solid #e5e7eb", background:"#f8fafc"}}>⤵️ Backup</button>
          <label style={{display:"inline-flex", alignItems:"center"}}>
            <input type="file" accept="application/json" style={{display:"none"}} onChange={importJSON} />
            <span style={{display:"inline-flex", alignItems:"center", gap:6, padding:"8px 12px", borderRadius:10, border:"1px solid #e5e7eb", background:"#fff", cursor:"pointer"}}>⤴️ Importar</span>
          </label>
        </div>
      </header>

      <nav style={{display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, marginBottom:12}}>
        {(["registrar","lista","resumo","config"] as const).map(t => (
          <button key={t} onClick={()=>setTab(t)}
            style={{
              padding:"10px 12px", borderRadius:12,
              border: tab===t ? "1px solid #0ea5e9" : "1px solid #e5e7eb",
              background: tab===t ? "#e0f2fe" : "#fff",
              fontWeight: tab===t ? 600 : 500
            }}>
            {t==="registrar" ? "Registrar" : t==="lista" ? "Lista" : t==="resumo" ? "Resumo" : "Configurar"}
          </button>
        ))}
      </nav>

      {tab==="registrar" && (
        editing
          ? <EntryForm initial={editing} onSubmit={upsert} onCancel={()=>setEditing(null)} opts={opts} />
          : <EntryForm onSubmit={upsert} opts={opts} />
      )}

      {tab==="lista" && (
        <>
          <Section title="Filtros">
            <div style={{display:"grid", gridTemplateColumns:"1fr 220px", gap:12, alignItems:"center", marginBottom:8}}>
              <input
                value={query}
                onChange={e=>setQuery(e.target.value)}
                placeholder="Buscar por atividade/interação, 'com quem' ou observação"
                style={{width:"100%", padding:"8px 12px", borderRadius:10, border:"1px solid #e5e7eb"}}
              />
              <select value={filterUnidade} onChange={e=>setFilterUnidade(e.target.value)} style={{padding:8, borderRadius:10, border:"1px solid #e5e7eb"}}>
                <option value="todas">Todas</option>
                {opts.UNIDADES.map((u:string)=> <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12}}>
              <div style={{display:"flex", alignItems:"center", gap:8}}>
                <span style={{fontSize:12, color:"#6b7280", width:24}}>De</span>
                <input type="date" value={rangeStart} onChange={e=>setRangeStart(e.target.value)} style={{flex:1, padding:8, borderRadius:10, border:"1px solid #e5e7eb"}}/>
              </div>
              <div style={{display:"flex", alignItems:"center", gap:8}}>
                <span style={{fontSize:12, color:"#6b7280", width:24}}>Até</span>
                <input type="date" value={rangeEnd} onChange={e=>setRangeEnd(e.target.value)} style={{flex:1, padding:8, borderRadius:10, border:"1px solid #e5e7eb"}}/>
              </div>
            </div>
          </Section>

          <div style={{display:"grid", gap:8, marginTop:12}}>
            {filtered.map(e => (
              <ListRow key={e.id} e={e} onEdit={setEditing} onDelete={remove} />
            ))}
            {filtered.length === 0 && (
              <div style={{textAlign:"center", fontSize:14, color:"#6b7280", padding:"40px 0"}}>Nenhum registro encontrado.</div>
            )}
          </div>
        </>
      )}

      {tab==="resumo" && (
        <Summary entries={filtered} />
      )}

      {tab==="config" && (
        <Section title="Opções do aplicativo">
          {([
            ["UNIDADES","Unidades","UNIDADES"],
            ["ATIVIDADES","Atividades","ATIVIDADES"],
            ["INTERACOES","Interações","INTERACOES"],
            ["COM_QUEM","Sugestões de 'Com quem'","COM_QUEM"],
            ["DURATIONS","Durações","DURATIONS"],
          ] as const).map(([key,label,lk])=> (
            <div key={key} style={{marginBottom:16}}>
              <div style={{fontSize:14, marginBottom:6}}>{label}</div>
              <div style={{display:"flex", gap:8}}>
                <input
                  placeholder={`Adicionar em ${label}`}
                  onKeyDown={(e:any)=>{ if(e.key==='Enter') { addTo(lk as any, e.currentTarget.value); e.currentTarget.value=''; } }}
                  style={{flex:1, padding:8, borderRadius:10, border:"1px solid #e5e7eb"}}
                />
                <button
                  onClick={()=>{
                    const inp = (document.activeElement as HTMLInputElement);
                    if (inp && inp.tagName==='INPUT' && inp.value.trim()) { addTo(lk as any, inp.value); inp.value=''; }
                  }}
                  style={{display:"inline-flex", alignItems:"center", gap:6, padding:"8px 12px", borderRadius:10, border:"1px solid #e5e7eb", background:"#fff"}}
                >
                  + Adicionar
                </button>
              </div>
              <div style={{display:"flex", gap:8, flexWrap:"wrap", marginTop:8}}>
                {(opts as any)[key].map((v:string)=> (
                  <span key={v} style={{display:"inline-flex", alignItems:"center", gap:6, padding:"4px 8px", borderRadius:12, background:"#f3f4f6", fontSize:12}}>
                    {v}
                    <button onClick={()=>removeFrom(lk as any, v)} title="Remover" style={{display:"inline-flex", alignItems:"center", border:"none", background:"transparent", cursor:"pointer"}}>×</button>
                  </span>
                ))}
              </div>
            </div>
          ))}

          <div style={{display:"flex", gap:8, justifyContent:"flex-end"}}>
            <button onClick={()=>exportOptions()} style={{display:"inline-flex", alignItems:"center", gap:6, padding:"8px 12px", borderRadius:10, border:"1px solid #e5e7eb", background:"#f8fafc"}}>⤵️ Exportar opções</button>
            <label style={{display:"inline-flex", alignItems:"center"}}>
              <input type="file" accept="application/json" style={{display:"none"}} onChange={importOptions} />
              <span style={{display:"inline-flex", alignItems:"center", gap:6, padding:"8px 12px", borderRadius:10, border:"1px solid #e5e7eb", background:"#fff", cursor:"pointer"}}>⤴️ Importar opções</span>
            </label>
          </div>
        </Section>
      )}

      <footer style={{textAlign:"center", fontSize:12, color:"#6b7280", paddingTop:24}}>
        Versão local • Adicione à tela inicial do celular
      </footer>
    </div>
  );
}
