# ZvgAkteShow Inline-Edit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Einzelne Skalar-Felder der Objekt-/Verfahren-Karten in `ZvgAkteShow` per Klick-to-Edit direkt bearbeitbar machen, plus eine abgeleitete Bundesland-Zeile.

**Architecture:** Eine wiederverwendbare `InlineEditField`-Komponente (Anzeige + Stift → Inline-Input mit ✓/✗, Speichern via `useUpdate`) und eine spezialisierte `InlineEditAddress`-Komponente (5 Adress-Teilfelder in einem Update). Beide werden in die bestehende custom-gebaute `ZvgAkteShow`-Ansicht eingehängt. Reine Wert-Konvertierung (Anzeige ↔ DB) liegt in getesteten Hilfsfunktionen.

**Tech Stack:** React 19, TypeScript, ra-core (`useUpdate`/`useRecordContext`/`useNotify`), shadcn UI (`Input`/`Textarea`/`Button`), lucide-react Icons, Vitest (Browser-Mode via `vitest-browser-react`).

**Primärschlüssel:** `zvg_akte` nutzt `zid` als Primärschlüssel (dataProvider `primaryKeys`-Map). Update-Aufrufe verwenden `id: record.zid`.

---

## File Structure

- **Create:** `src/components/atomic-crm/zvgAkten/InlineEditField.tsx` — Hilfsfunktionen (`toInputValue`, `parseValue`), `InlineEditField`, `InlineEditAddress`.
- **Create:** `src/components/atomic-crm/zvgAkten/InlineEditField.test.tsx` — Tests für Helpers + Komponenten.
- **Modify:** `src/components/atomic-crm/zvgAkten/ZvgAkteShow.tsx` — Objekt-/Verfahren-Karten verwenden die neuen Komponenten; neue Bundesland-Row.
- **Unverändert:** `ZvgAkteEdit.tsx`, `index.ts` (`ZvgAkte`-Typ hat alle Felder bereits).

---

## Task 1: Wert-Konvertierungs-Hilfsfunktionen (TDD)

**Files:**
- Create: `src/components/atomic-crm/zvgAkten/InlineEditField.tsx`
- Test: `src/components/atomic-crm/zvgAkten/InlineEditField.test.tsx`

- [ ] **Step 1: Failing test schreiben**

Datei `src/components/atomic-crm/zvgAkten/InlineEditField.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { parseValue, toInputValue } from "./InlineEditField";

describe("parseValue", () => {
  it("leerer/whitespace String -> null", () => {
    expect(parseValue("text", "")).toBeNull();
    expect(parseValue("text", "   ")).toBeNull();
  });
  it("text wird getrimmt", () => {
    expect(parseValue("text", "  Hallo ")).toBe("Hallo");
  });
  it("number toleriert deutsches Format", () => {
    expect(parseValue("number", "1.234,50")).toBe(1234.5);
    expect(parseValue("number", "42")).toBe(42);
  });
  it("ungültige Zahl -> null", () => {
    expect(parseValue("number", "abc")).toBeNull();
  });
  it("datetime -> ISO oder null", () => {
    expect(parseValue("datetime", "2026-06-24T10:30")).toBe(
      new Date("2026-06-24T10:30").toISOString(),
    );
    expect(parseValue("datetime", "")).toBeNull();
  });
});

describe("toInputValue", () => {
  it("null -> leerer String", () => {
    expect(toInputValue("text", null)).toBe("");
    expect(toInputValue("number", null)).toBe("");
  });
  it("text/number -> String", () => {
    expect(toInputValue("text", "Haus")).toBe("Haus");
    expect(toInputValue("number", 1234)).toBe("1234");
  });
  it("datetime -> 'YYYY-MM-DDTHH:mm' lokal", () => {
    const iso = new Date("2026-06-24T10:30").toISOString();
    expect(toInputValue("datetime", iso)).toBe("2026-06-24T10:30");
  });
});
```

- [ ] **Step 2: Test ausführen, Fehlschlag bestätigen**

Run: `npm run test -- src/components/atomic-crm/zvgAkten/InlineEditField.test.tsx`
Expected: FAIL — Modul/Exports `parseValue`, `toInputValue` existieren nicht.

- [ ] **Step 3: Minimale Implementierung der Helpers**

Datei `src/components/atomic-crm/zvgAkten/InlineEditField.tsx`:

```tsx
export type FieldType = "text" | "number" | "multiline" | "datetime";

const pad = (n: number) => String(n).padStart(2, "0");

export const toInputValue = (type: FieldType, raw: unknown): string => {
  if (raw == null) return "";
  if (type === "datetime") {
    const d = new Date(raw as string);
    if (Number.isNaN(d.getTime())) return "";
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  return String(raw);
};

export const parseValue = (type: FieldType, str: string): unknown => {
  const trimmed = str.trim();
  if (trimmed === "") return null;
  if (type === "number") {
    const n = Number(trimmed.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  if (type === "datetime") {
    const d = new Date(trimmed);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return trimmed;
};
```

- [ ] **Step 4: Test ausführen, Erfolg bestätigen**

Run: `npm run test -- src/components/atomic-crm/zvgAkten/InlineEditField.test.tsx`
Expected: PASS (alle `parseValue`/`toInputValue` Tests grün).

- [ ] **Step 5: Commit**

```bash
git add src/components/atomic-crm/zvgAkten/InlineEditField.tsx src/components/atomic-crm/zvgAkten/InlineEditField.test.tsx
git commit -m "Inline-Edit: Wert-Konvertierungs-Helper (toInputValue/parseValue)"
```

---

## Task 2: `InlineEditField`-Komponente (TDD)

**Files:**
- Modify: `src/components/atomic-crm/zvgAkten/InlineEditField.tsx`
- Test: `src/components/atomic-crm/zvgAkten/InlineEditField.test.tsx`

- [ ] **Step 1: Failing test schreiben** (an bestehende Testdatei anhängen)

Imports oben in der Testdatei ergänzen:

```tsx
import { render } from "vitest-browser-react";
import { vi } from "vitest";
import {
  CoreAdminContext,
  RecordContextProvider,
  testDataProvider,
} from "ra-core";
import { InlineEditField } from "./InlineEditField";
```

Neuer describe-Block:

```tsx
const renderField = (props: { update?: ReturnType<typeof vi.fn> } = {}) => {
  const update =
    props.update ??
    vi.fn().mockResolvedValue({ data: { zid: 1, objektart: "Wohnung" } });
  const dataProvider = testDataProvider({ update });
  const record = { id: 1, zid: 1, objektart: "Haus" };
  const screen = render(
    <CoreAdminContext dataProvider={dataProvider}>
      <RecordContextProvider value={record}>
        <InlineEditField source="objektart" label="Objektart" type="text" />
      </RecordContextProvider>
    </CoreAdminContext>,
  );
  return { screen, update };
};

describe("InlineEditField", () => {
  it("zeigt den formatierten Wert", async () => {
    const { screen } = renderField();
    await expect.element(screen.getByText("Haus")).toBeInTheDocument();
  });

  it("öffnet bei Klick auf Stift ein Eingabefeld mit aktuellem Wert", async () => {
    const { screen } = renderField();
    await screen.getByRole("button", { name: /Objektart bearbeiten/i }).click();
    await expect
      .element(screen.getByRole("textbox"))
      .toHaveValue("Haus");
  });

  it("Speichern ruft update mit { source: value } und id=zid", async () => {
    const { screen, update } = renderField();
    await screen.getByRole("button", { name: /Objektart bearbeiten/i }).click();
    const input = screen.getByRole("textbox");
    await input.fill("Wohnung");
    await screen.getByRole("button", { name: /Speichern/i }).click();
    await vi.waitFor(() => {
      expect(update).toHaveBeenCalledWith(
        "zvg_akte",
        expect.objectContaining({ id: 1, data: { objektart: "Wohnung" } }),
        expect.anything(),
      );
    });
  });

  it("Abbrechen verwirft und ruft kein update", async () => {
    const { screen, update } = renderField();
    await screen.getByRole("button", { name: /Objektart bearbeiten/i }).click();
    await screen.getByRole("button", { name: /Abbrechen/i }).click();
    await expect.element(screen.getByText("Haus")).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
  });

  it("leerer Wert wird als null gespeichert", async () => {
    const { screen, update } = renderField();
    await screen.getByRole("button", { name: /Objektart bearbeiten/i }).click();
    await screen.getByRole("textbox").fill("");
    await screen.getByRole("button", { name: /Speichern/i }).click();
    await vi.waitFor(() => {
      expect(update).toHaveBeenCalledWith(
        "zvg_akte",
        expect.objectContaining({ data: { objektart: null } }),
        expect.anything(),
      );
    });
  });
});
```

- [ ] **Step 2: Test ausführen, Fehlschlag bestätigen**

Run: `npm run test -- src/components/atomic-crm/zvgAkten/InlineEditField.test.tsx`
Expected: FAIL — `InlineEditField` ist nicht exportiert / nicht definiert.

- [ ] **Step 3: `InlineEditField` implementieren** (an `InlineEditField.tsx` anhängen)

```tsx
import { useState, type ReactNode } from "react";
import { useNotify, useRecordContext, useUpdate } from "ra-core";
import { Check, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ZvgAkte } from "./index";

export const InlineEditField = ({
  source,
  label,
  type = "text",
  format,
}: {
  source: keyof ZvgAkte & string;
  label: string;
  type?: FieldType;
  format?: (v: unknown) => ReactNode;
}) => {
  const record = useRecordContext<ZvgAkte>();
  const notify = useNotify();
  const [update, { isPending }] = useUpdate();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  if (!record) return null;
  const raw = (record as Record<string, unknown>)[source];

  const begin = () => {
    setDraft(toInputValue(type, raw));
    setEditing(true);
  };
  const cancel = () => setEditing(false);
  const save = () => {
    update(
      "zvg_akte",
      {
        id: record.zid,
        data: { [source]: parseValue(type, draft) },
        previousData: record,
      },
      {
        onSuccess: () => {
          setEditing(false);
          notify("Gespeichert", { type: "info" });
        },
        onError: (e: unknown) =>
          notify(
            e instanceof Error ? e.message : "Fehler beim Speichern",
            { type: "error" },
          ),
      },
    );
  };

  if (!editing) {
    const display = format
      ? format(raw)
      : raw == null || raw === ""
        ? "—"
        : String(raw);
    return (
      <div className="flex flex-col gap-1 group">
        <span className="text-xs text-muted-foreground">{label}</span>
        <div className="text-sm flex items-start gap-2">
          <span className="flex-1 whitespace-pre-line">{display}</span>
          <button
            type="button"
            aria-label={`${label} bearbeiten`}
            onClick={begin}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground shrink-0"
          >
            <Pencil className="size-3.5" />
          </button>
        </div>
      </div>
    );
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") cancel();
    if (
      e.key === "Enter" &&
      (type !== "multiline" || e.metaKey || e.ctrlKey)
    ) {
      e.preventDefault();
      save();
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-start gap-2">
        {type === "multiline" ? (
          <Textarea
            autoFocus
            rows={4}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            className="flex-1"
          />
        ) : (
          <Input
            autoFocus
            type={type === "datetime" ? "datetime-local" : "text"}
            inputMode={type === "number" ? "decimal" : undefined}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            className="flex-1"
          />
        )}
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="Speichern"
          disabled={isPending}
          onClick={save}
        >
          <Check className="size-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="Abbrechen"
          disabled={isPending}
          onClick={cancel}
        >
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
};
```

- [ ] **Step 4: Test ausführen, Erfolg bestätigen**

Run: `npm run test -- src/components/atomic-crm/zvgAkten/InlineEditField.test.tsx`
Expected: PASS (Helpers + alle `InlineEditField`-Tests grün).

- [ ] **Step 5: Commit**

```bash
git add src/components/atomic-crm/zvgAkten/InlineEditField.tsx src/components/atomic-crm/zvgAkten/InlineEditField.test.tsx
git commit -m "Inline-Edit: InlineEditField-Komponente (Klick-to-Edit)"
```

---

## Task 3: `InlineEditAddress`-Komponente (TDD)

**Files:**
- Modify: `src/components/atomic-crm/zvgAkten/InlineEditField.tsx`
- Test: `src/components/atomic-crm/zvgAkten/InlineEditField.test.tsx`

- [ ] **Step 1: Failing test schreiben** (an Testdatei anhängen)

```tsx
import { InlineEditAddress } from "./InlineEditField";

describe("InlineEditAddress", () => {
  const renderAddr = () => {
    const update = vi.fn().mockResolvedValue({ data: { zid: 1 } });
    const dataProvider = testDataProvider({ update });
    const record = {
      id: 1,
      zid: 1,
      objekt_strasse: "Hauptstr.",
      objekt_hausnummer: "1",
      objekt_plz: "14467",
      objekt_ort: "Potsdam",
      objekt_ortsteil: null,
    };
    const screen = render(
      <CoreAdminContext dataProvider={dataProvider}>
        <RecordContextProvider value={record}>
          <InlineEditAddress display={<span>Hauptstr. 1, 14467 Potsdam</span>} />
        </RecordContextProvider>
      </CoreAdminContext>,
    );
    return { screen, update };
  };

  it("zeigt die Anzeige und einen Bearbeiten-Button", async () => {
    const { screen } = renderAddr();
    await expect
      .element(screen.getByText("Hauptstr. 1, 14467 Potsdam"))
      .toBeInTheDocument();
    await expect
      .element(screen.getByRole("button", { name: /Adresse bearbeiten/i }))
      .toBeInTheDocument();
  });

  it("speichert alle 5 Adressfelder in einem Update", async () => {
    const { screen, update } = renderAddr();
    await screen.getByRole("button", { name: /Adresse bearbeiten/i }).click();
    await screen.getByLabelText("Ort").fill("Berlin");
    await screen.getByRole("button", { name: /Speichern/i }).click();
    await vi.waitFor(() => {
      expect(update).toHaveBeenCalledWith(
        "zvg_akte",
        expect.objectContaining({
          id: 1,
          data: {
            objekt_strasse: "Hauptstr.",
            objekt_hausnummer: "1",
            objekt_plz: "14467",
            objekt_ort: "Berlin",
            objekt_ortsteil: null,
          },
        }),
        expect.anything(),
      );
    });
  });
});
```

- [ ] **Step 2: Test ausführen, Fehlschlag bestätigen**

Run: `npm run test -- src/components/atomic-crm/zvgAkten/InlineEditField.test.tsx`
Expected: FAIL — `InlineEditAddress` nicht definiert.

- [ ] **Step 3: `InlineEditAddress` implementieren** (an `InlineEditField.tsx` anhängen)

```tsx
const ADDRESS_FIELDS = [
  { source: "objekt_strasse", label: "Straße" },
  { source: "objekt_hausnummer", label: "Hausnr." },
  { source: "objekt_plz", label: "PLZ" },
  { source: "objekt_ort", label: "Ort" },
  { source: "objekt_ortsteil", label: "Ortsteil" },
] as const;

export const InlineEditAddress = ({ display }: { display: ReactNode }) => {
  const record = useRecordContext<ZvgAkte>();
  const notify = useNotify();
  const [update, { isPending }] = useUpdate();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});

  if (!record) return null;
  const rec = record as Record<string, unknown>;

  const begin = () => {
    setDraft(
      Object.fromEntries(
        ADDRESS_FIELDS.map((f) => [f.source, (rec[f.source] as string) ?? ""]),
      ),
    );
    setEditing(true);
  };
  const save = () => {
    const data = Object.fromEntries(
      ADDRESS_FIELDS.map((f) => {
        const v = (draft[f.source] ?? "").trim();
        return [f.source, v === "" ? null : v];
      }),
    );
    update(
      "zvg_akte",
      { id: record.zid, data, previousData: record },
      {
        onSuccess: () => {
          setEditing(false);
          notify("Gespeichert", { type: "info" });
        },
        onError: (e: unknown) =>
          notify(e instanceof Error ? e.message : "Fehler beim Speichern", {
            type: "error",
          }),
      },
    );
  };

  if (!editing) {
    return (
      <div className="flex flex-col gap-1 group">
        <span className="text-xs text-muted-foreground">Adresse</span>
        <div className="text-sm flex items-start gap-2">
          <div className="flex-1">{display}</div>
          <button
            type="button"
            aria-label="Adresse bearbeiten"
            onClick={begin}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground shrink-0"
          >
            <Pencil className="size-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-muted-foreground">Adresse</span>
      <div className="grid grid-cols-2 gap-2">
        {ADDRESS_FIELDS.map((f) => (
          <label key={f.source} className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">{f.label}</span>
            <Input
              aria-label={f.label}
              value={draft[f.source] ?? ""}
              onChange={(e) =>
                setDraft((d) => ({ ...d, [f.source]: e.target.value }))
              }
            />
          </label>
        ))}
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant="default"
          aria-label="Speichern"
          disabled={isPending}
          onClick={save}
        >
          <Check className="size-4" /> Speichern
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-label="Abbrechen"
          disabled={isPending}
          onClick={() => setEditing(false)}
        >
          <X className="size-4" /> Abbrechen
        </Button>
      </div>
    </div>
  );
};
```

- [ ] **Step 4: Test ausführen, Erfolg bestätigen**

Run: `npm run test -- src/components/atomic-crm/zvgAkten/InlineEditField.test.tsx`
Expected: PASS (alle Tests grün).

- [ ] **Step 5: Commit**

```bash
git add src/components/atomic-crm/zvgAkten/InlineEditField.tsx src/components/atomic-crm/zvgAkten/InlineEditField.test.tsx
git commit -m "Inline-Edit: InlineEditAddress (5 Adressfelder, ein Update)"
```

---

## Task 4: In ZvgAkteShow einhängen + Bundesland-Zeile

**Files:**
- Modify: `src/components/atomic-crm/zvgAkten/ZvgAkteShow.tsx`

- [ ] **Step 1: Imports ergänzen** (oben bei den lokalen Imports, nahe Zeile 32)

```tsx
import { InlineEditAddress, InlineEditField } from "./InlineEditField";
import { getStateName } from "../companies/states";
```

- [ ] **Step 2: Objekt-Karte umbauen** — den `CardContent`-Block der Objekt-Karte (aktuell ~Zeile 520–568) so ändern, dass die Adresse über `InlineEditAddress` läuft, eine Bundesland-Row ergänzt wird, und Objektart/Art/Beschreibung über `InlineEditField` editierbar sind. Den bestehenden `addrSummary`-Anzeigeblock (Span + Google-Maps-Pille) in eine Variable `addrDisplay` auslagern und an `InlineEditAddress` übergeben. Der Flurstück-Block bleibt unverändert; nur die innere Anzeige der vier Felder wird auf `InlineEditField` umgestellt.

Ersetze den Inhalt des Objekt-`CardContent` durch:

```tsx
          <CardContent className="flex flex-col gap-3">
            <InlineEditAddress
              display={
                <div className="flex flex-col gap-1">
                  <span>{addrSummary || "—"}</span>
                  {addrSummary ? (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addrSummary)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="self-start inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs hover:bg-muted transition-colors"
                    >
                      <MapPin className="w-3 h-3" />
                      <span>Google Maps</span>
                    </a>
                  ) : null}
                </div>
              }
            />

            <Row label="Bundesland">
              {getStateName(record.state_abbr) || "—"}
            </Row>

            <div className="rounded-md border bg-muted/40 p-3 flex flex-col gap-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Flurstück
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <InlineEditField source="gemarkung" label="Gemarkung" type="text" />
                <InlineEditField source="flur" label="Flur" type="text" />
                <InlineEditField source="flurstueck" label="Flurstück" type="text" />
                <InlineEditField
                  source="flurstueck_groesse_qm"
                  label="Größe"
                  type="number"
                  format={(v) => formatQm(v as number | null)}
                />
              </div>
            </div>

            <InlineEditField source="objektart" label="Objektart" type="text" />
            <InlineEditField source="art" label="Art" type="text" />
            <InlineEditField
              source="obj_beschreibung"
              label="Beschreibung"
              type="multiline"
            />
          </CardContent>
```

- [ ] **Step 3: `state_abbr` im `ZvgAkte`-Typ sicherstellen**

Prüfen, ob `index.ts` `state_abbr?: string | null;` enthält. Run:

```bash
grep -n "state_abbr" src/components/atomic-crm/zvgAkten/index.ts
```

Falls KEINE Ausgabe: in `src/components/atomic-crm/zvgAkten/index.ts` im `ZvgAkte`-Typ neben `objekt_ortsteil` ergänzen:

```tsx
  state_abbr?: string | null;
```

- [ ] **Step 4: Verfahren-Karte — Termin/Verkehrswert/Gutachten-Preis editierbar**

In der Verfahren-Karte (aktuell ~Zeile 588–594) die drei Anzeige-Rows ersetzen:

```tsx
            <InlineEditField
              source="termin"
              label="Termin"
              type="datetime"
              format={(v) => formatDateTime(v as string | null)}
            />
            <InlineEditField
              source="vkw_eur"
              label="Verkehrswert"
              type="number"
              format={(v) => formatEur(v as number | null)}
            />
            <InlineEditField
              source="gpreis_eur"
              label="Gutachten-Preis"
              type="number"
              format={(v) =>
                (v as number | null) === 0 ? "kostenlos" : formatEur(v as number | null)
              }
            />
```

Die Rows „Aktenzeichen", „Amtsgericht", „Rechtspfleger:in", „Sachverständige:r" und der `StatusanfrageButton` bleiben unverändert.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck 2>&1 | grep -E "zvgAkten/(ZvgAkteShow|InlineEditField)" || echo "keine neuen Fehler in den geänderten Dateien"`
Expected: „keine neuen Fehler in den geänderten Dateien" (Projekt-Baseline-Fehler in anderen Dateien ignorieren).

- [ ] **Step 6: Commit**

```bash
git add src/components/atomic-crm/zvgAkten/ZvgAkteShow.tsx src/components/atomic-crm/zvgAkten/index.ts
git commit -m "Inline-Edit in ZvgAkteShow einhängen + Bundesland-Zeile"
```

---

## Task 5: Verifikation in der laufenden App

**Files:** keine (manuelle/Preview-Verifikation)

- [ ] **Step 1: Dev-Server sicherstellen** (preview_start falls nötig).

- [ ] **Step 2: Eine ZvgAkte-Detailseite öffnen** (`/#/zvg_akte/<zid>/show`).

- [ ] **Step 3: Inline-Edit prüfen** — bei „Objektart" auf den Stift klicken, Wert ändern, ✓ → „Gespeichert"-Notify, neuer Wert bleibt nach Reload bestehen. ✗/Esc verwirft.

- [ ] **Step 4: Adresse prüfen** — Stift bei Adresse → 5 Felder, Ort ändern, Speichern → `addrSummary` aktualisiert sich.

- [ ] **Step 5: Bundesland-Zeile prüfen** — zeigt den vollen Landesnamen (z. B. „Brandenburg") passend zu `state_abbr`.

- [ ] **Step 6: Verkehrswert prüfen** — Zahl mit Komma eingeben (z. B. „250000"), Speichern → korrekt als EUR formatiert.

- [ ] **Step 7: Screenshot als Nachweis** (preview_screenshot) und Abschluss melden.

---

## Self-Review (vom Plan-Autor durchgeführt)

- **Spec-Abdeckung:** Inline-Edit Skalar-Felder (Task 2/4) ✓; Adresse als Mehrfeld-Editor (Task 3/4) ✓; Bundesland-Zeile read-only via `getStateName` (Task 4) ✓; `null` bei leer (Task 1 `parseValue`, getestet) ✓; deutsche Zahl, datetime (Task 1) ✓; Tests (Task 1–3) ✓; Referenz-Felder bleiben auf Edit-Seite (Task 4 lässt sie unverändert) ✓.
- **Platzhalter:** keine — jeder Code-Step enthält vollständigen Code.
- **Typ-Konsistenz:** `FieldType`, `toInputValue`, `parseValue`, `InlineEditField` (Props `source/label/type/format`), `InlineEditAddress` (Prop `display`) konsistent über alle Tasks; Update immer `id: record.zid`; `getStateName`/`formatQm`/`formatDateTime`/`formatEur` existieren bereits in den jeweiligen Dateien.
