import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

/** ===================== Persistência ===================== */
const STORAGE_KEY = "racEntries_v4";
const OPTIONS_KEY = "racOptions_v4";

/** ===================== Opções padrão ===================== */
const DEFAULT_OPTIONS = {
  DURATIONS: [
    "Até 5 min",
    "5 a 15 min",
    "15 a 30 min",
    "30 a 45 min",
    "45 a 60 min",
    "60 a 90 min",
    "Mais de 90 min",
    "Mais de 120 min",
    "Mais de 180 min",
    "Outro (especificar)",
  ],
  UNIDADES: ["CJ", "NLC"],
  ATIVIDADES: [
    "Interação Whatsapp",
    "Interação Email",
    "Interação Telefone",
    "Reunião interna do órgão",
    "Reunião externa",
    "Estudos temáticos",
    "Participação em Comitê ou Comissão",
    "CIACON",
    "CEAI",
    "CGGDIESP",
    "CONEXÕES - GERAL",
    "CONEXÕES - COORD",
  ],
  MANIFESTACOES: [
    "Interação Whatsapp",
    "Interação Email",
    "Interação Telefone",
    "Reunião interna do órgão",
    "Reunião externa",
  ],
  COM_QUEM: [
    "Colegas CJ",
    "Expediente CJ",
    "Sub Consultoria",
    "SubConsultoria_grupo_NLC",
    "Julio",
    "UGP_SP_Mais_Digital",
    "Fenili",
    "Andrea",
    "Equipes_Fenili&Andrea",
    "Gabinete SGGD",
    "Outros",
    "ColegasOutrasUnidades",
    "Joao - Sub Gov Digital",
    "Equipe do Joao - Sub Gov Digital",
    "Eva - Sub Gestão de Pessoas",
    "Equipe da Eva - Sub Gestão de Pessoas",
    "AJG",
    "Elaine - Ouvidora PGE",
    "Paulo - Sub Patrimônio",
    "Equipe do Paulo - Sub Patrimônio",
  ],
} as const;

/** ===================== Utilidades ===================== */
function pad2(n: number) {
  return n.toString().padStart(2, "0");
}
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function timeOptions(start = 7, end = 21, stepMin = 5) {
  const out: string[] = [];
  for (let h = start; h <= end; h++) {
    for (let m = 0; m < 60; m += stepMin) {
      if (h === end && m > 0) break;
      out.push(`${pad2(h)}:${pad2(m)}`);
    }
  }
  return out;
}
const HORAS = timeOptions(7, 21, 5);

/** ===================== Tipos ===================== */
type Entry = {
  id: string;
  unidade: string;
  atividade: string;        // excludente com manifestacao
  manifestacao: string;     // excludente com atividade
  comQuem: string[];        // até 3
  duracao: string;
  dificuldade: "Baixa" | "Média" | "Alta" | "Altíssima" | "";
  urgente: boolean;
  data: string;
  hora: string;
  observacoes?: string;
  observacoesAudio?: string; // dataURL (webm/ogg)
  transcricao?: string;      // texto gerado pela API de fala (quando disponível)
};

/** ===================== Persistência local ===================== */
function loadEntries(): Entry[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as Entry[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
function saveEntries(entries: Entry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}
function loadOptions() {
  const raw = localStorage.getItem(OPTIONS_KEY);
  if (!raw) return { ...DEFAULT_OPTIONS };
  try {
    const obj = JSON.parse(raw);
    return { ...DEFAULT_OPTIONS, ...obj };
  } catch {
    return { ...DEFAULT_OPTIONS };
  }
}
function saveOptions(opts: any) {
  localStorage.setItem(OPTIONS_KEY, JSON.stringify(opts));
}

/** ===================== Export/Import ===================== */
function toCSV(entries: Entry[]) {
  const headers = [
    "id",
    "unidade",
    "atividade",
    "manifestacao",
    "comQuem",
    "duracao",
    "dificuldade",
    "urgente",
    "data",
    "hora",
    "observacoes",
    "transcricao",
  ];
  const lines = [headers.join(",")];
  for (const e of entries) {
    const rec: Record<string, any> = {
      ...e,
      comQuem: (e.comQuem || []).join("; "),
      urgente: e.urgente ? "Sim" : "Não",
    };
    const row = headers.map((h) => {
      const v = rec[h] ?? "";
      const s = String(v);
      const needsQuote = /[",\n]/.test(s);
      return needsQuote ? `"${s.replace(/"/g, '""')}"` : s;
    });
    lines.push(row.join(","));
  }
  return lines.join("\n");
}
function download(filename: string, content: string, mime = "text/plain") {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** ===================== Estimativa p/ Resumo ===================== */
function durationMinutes(label: Entry["duracao"]) {
  switch (label) {
    case "Até 5 min": return 5;
    case "5 a 15 min": return 10;
    case "15 a 30 min": return 22;
    case "30 a 45 min": return 37;
    case "45 a 60 min": return 52;
    case "60 a 90 min": return 75;
    case "Mais de 90 min": return 105;
    case "Mais de 120 min": return 135;
    case "Mais de 180 min": return 195;
    case "Outro (especificar)": return 0;
    default: return 0;
  }
}

/** ===================== UI Helpers ===================== */
const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section style={card}>
    <h3 style={sectionTitle}>{title}</h3>
    <div style={{ marginTop: 12 }}>{children}</div>
  </section>
);

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div style={row}>
    <label style={rowLabel}>{label}</label>
    <div>{children}</div>
  </div>
);

const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  padding: 16,
};

const sectionTitle: React.CSSProperties = {
  margin: 0,
  fontSize: 14,
  color: "#6b7280",
};

const row: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "140px 1fr",
  gap: 8,
  alignItems: "center",
  marginBottom: 10,
};

const rowLabel: React.CSSProperties = { color: "#6b7280", fontSize: 13 };

function btn(variant: "primary" | "outline" | "ghost" | "danger") {
  const base = {
    padding: "10px 14px",
    borderRadius: 12,
    cursor: "pointer",
    border: "1px solid transparent",
    background: "#111827",
    color: "#fff",
    fontSize: 15,
    lineHeight: 1.1,
  } as React.CSSProperties;

  if (variant === "primary") return base;
  if (variant === "outline") return { ...base, background: "#fff", color: "#111827", border: "1px solid #e5e7eb" };
  if (variant === "ghost") return { ...base, background: "transparent", color: "#111827", border: "1px solid #e5e7eb" };
  if (variant === "danger") return { ...base, background: "#dc2626", color: "#fff" };
  return base;
}

const inputStyle: React.CSSProperties = { width: "100%", padding: 10, borderRadius: 12, border: "1px solid #e5e7eb" };

/** ===================== Formulário (com áudio + transcrição) ===================== */
function EntryForm({
  onSubmit,
  initial,
  options,
  onCancel,
}: {
  onSubmit: (e: Entry) => void;
  initial?: Partial<Entry>;
  options: typeof DEFAULT_OPTIONS;
  onCancel?: () => void;
}) {
  const [unidade, setUnidade] = useState<string>(initial?.unidade ?? options.UNIDADES[0] ?? "");

  // excludentes
  const [atividade, setAtividade] = useState<string>(initial?.atividade ?? "");
  const [manifestacao, setManifestacao] = useState<string>(initial?.manifestacao ?? "");

  // comQuem (até 3) — só quando há manifestação
  const [comQuem, setComQuem] = useState<string[]>(initial?.comQuem ?? []);

  const [duracao, setDuracao] = useState<string>(initial?.duracao ?? options.DURATIONS[0] ?? "");
  const [dificuldade, setDificuldade] = useState<Entry["dificuldade"]>(initial?.dificuldade ?? "");
  const [urgente, setUrgente] = useState<boolean>(!!initial?.urgente);

  const [data, setData] = useState<string>(initial?.data ?? todayISO());
  const [hora, setHora] = useState<string>(initial?.hora ?? new Date().toTimeString().slice(0, 5));
  const [obs, setObs] = useState<string>(initial?.observacoes ?? "");

  // Áudio + Transcrição (Web Speech API)
  const [isRecording, setIsRecording] = useState(false);
  const [audioData, setAudioData] = useState<string | undefined>(initial?.observacoesAudio);
  const [transcricao, setTranscricao] = useState<string>(initial?.transcricao ?? "");
  const [autoAppendToObs, setAutoAppendToObs] = useState(true);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<any>(null); // SpeechRecognition | null

  const editingId = initial?.id;

  // inicia gravação + (se disponível) transcrição
  async function startRec() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const mime = mr.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mime });
        const reader = new FileReader();
        reader.onload = () => setAudioData(String(reader.result));
        reader.readAsDataURL(blob);
        stream.getTracks().forEach((t) => t.stop());
      };
      mr.start();

      // tentar Web Speech API (Chrome/Android)
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const rec = new SpeechRecognition();
        recognitionRef.current = rec;
        rec.lang = "pt-BR";
        rec.interimResults = true;
        rec.continuous = true;
        rec.onresult = (e: any) => {
          let finalText = "";
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const res = e.results[i];
            if (res.isFinal) finalText += res[0].transcript;
          }
          if (finalText) setTranscricao((prev) => (prev ? prev + " " + finalText : finalText));
        };
        rec.onerror = () => {}; // ignora
        rec.start();
      }

      setIsRecording(true);
    } catch {
      alert("Permissão de microfone negada.");
    }
  }

  function stopRec() {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== "inactive") mr.stop();

    const rec = recognitionRef.current;
    if (rec && rec.stop) rec.stop();

    setIsRecording(false);
  }

  function clearAudio() {
    setAudioData(undefined);
  }

  // lógica excludente
  function handleAtividade(v: string) {
    setAtividade(v);
    if (v) {
      setManifestacao("");
      setComQuem([]); // “Com quem” só faz sentido com manifestação
    }
  }
  function handleManifestacao(v: string) {
    setManifestacao(v);
    if (v) setAtividade("");
  }

  // multi-select até 3
  function handleComQuemChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const selected = Array.from(e.target.selectedOptions).map((o) => o.value);
    if (selected.length > 3) selected.pop();
    setComQuem(selected);
  }

  // ao finalizar, opcionalmente joga a transcrição para Observações
  useEffect(() => {
    if (!autoAppendToObs) return;
    if (transcricao) {
      // evita duplicar: apenas garante que o obs contém a transcrição mais recente
      const tag = "[Transcrição]: ";
      const clean = (obs || "").replace(new RegExp(`${tag}.*$`, "s"), "").trim();
      const joined = clean ? `${clean}\n${tag}${transcricao}` : `${tag}${transcricao}`;
      setObs(joined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcricao]);

  function submit() {
    // Validações simples
    if (!atividade && !manifestacao) {
      alert("Preencha Atividade OU Manifestação.");
      return;
    }
    if (manifestacao && comQuem.length === 0) {
      alert('Preencha "Com quem" (até 3) quando houver Manifestação.');
      return;
    }

    const e: Entry = {
      id: editingId ?? crypto.randomUUID(),
      unidade,
      atividade,
      manifestacao,
      comQuem,
      duracao,
      dificuldade,
      urgente,
      data,
      hora,
      observacoes: obs,
      observacoesAudio: audioData,
      transcricao,
    };
    onSubmit(e);
  }

  return (
    <Section title={editingId ? "Editar registro" : "Novo registro"}>
      <Row label="Unidade">
        <select value={unidade} onChange={(e) => setUnidade(e.target.value)} style={inputStyle}>
          {options.UNIDADES.map((u) => (
            <option key={u} value={u}>{u}</option>
          ))}
        </select>
      </Row>

      <Row label="Atividade">
        <select value={atividade} onChange={(e) => handleAtividade(e.target.value)} style={inputStyle}>
          <option value="">— Selecione —</option>
          {options.ATIVIDADES.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </Row>

      <Row label="Manifestação">
        <select value={manifestacao} onChange={(e) => handleManifestacao(e.target.value)} style={inputStyle}>
          <option value="">— Selecione —</option>
          {options.MANIFESTACOES.map((i) => (
            <option key={i} value={i}>{i}</option>
          ))}
        </select>
      </Row>

      {manifestacao && (
        <Row label="Com quem (máx. 3)">
          <select multiple value={comQuem} onChange={handleComQuemChange} style={{ ...inputStyle, height: 110 }}>
            {options.COM_QUEM.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </Row>
      )}

      <Row label="Duração">
        <select value={duracao} onChange={(e) => setDuracao(e.target.value)} style={inputStyle}>
          {options.DURATIONS.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </Row>

      <Row label="Dificuldade">
        <select
          value={dificuldade}
          onChange={(e) => setDificuldade(e.target.value as Entry["dificuldade"])}
          style={inputStyle}
        >
          <option value="">— Selecione —</option>
          <option value="Baixa">Baixa</option>
          <option value="Média">Média</option>
          <option value="Alta">Alta</option>
          <option value="Altíssima">Altíssima</option>
        </select>
      </Row>

      <Row label="Urgente">
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <input type="checkbox" checked={urgente} onChange={(e) => setUrgente(e.target.checked)} />
          <span>Marcar como urgente</span>
        </label>
      </Row>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Row label="Data">
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} style={inputStyle} />
        </Row>
        <Row label="Hora">
          <select value={hora} onChange={(e) => setHora(e.target.value)} style={inputStyle}>
            {HORAS.map((h) => (<option key={h} value={h}>{h}</option>))}
          </select>
        </Row>
      </div>

      <Row label="Observações">
        <textarea
          placeholder="Opcional"
          value={obs}
          onChange={(e) => setObs(e.target.value)}
          style={{ ...inputStyle, minHeight: 72 }}
        />
      </Row>

      <Section title="Nota falada (com transcrição)">
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {!isRecording ? (
              <button onClick={startRec} style={btn("outline")}>Gravar áudio</button>
            ) : (
              <button onClick={stopRec} style={btn("danger")}>Parar</button>
            )}
            {audioData && (
              <>
                <audio src={audioData} controls style={{ height: 36 }} />
                <button onClick={clearAudio} style={btn("ghost")}>Remover áudio</button>
              </>
            )}
          </div>

          <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={autoAppendToObs}
              onChange={(e) => setAutoAppendToObs(e.target.checked)}
            />
            <span>Inserir transcrição automaticamente em Observações</span>
          </label>

          <textarea
            placeholder="Transcrição (preenchida automaticamente quando o navegador suporta reconhecimento de voz)"
            value={transcricao}
            onChange={(e) => setTranscricao(e.target.value)}
            style={{ ...inputStyle, minHeight: 72 }}
          />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
          {onCancel && <button onClick={onCancel} style={btn("ghost")}>Cancelar</button>}
          <button onClick={submit} style={btn("primary")}>
            {editingId ? "Salvar" : "Registrar"}
          </button>
        </div>
      </Section>
    </Section>
  );
}

/** ===================== Hooks ===================== */
function useEntries() {
  const [entries, setEntries] = useState<Entry[]>([]);
  useEffect(() => { setEntries(loadEntries()); }, []);
  useEffect(() => { saveEntries(entries); }, [entries]);
  return { entries, setEntries };
}
function useOptions() {
  const [opts, setOpts] = useState(loadOptions());
  useEffect(() => { saveOptions(opts); }, [opts]);
  return { opts, setOpts };
}

/** ===================== Resumo ===================== */
function Summary({ entries }: { entries: Entry[] }) {
  const totalMin = useMemo(() => entries.reduce((acc, e) => acc + durationMinutes(e.duracao), 0), [entries]);
  const horas = (totalMin / 60).toFixed(1);

  const porAtividade = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of entries) {
      const key = e.atividade || `(via ${e.manifestacao})`;
      map.set(key, (map.get(key) || 0) + 1);
    }
    return Array.from(map.entries()).map(([name, qty]) => ({ name, qty }));
  }, [entries]);

  return (
    <Section title="Resumo">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ background: "#f3f4f6", borderRadius: 12, padding: 12 }}>
          <div style={{ fontSize: 12, color: "#6b7280" }}>Registros</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{entries.length}</div>
        </div>
        <div style={{ background: "#f3f4f6", borderRadius: 12, padding: 12 }}>
          <div style={{ fontSize: 12, color: "#6b7280" }}>Tempo estimado</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{horas} h</div>
        </div>
      </div>

      <div style={{ height: 240, marginTop: 12 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={porAtividade}>
            <XAxis dataKey="name" interval={0} angle={-15} textAnchor="end" height={60} />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="qty" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p style={{ fontSize: 12, color: "#6b7280", marginTop: 8 }}>
        Gráfico usa contagem por atividade (ou “via Manifestação”) e tempo total estimado.
      </p>
    </Section>
  );
}

/** ===================== Linha da lista ===================== */
function ListRow({
  e,
  onEdit,
  onDelete,
}: {
  e: Entry;
  onEdit: (e: Entry) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div style={{
      border: "1px solid #e5e7eb",
      borderRadius: 12,
      padding: 12,
      display: "grid",
      gridTemplateColumns: "1fr auto",
      gap: 8,
    }}>
      <div>
        <div style={{ fontWeight: 600 }}>
          {e.atividade || e.manifestacao}{" "}
          <span style={{ fontSize: 12, color: "#6b7280" }}>• {e.unidade}</span>
          {e.urgente && (
            <span style={{
              marginLeft: 8, fontSize: 11, color: "#b91c1c",
              border: "1px solid #fecaca", background: "#fee2e2",
              padding: "1px 6px", borderRadius: 8,
            }}>
              URGENTE
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: "#6b7280" }}>
          {e.data} às {e.hora} —{" "}
          {e.manifestacao ? (
            <>
              {e.manifestacao}
              {e.comQuem?.length ? ` → ${e.comQuem.join(", ")}` : ""}
            </>
          ) : (
            e.atividade
          )}{" "}
          • Duração: {e.duracao} • Dificuldade: {e.dificuldade || "—"}
        </div>
        {e.observacoes && <div style={{ fontSize: 13, marginTop: 6 }}>{e.observacoes}</div>}
        {e.transcricao && <div style={{ fontSize: 12, marginTop: 6, color: "#374151" }}><b>Transcrição:</b> {e.transcricao}</div>}
        {e.observacoesAudio && (
          <div style={{ marginTop: 6 }}>
            <audio src={e.observacoesAudio} controls style={{ width: "100%" }} />
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "start" }}>
        <button onClick={() => onEdit(e)} style={btn("ghost")}>Editar</button>
        <button onClick={() => onDelete(e.id)} style={btn("danger")}>Excluir</button>
      </div>
    </div>
  );
}

/** ===================== App ===================== */
export default function App() {
  const { entries, setEntries } = useEntries();
  const { opts, setOpts } = useOptions();

  const [editing, setEditing] = useState<Entry | null>(null);
  const [query, setQuery] = useState("");
  const [filterUnidade, setFilterUnidade] = useState<string>("todas");
  const [rangeStart, setRangeStart] = useState<string>("");
  const [rangeEnd, setRangeEnd] = useState<string>("");

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      const q = query.trim().toLowerCase();
      const okQ =
        !q ||
        [e.atividade, e.manifestacao, (e.comQuem || []).join(", "), e.observacoes || "", e.transcricao || ""]
          .join(" ")
          .toLowerCase()
          .includes(q);
      const okU = filterUnidade === "todas" || e.unidade === filterUnidade;
      const okStart = !rangeStart || e.data >= rangeStart;
      const okEnd = !rangeEnd || e.data <= rangeEnd;
      return okQ && okU && okStart && okEnd;
    });
  }, [entries, query, filterUnidade, rangeStart, rangeEnd]);

  function upsert(entry: Entry) {
    setEntries((prev) => {
      const idx = prev.findIndex((p) => p.id === entry.id);
      if (idx === -1) return [entry, ...prev];
      const copy = [...prev];
      copy[idx] = entry;
      return copy;
    });
    setEditing(null);
  }
  function remove(id: string) {
    setEntries((prev) => prev.filter((p) => p.id !== id));
  }

  function exportCSV() {
    const csv = toCSV(filtered);
    download(`rac_export_${todayISO()}.csv`, csv, "text/csv");
  }
  function exportJSON() {
    download(`rac_backup_${todayISO()}.json`, JSON.stringify(entries, null, 2), "application/json");
  }
  function importJSON(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        if (!Array.isArray(data)) throw new Error("Estrutura inválida");
        const ok = data.every((d) => d.id && d.data && d.hora);
        if (!ok) throw new Error("Formato inválido");
        setEntries(data);
        alert("Backup importado.");
      } catch (e: any) {
        alert(`Falha ao importar: ${e.message || e}`);
      }
    };
    reader.readAsText(file);
  }

  // Configurar listas
  function addTo(listKey: keyof typeof DEFAULT_OPTIONS, value: string) {
    if (!value.trim()) return;
    setOpts((prev: any) => ({
      ...prev,
      [listKey]: Array.from(new Set([...(prev[listKey] || []), value.trim()])),
    }));
  }
  function removeFrom(listKey: keyof typeof DEFAULT_OPTIONS, value: string) {
    setOpts((prev: any) => ({
      ...prev,
      [listKey]: (prev[listKey] || []).filter((x: string) => x !== value),
    }));
  }
  function exportOptions() {
    download(`rac_options_${todayISO()}.json`, JSON.stringify(opts, null, 2), "application/json");
  }
  function importOptions(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        const merged = { ...DEFAULT_OPTIONS, ...data };
        setOpts(merged);
        alert("Opções atualizadas.");
      } catch (e: any) {
        alert(`Falha ao importar opções: ${e.message || e}`);
      }
    };
    reader.readAsText(file);
  }

  return (
    <div style={{
      maxWidth: 480,              // largura ideal pra smartphone
      margin: "0 auto",
      padding: 12,
      paddingBottom: 80,
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      background: "#fafafa",
    }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>RAC Mobile</h1>
          <div style={{ fontSize: 12, color: "#6b7280" }}>Coleta diária • local/offline</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={exportCSV} style={btn("outline")}>CSV</button>
          <button onClick={exportJSON} style={btn("outline")}>Backup</button>
          <label>
            <input type="file" accept="application/json" style={{ display: "none" }} onChange={importJSON} />
            <span style={btn("ghost")}>Importar</span>
          </label>
        </div>
      </header>

      {/* Registrar */}
      {!editing ? (
        <EntryForm onSubmit={upsert} options={opts} />
      ) : (
        <EntryForm onSubmit={upsert} options={opts} initial={editing} onCancel={() => setEditing(null)} />
      )}

      {/* Lista + filtros */}
      <Section title="Lista">
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
          <input
            value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por atividade, manifestação, com quem, observação ou transcrição"
            style={{ ...inputStyle, flex: 1 }}
          />
          <select value={filterUnidade} onChange={(e) => setFilterUnidade(e.target.value)} style={inputStyle}>
            <option value="todas">Todas</option>
            {opts.UNIDADES.map((u) => (<option key={u} value={u}>{u}</option>))}
          </select>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <label style={{ fontSize: 12, color: "#6b7280", width: 24 }}>De</label>
            <input type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <label style={{ fontSize: 12, color: "#6b7280", width: 24 }}>Até</label>
            <input type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
          </div>
        </div>

        <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
          {filtered.map((e) => (
            <ListRow key={e.id} e={e} onEdit={setEditing} onDelete={(id) => remove(id)} />
          ))}
          {filtered.length === 0 && (
            <div style={{ textAlign: "center", color: "#6b7280", fontSize: 13, padding: 24 }}>
              Nenhum registro encontrado.
            </div>
          )}
        </div>
      </Section>

      {/* Resumo */}
      <Summary entries={filtered} />

      {/* Configurar listas */}
      <Section title="Configurar listas">
        {(
          [
            ["UNIDADES", "Unidades"],
            ["ATIVIDADES", "Atividades"],
            ["MANIFESTACOES", "Manifestações"],
            ["COM_QUEM", "Com quem"],
            ["DURATIONS", "Durações"],
          ] as const
        ).map(([key, label]) => (
          <div key={key} style={{ marginBottom: 16 }}>
            <div style={{ marginBottom: 6, fontSize: 14, fontWeight: 600 }}>{label}</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input
                placeholder={`Adicionar em ${label}`}
                onKeyDown={(e: any) => {
                  if (e.key === "Enter" && e.currentTarget.value.trim()) {
                    addTo(key as any, e.currentTarget.value);
                    e.currentTarget.value = "";
                  }
                }}
                style={{ ...inputStyle, flex: 1 }}
              />
              <button
                onClick={() => {
                  const active = document.activeElement as HTMLInputElement;
                  if (active && active.tagName === "INPUT" && active.value.trim()) {
                    addTo(key as any, active.value);
                    active.value = "";
                  }
                }}
                style={btn("primary")}
              >
                Adicionar
              </button>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {(opts as any)[key].map((v: string) => (
                <span key={v} style={{
                  fontSize: 13, background: "#f3f4f6", padding: "6px 10px",
                  borderRadius: 999, display: "inline-flex", alignItems: "center", gap: 8,
                }}>
                  {v}
                  <button
                    onClick={() => removeFrom(key as any, v)}
                    style={{ border: "none", background: "transparent", color: "#6b7280", cursor: "pointer" }}
                    title="Remover"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        ))}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={exportOptions} style={btn("outline")}>Exportar opções</button>
          <label>
            <input type="file" accept="application/json" style={{ display: "none" }} onChange={importOptions} />
            <span style={btn("ghost")}>Importar opções</span>
          </label>
        </div>
      </Section>

      <footer style={{ textAlign: "center", fontSize: 12, color: "#6b7280", marginTop: 24, paddingBottom: 12 }}>
        Otimizado para smartphone • Adicione à tela inicial do celular
      </footer>
    </div>
  );
}
