import BookingConfirmationModal from "./components/BookingConfirmationModal";
import StickySuccessBanner from "./components/StickySuccessBanner";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { CalendarDays, Clock, CheckCircle2, Plus, Trash2, Download } from "lucide-react";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const fmt = (d: string | Date) =>
  new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Oslo";


function generateSlots(open = "09:00", close = "17:00", stepMin = 20): string[] {

  const [oh, om] = open.split(":").map(Number);
  const [ch, cm] = close.split(":").map(Number);
  const start = oh * 60 + om;
  const end = ch * 60 + cm;
  const out: string[] = [];
  for (let m = start; m + stepMin <= end; m += stepMin) {
    const h = String(Math.floor(m / 60)).padStart(2, "0");
    const mm = String(m % 60).padStart(2, "0");
    out.push(`${h}:${mm}`);
  }
  return out;
}

function toKey(dateStr: string, timeStr: string) {
  return `${dateStr}T${timeStr}`;
}
function sameDayISO(d: string | Date) {
  const dt = new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function isPastSlot(dateISO: string, time: string) {
  if (!dateISO || !time) return false;
  const slot = new Date(`${dateISO}T${time}:00`);
  const now = new Date();
  return slot.getTime() <= now.getTime();
}

const LS_KEY = "voi_andoy_bookings_v1";
const readBookings = () => {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "[]");
  } catch {
    return [];
  }
};
const writeBookings = (arr: any[]) => localStorage.setItem(LS_KEY, JSON.stringify(arr));


const SERVICES = [{ id: "consult", name: "Konsultasjon", durationMin: 20 }] as const;


function windowFor(dateISO: string) {
  const d = new Date(dateISO + "T12:00:00");
  const wd = d.getDay();
  if (wd === 1 || wd === 3)
    return { allowed: true, open: "13:00", close: "15:00", location: "på Andenes – Voksenopplæringsskole" };
  if (wd === 2) return { allowed: true, open: "12:30", close: "14:30", location: "i Risøyhamn – Skole" };
  return { allowed: false, open: null as any, close: null as any, location: null as any };
}

function buildQuickDates() {
  const arr: { iso: string; label: string; past: boolean; allowed: boolean }[] = [];
  const today0 = new Date();
  today0.setHours(0, 0, 0, 0);
  let found = 0;
  for (let i = 0; i < 30 && found < 3; i++) {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + i);
    const iso = sameDayISO(d);
    const w = windowFor(iso);
    if (!w.allowed) continue;
    const past = d.getTime() < today0.getTime();
    if (past) continue;
    arr.push({
      iso,
      label: d.toLocaleDateString(undefined, { weekday: "short", day: "2-digit" }),
      past,
      allowed: true,
    });
    found++;
  }
  return arr;
}

export default function App() {
  // Supabase-klient
  const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL as string | undefined;
  const supabaseKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY as string | undefined;
  const supa: SupabaseClient | null = useMemo(() => {
    if (supabaseUrl && supabaseKey) return createClient(supabaseUrl, supabaseKey);
    return null;
  }, [supabaseUrl, supabaseKey]);
  const usingSupabase = !!supa;

  const [bookings, setBookings] = useState<any[]>([]);
  const [tab, setTab] = useState<"book" | "admin">("book");
  const [selectedService, setSelectedService] =
    useState<typeof SERVICES[number]["id"]>(SERVICES[0].id);
  const [date, setDate] = useState(() => sameDayISO(new Date()));
  const [time, setTime] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState<any | null>(null);
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [filterDate, setFilterDate] = useState("");
const [successMsg, setSuccessMsg] = useState<string | undefined>();
const [modalOpen, setModalOpen] = useState(false);
const successRef = useRef<HTMLDivElement>(null);
useEffect(() => {
  if (successMsg) {
    window.scrollTo({ top: 0, behavior: "smooth" });
    successRef.current?.focus();
  }
}, [successMsg]);
function confirmLabel(rec: any) {
  if (!rec) return "";
  return `${fmt(rec.date)} kl. ${rec.time} · ${rec.location || ""}`.trim();
}



  // Les ved start (Supabase -> app mapping) med fallback til LocalStorage
  useEffect(() => {
    (async () => {
      if (supa) {
        const { data, error } = await supa.from("bookings").select("*").order("date").order("time");
        if (!error && data) {
          const mapped = data.map((r: any) => ({
            id: r.id,
            createdAt: r.created_at, // db -> app
            name: r.name,
            email: r.email,
            phone: r.phone,
            note: r.note,
            date: r.date,
            time: r.time,
            serviceId: r.service_id, // db -> app
            serviceName: r.service_name, // db -> app
            durationMin: r.duration_min, // db -> app
            location: r.location,
            tz: r.tz,
          }));
          setBookings(mapped);
        } else {
          setBookings(readBookings());
        }
      } else {
        setBookings(readBookings()); // viktig fallback
      }
    })();
  }, [supa]);

  // Poll hver 20s når Supabase brukes
  useEffect(() => {
    if (!supa) return;
    const id = setInterval(async () => {
      const { data, error } = await supa.from("bookings").select("*").order("date").order("time");
      if (!error && data) {
        const mapped = data.map((r: any) => ({
          id: r.id,
          createdAt: r.created_at, // db -> app
          name: r.name,
          email: r.email,
          phone: r.phone,
          note: r.note,
          date: r.date,
          time: r.time,
          serviceId: r.service_id,
          serviceName: r.service_name,
          durationMin: r.duration_min,
          location: r.location,
          tz: r.tz,
        }));
        setBookings(mapped);
      }
    }, 20000);
    return () => clearInterval(id);
  }, [supa]);

  // Skriv til LocalStorage bare når Supabase ikke er aktiv
  useEffect(() => {
    if (!usingSupabase) writeBookings(bookings);
  }, [bookings, usingSupabase]);

  const service = useMemo(
    () => SERVICES.find((s) => s.id === selectedService)!,
    [selectedService]
  );
  const win = useMemo(() => windowFor(date), [date]);
  const quickDates = useMemo(() => buildQuickDates(), []);
  const takenKeys = useMemo(() => new Set(bookings.map((b) => toKey(b.date, b.time))), [bookings]);
  const availableSlots = useMemo(() => {
    if (!win.allowed) return [] as string[];

const slots = generateSlots(win.open, win.close, 20);

    return slots.filter((t) => !takenKeys.has(toKey(date, t)) && !isPastSlot(date, t));
  }, [win, takenKeys, date]);

  useEffect(() => {
    if (!availableSlots.includes(time)) setTime(availableSlots[0] || "");
  }, [date, availableSlots]);

  async function handleBook(e?: React.FormEvent) {
    e?.preventDefault();
    if (!name || !email || !phone || !date || !time) return alert("Fyll ut alle feltene.");
    if (!win.allowed)
      return alert(
        "Denne dagen er ikke tilgjengelig. Velg man/ons (Andenes) eller tirs (Risøyhamn)."
      );
    const today = sameDayISO(new Date());
    if (date < today) return alert("Datoen har allerede passert. Velg en senere dato.");
    if (isPastSlot(date, time)) return alert("Tiden har allerede passert. Velg et senere tidspunkt.");

    const record: any = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      name,
      email,
      phone,
      note,
      date,
      time,
      serviceId: service.id,
      serviceName: service.name,
      durationMin: service.durationMin,
      location: win.location,
      tz,
    };
    if (takenKeys.has(toKey(date, time))) return alert("Tiden er akkurat blitt tatt. Velg en annen.");

    if (supa) {
      // app -> db mapping (snake_case i Supabase)
      const dbRecord = {
        id: record.id,
        created_at: record.createdAt,
        name: record.name,
        email: record.email,
        phone: record.phone,
        note: record.note,
        date: record.date,
        time: record.time,
        service_id: record.serviceId,
        service_name: record.serviceName,
        duration_min: record.durationMin,
        location: record.location,
        tz: record.tz,
      };

      const { error } = await supa.from("bookings").insert([dbRecord]);
      if (error) {
        if (String(error.message || "").toLowerCase().includes("duplicate")) {
          return alert("Tiden er allerede tatt. Velg en annen tid.");
        }
        console.warn("Supabase insert feilet, lagrer lokalt", error);
        setBookings((b) => [record, ...b]); // fallback lokalt
      } else {
        setBookings((b) => [record, ...b]); // oppdater UI
      }
    } else {
      setBookings((b) => [record, ...b]);
    }
setConfirm(record);
setNote("");

// vis sticky + modal
setSuccessMsg(`Timen er bekreftet – ${confirmLabel(record)}.`);
setModalOpen(true);

  }

  function cancelBooking(id: string) {
    if (!confirmDialog("Slette denne avtalen?")) return;
    const doLocal = () => setBookings((arr) => arr.filter((b) => b.id !== id));
    if (supa) {
      supa
        .from("bookings")
        .delete()
        .eq("id", id)
        .then(({ error }) => {
          if (error) console.warn("Supabase delete feilet, sletter lokalt", error);
          doLocal();
        });
    } else {
      doLocal();
    }
  }

function downloadICS(b: any) {
  const start = new Date(`${b.date}T${b.time}:00`);
  const end = new Date(start.getTime() + b.durationMin * 60000);
  const toICSDate = (d: Date) => d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

  // ICS med CRLF og tydelig LOCATION/DESCRIPTION
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "PRODID:-//Appointment Demo//EN",
    "BEGIN:VEVENT",
    `UID:${b.id}@demo.local`,
    `DTSTAMP:${toICSDate(new Date())}`,
    `DTSTART:${toICSDate(start)}`,
    `DTEND:${toICSDate(end)}`,
    `SUMMARY:${b.serviceName} – ${b.name}`,
    `LOCATION:${b.location || ""}`,
    "DESCRIPTION:" + [
      `Sted: ${b.location || ""}`,
      `Kontakt: ${b.email} / ${b.phone}`,
      b.note ? `Notat: ${b.note}` : "",
    ].filter(Boolean).join("\\n"),
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  const filename = `booking_${b.date}_${b.time}.ics`;
  const file = new File([ics], filename, { type: "text/calendar;charset=utf-8" });

  // 1) Mobil: prøv Web Share (åpner “Del”-arket – ofte med Kalender)
  // iOS/Android støtter dette i nyere nettlesere.
  // @ts-ignore - type guard for canShare with files
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    // @ts-ignore
    navigator.share({
      files: [file],
      title: "Legg i kalender",
      text: "Åpne denne for å legge til i kalenderen.",
    }).catch(() => {
      // hvis bruker avbryter deling -> fall back
      const url = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    });
    return;
  }

  // 2) Desktop / fallback: vanlig nedlasting til “Nedlastinger”
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-50">
      <header className="sticky top-0 z-10 backdrop-blur bg-white/70 border-b">
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-black text-white grid place-items-center font-bold">
              B
            </div>
            <div>
              <h1 className="text-xl font-semibold leading-tight">
                Resepsjon – booking av time for VOI i Andøy
              </h1>
            </div>
          </div>
          <nav className="flex gap-2">
            <button
              className={`px-3 py-2 rounded-xl ${tab === "book" ? "bg-black text-white" : "hover:bg-slate-100"}`}
              onClick={() => setTab("book")}
            >
              Bestill
            </button>
            <button
              className={`px-3 py-2 rounded-xl ${tab === "admin" ? "bg-black text-white" : "hover:bg-slate-100"}`}
              onClick={() => setTab("admin")}
            >
              Admin
            </button>
          </nav>
        </div>
      </header>
<StickySuccessBanner message={successMsg} />

      <main className="mx-auto max-w-6xl px-4 py-10">
        {tab === "book" && (
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid lg:grid-cols-3 gap-6"
          >
            <div className="lg:col-span-2">
              <div className="grid md:grid-cols-2 gap-6">
                <div className="bg-white rounded-2xl p-5 shadow">
                  <div className="flex items-center gap-2 mb-4">
                    <CalendarDays className="h-5 w-5" />
                    <h2 className="font-semibold">Velg dato</h2>
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-2 mb-3">
                    {quickDates.map((d) => {
                      const isSelected = d.iso === date;
                      const classes = [
                        "px-3 py-2 rounded-xl border text-sm whitespace-nowrap",
                        d.past
                          ? "opacity-50 cursor-not-allowed bg-slate-100 border-slate-200 text-slate-400"
                          : d.allowed
                          ? "text-black border-black"
                          : "opacity-60 text-slate-500 border-slate-300 cursor-not-allowed",
                        isSelected ? "bg-black text-white border-black" : "",
                      ].join(" ");
                      return (
                        <button
                          key={d.iso}
                          className={classes}
                          disabled={d.past}
                          title={d.allowed ? "" : "Stengt dag"}
                          onClick={() => !d.past && setDate(d.iso)}
                        >
                          {d.label}
                          {!d.allowed ? " (stengt)" : ""}
                        </button>
                      );
                    })}
                  </div>
                  <input
                    type="date"
                    value={date}
                    min={sameDayISO(new Date())}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full rounded-xl border px-3 py-2"
                  />
                  {!win.allowed && (
                    <p className="text-sm text-rose-600 mt-2">
                      Åpent kun: mandag og onsdag på Andenes (13:00–15:00) og tirsdag i Risøyhamn
                      (12:30–14:30). Velg en tillatt dag.
                    </p>
                  )}
                </div>

                <div className="bg-white rounded-2xl p-5 shadow">
                  <div className="flex items-center gap-2 mb-4">
                    <Clock className="h-5 w-5" />
                    <h2 className="font-semibold">Velg tidspunkt</h2>
                  </div>
                  {availableSlots.length ? (
                    <div className="grid grid-cols-3 gap-2">
                      {availableSlots.map((t) => (
                        <button
                          key={t}
                          onClick={() => setTime(t)}
                          className={`px-3 py-2 rounded-xl border ${
                            time === t ? "bg-black text-white" : "hover:bg-slate-100"
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">
                      Ingen ledige tider denne dagen (åpent mandag og onsdag 13:00–15:00 på
                      Andenes, tirsdag 12:30–14:30 i Risøyhamn).
                    </p>
                  )}
                </div>

                <div className="bg-white rounded-2xl p-5 shadow md:col-span-2">
                  <h2 className="font-semibold mb-4">Konsultasjon</h2>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {SERVICES.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => setSelectedService(s.id)}
                        className={`text-left rounded-2xl border p-4 hover:shadow ${
                          selectedService === s.id ? "bg-black text-white" : "bg-white"
                        }`}
                      >
                        <div className="font-medium">{s.name}</div>
                        <div className="text-sm opacity-70">{s.durationMin} min</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl p-5 shadow mt-6">
                <h2 className="font-semibold mb-4">Dine opplysninger</h2>
                <form onSubmit={handleBook} className="grid md:grid-cols-2 gap-4">
                  <input
                    className="rounded-xl border px-3 py-2"
                    placeholder="Navn"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                  <input
                    className="rounded-xl border px-3 py-2"
                    placeholder="E-post"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <input
                    className="rounded-xl border px-3 py-2"
                    placeholder="Telefon"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                  <input
                    className="rounded-xl border px-3 py-2"
                    readOnly
                    value={`${fmt(date)} • ${time || "–"} • ${service.name} • ${win.location || ""}`}
                  />
                  <textarea
                    className="md:col-span-2 rounded-xl border px-3 py-2"
                    rows={4}
                    placeholder="Notat (valgfritt)"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                  <div className="md:col-span-2 flex items-center gap-3">
                    <button
                      type="submit"
                      className="inline-flex items-center gap-2 rounded-2xl bg-black text-white px-4 py-2"
                    >
                      <Plus className="h-4 w-4" />
                      Bestill time
                    </button>
                    <span className="text-sm text-slate-500">
                      Du får en bekreftelse nedenfor når bestillingen er lagret.
                    </span>
                  </div>
                </form>
              </div>

              {confirm && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 mt-6"
                >
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5" />
                    <div>
                      <h3 className="font-semibold">Time bekreftet!</h3>
                   <p className="text-sm text-slate-700">
  {confirm.serviceName} – {confirm.location} den {fmt(confirm.date)} kl.{" "}
  {confirm.time} ({confirm.durationMin} min). Bestillingen er lagret. Du kan nå laste ned timen.
</p>

                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => downloadICS(confirm)}
                          className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 hover:bg-white"
                        >
                         <Download className="h-4 w-4" />
Last ned timen

                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>

            <div className="space-y-6">
              <div className="bg-white rounded-2xl p-5 shadow">
                <h3 className="font-semibold mb-2">Oppsummering</h3>
                <ul className="text-sm space-y-1">
                  <li>
                    <span className="text-slate-500">Tjeneste:</span> {service.name}
                  </li>
                  <li>
                    <span className="text-slate-500">Sted:</span> {win.location || "–"}
                  </li>
                  <li>
                    <span className="text-slate-500">Åpningstid:</span>{" "}
                    {win.allowed ? `${win.open}–${win.close}` : "—"}
                  </li>
                  <li>
                    <span className="text-slate-500">Varighet:</span> {service.durationMin} min
                  </li>
                  <li>
                    <span className="text-slate-500">Dato/tid:</span> {date ? fmt(date) : "–"}{" "}
                    {time ? `• ${time}` : ""}
                  </li>
                </ul>
              </div>

              <div className="bg-white rounded-2xl p-5 shadow">
                <h3 className="font-semibold mb-2">Åpningstider</h3>
                <p className="text-sm">
                  Mandag og onsdag: på Andenes 13:00–15:00.
                  <br />
                  Tirsdag: i Risøyhamn 12:30–14:30.
                  <br />
                  Andre dager: stengt.
                </p>
              </div>

              <div className="bg-white rounded-2xl p-5 shadow">
                <h3 className="font-semibold mb-2">Slik fungerer det</h3>
                <ol className="list-decimal list-inside text-sm space-y-1 text-slate-700">
                  <li>Velg dato og ledig tidspunkt.</li>
                  <li>Velg tjeneste og fyll inn kontaktinfo.</li>
                  <li>Trykk «Bestill time». Deretter kan du laste ned timen.</li>
                </ol>
              </div>
            </div>
          </motion.section>
        )}

        {tab === "admin" && (
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {!adminUnlocked ? (
              <div className="bg-white rounded-2xl p-6 shadow max-w-xl">
                <h2 className="font-semibold mb-2">Administrasjon</h2>
                <p className="text-sm text-slate-600 mb-4">
                  Dette er en enkel admin-visning. Skriv passord for å låse opp.
                </p>
                <input
                  type="password"
                  placeholder="Passord"
                  className="rounded-xl border px-3 py-2 w-full"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      if ((e.target as HTMLInputElement).value === "Jasmin") setAdminUnlocked(true);
                      else alert("Feil passord");
                    }
                  }}
                />
              </div>
            ) : (
              <div className="bg-white rounded-2xl p-6 shadow">
                <div className="flex flex-col md:flex-row md:items-center gap-3 md:justify-between">
                  <h2 className="font-semibold">Avtaler ({bookings.length})</h2>
                  <div className="flex gap-2 items-center">
                    <input
                      type="date"
                      value={filterDate}
                      onChange={(e) => setFilterDate(e.target.value)}
                      className="rounded-xl border px-3 py-2"
                    />
                    <button
                      onClick={() => {
                        const headers = [
                          "Navn",
                          "E-post",
                          "Telefon",
                          "Tjeneste",
                          "Sted",
                          "Dato",
                          "Tid",
                          "VarighetMin",
                          "Notat",
                          "Opprettet",
                        ];
                        const rows = bookings.map((b) => [
                          b.name,
                          b.email,
                          b.phone,
                          b.serviceName,
                          b.location,
                          b.date,
                          b.time,
                          b.durationMin,
                          (b.note ?? "").replaceAll("\n", " "),
                          b.createdAt,
                        ]);
                        const csv = [
                          headers.join(","),
                          ...rows.map((r) =>
                            r.map((x) => `"${String(x ?? "").replaceAll('"', '""')}"`).join(",")
                          ),
                        ].join("\n");
                        const blob = new Blob([csv], { type: "text/csv" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `bookings_${new Date().toISOString().slice(0, 10)}.csv`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      className="inline-flex items-center gap-2 rounded-xl border px-3 py-2"
                    >
                      <Download className="h-4 w-4" />
                      Eksporter CSV
                    </button>
                  </div>
                </div>

                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-500 border-b">
                        <th className="py-2 pr-4">Dato</th>
                        <th className="py-2 pr-4">Tid</th>
                        <th className="py-2 pr-4">Tjeneste</th>
                        <th className="py-2 pr-4">Sted</th>
                        <th className="py-2 pr-4">Kunde</th>
                        <th className="py-2 pr-4">Kontakt</th>
                        <th className="py-2 pr-4">Varighet</th>
                        <th className="py-2 pr-4">Handlinger</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bookings
                        .filter((b) => !filterDate || b.date === filterDate)
                        .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
                        .map((b) => (
                          <tr key={b.id} className="border-b hover:bg-slate-50">
                            <td className="py-2 pr-4 whitespace-nowrap">{fmt(b.date)}</td>
                            <td className="py-2 pr-4 whitespace-nowrap">{b.time}</td>
                            <td className="py-2 pr-4">{b.serviceName}</td>
                            <td className="py-2 pr-4">{b.location}</td>
                            <td className="py-2 pr-4">{b.name}</td>
                            <td className="py-2 pr-4">
                              {b.email}
                              <br />
                              <span className="text-slate-500">{b.phone}</span>
                            </td>
                            <td className="py-2 pr-4">{b.durationMin} min</td>
                            <td className="py-2 pr-4">
                              <button onClick={() => downloadICS(b)} className="mr-2 underline">
                                .ics
                              </button>
                              <button
                                onClick={() => cancelBooking(b.id)}
                                className="inline-flex items-center gap-1 text-rose-600"
                              >
                                <Trash2 className="h-4 w-4" />
                                Slett
                              </button>
                            </td>
                          </tr>
                        ))}
                      {!bookings.length && (
                        <tr>
                          <td colSpan={8} className="py-8 text-center text-slate-500">
                            Ingen avtaler enda.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <p className="text-xs text-slate-500 mt-3">
                  {usingSupabase
                    ? "Data lagres sentralt i Supabase. Admin ser alle bookinger her."
                    : "Data lagres kun lokalt i nettleseren (LocalStorage). For ekte drift, koble mot en backend (Supabase, Firebase, eller egen API)."}
                </p>

              </div>
            )}
          </motion.section>
        )}
      </main>

           <footer className="mx-auto max-w-6xl px-4 py-12 text-center text-sm text-slate-500">
        © 2025 Resepsjon – booking av time for VOI i Andøy
      </footer>

      {/* Live-region for skjermlesere (må være inne i return) */}
      <div
  ref={successRef}
  className="sr-only"
  aria-live="polite"
  role="status"
  aria-atomic="true"
  tabIndex={-1}
>
  {successMsg}
</div>


      {/* Modal (må være inne i return) */}
     <BookingConfirmationModal
  open={modalOpen}
  onClose={() => setModalOpen(false)}
  timeLabel={confirmLabel(confirm)}
  onDownloadIcs={() => confirm && downloadICS(confirm)}
/>
    </div>
  );
}


// Small cross-browser confirm wrapper
function confirmDialog(message: string) {
  try {
    return window.confirm(message);
  } catch {
    return true;
  }
}
