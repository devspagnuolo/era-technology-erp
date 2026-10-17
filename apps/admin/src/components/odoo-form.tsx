"use client";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { ImagePlus, Plus, Search, Trash2, X } from "lucide-react";
import { api } from "../lib/session";
import { Button } from "./ui/button";
import { check } from "../../../../packages/shared/odoo-expr";

// Formulário completo de um registro do Odoo. Os campos, abas, condições de
// exibição e recálculos vêm da própria tela do Odoo (esquema da API ERA).
export type FieldDef = {
  name: string;
  label: string;
  type: string;
  widget?: string;
  required: boolean;
  requiredIf?: string;
  hidden?: boolean;
  readonly: boolean;
  readonlyIf?: string;
  invisibleIf?: string;
  columnInvisibleIf?: string;
  selection?: Array<[string, string]>;
  relation?: string;
  onChange?: boolean;
  section: string;
  group?: string;
  placeholder?: string;
  sub?: {
    model: string;
    columns: string[];
    fields: Record<string, FieldDef>;
  };
};
export type FormSchema = {
  model: string;
  sections: Array<{ title: string; fields: string[] }>;
  fields: Record<string, FieldDef>;
};
export type Values = Record<string, unknown>;
type Ref = { id: number; name: string };
type Scope = { endpoint: string; recordId?: number };

const isRef = (v: unknown): v is Ref =>
  !!v && typeof v === "object" && "id" in (v as object);

// Datas e horas do Odoo são UTC "AAAA-MM-DD HH:MM:SS"; a tela usa hora local.
function utcToLocal(value: unknown) {
  if (typeof value !== "string" || !value) return "";
  const date = new Date(value.replace(" ", "T") + "Z");
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    date.getFullYear() +
    "-" +
    pad(date.getMonth() + 1) +
    "-" +
    pad(date.getDate()) +
    "T" +
    pad(date.getHours()) +
    ":" +
    pad(date.getMinutes())
  );
}
function localToUtc(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return date.toISOString().slice(0, 19).replace("T", " ");
}

// Estado do formulário: valores atuais e campos alterados.
export function useOdooForm(initial: Values) {
  const [values, setValues] = useState<Values>(initial);
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const reset = useCallback((next: Values) => {
    setValues(next);
    setDirty(new Set());
  }, []);
  const change = useCallback((patch: Values) => {
    setValues((current) => ({ ...current, ...patch }));
    setDirty((current) => new Set([...current, ...Object.keys(patch)]));
  }, []);
  const changed = useMemo(
    () => Object.fromEntries([...dirty].map((name) => [name, values[name]])),
    [dirty, values],
  );
  return { values, change, reset, changed, dirty };
}

// Valores ERA → corpo de gravação (referências viram ids).
export function toPayload(schema: FormSchema, values: Values) {
  const out: Values = {};
  for (const [name, value] of Object.entries(values)) {
    const def = schema.fields[name];
    if (!def) continue;
    out[name] = payloadValue(def, value);
  }
  return out;
}
function payloadValue(def: FieldDef, value: unknown): unknown {
  if (def.type === "many2one") return isRef(value) ? value.id : null;
  if (def.type === "many2many")
    return Array.isArray(value) ? value.map((v) => (isRef(v) ? v.id : v)) : [];
  if (def.type === "one2many" && def.sub)
    return Array.isArray(value)
      ? (value as Values[]).map((row) => {
          const out: Values = typeof row.id === "number" ? { id: row.id } : {};
          // Colunas e campos ocultos da tela (preenchidos pelo Odoo).
          for (const name of Object.keys(def.sub!.fields))
            if (name in row)
              out[name] = payloadValue(def.sub!.fields[name], row[name]);
          return out;
        })
      : [];
  return value === undefined ? null : value;
}

export function OdooFormView({
  schema,
  values,
  onChange,
  scope,
  readOnly,
  header,
}: {
  schema: FormSchema;
  values: Values;
  onChange: (patch: Values) => void;
  scope: Scope;
  readOnly?: boolean;
  header?: ReactNode;
}) {
  const [tab, setTab] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const latest = useRef(values);
  latest.current = values;

  // Recalcula no Odoo quando um campo marcado com on_change muda.
  const recompute = useCallback(
    async (
      field: string,
      next: Values,
      line?: { index: number; field: string },
    ) => {
      setSyncing(true);
      setWarning(null);
      try {
        const query = scope.recordId ? "?id=" + scope.recordId : "";
        if (line) {
          const rows = (next[field] as Values[]) ?? [];
          const result = await api<{ line: Values }>(
            scope.endpoint + "/onchange" + query,
            {
              method: "POST",
              body: JSON.stringify({
                values: payloadOnly(schema, next),
                field,
                line: { values: rows[line.index], field: line.field },
              }),
            },
          );
          const current = (latest.current[field] as Values[]) ?? [];
          const updated = current.map((row, i) =>
            i === line.index ? { ...row, ...result.line } : row,
          );
          const merged = { ...latest.current, [field]: updated };
          onChange({ [field]: updated });
          if (schema.fields[field].onChange) await recompute(field, merged);
          return;
        }
        const result = await api<{ values: Values }>(
          scope.endpoint + "/onchange" + query,
          {
            method: "POST",
            body: JSON.stringify({ values: payloadOnly(schema, next), field }),
          },
        );
        const patch = Object.fromEntries(
          Object.entries(result.values).filter(
            ([name, value]) =>
              JSON.stringify(value) !== JSON.stringify(latest.current[name]),
          ),
        );
        if (Object.keys(patch).length) onChange(patch);
      } catch (error) {
        setWarning((error as Error).message);
      } finally {
        setSyncing(false);
      }
    },
    [schema, scope.endpoint, scope.recordId, onChange],
  );

  const set = (def: FieldDef, value: unknown) => {
    const next = { ...latest.current, [def.name]: value };
    onChange({ [def.name]: value });
    if (def.onChange && def.type !== "one2many") void recompute(def.name, next);
  };

  const visible = (name: string) =>
    !check(schema.fields[name].invisibleIf, values);
  const sections = schema.sections
    .map((section) => ({
      ...section,
      fields: section.fields.filter(visible),
    }))
    .filter((section) => section.fields.length);
  const [main, ...tabs] =
    sections[0]?.title === "Geral"
      ? sections
      : [{ title: "", fields: [] }, ...sections];
  const active = tabs[Math.min(tab, tabs.length - 1)];

  const renderFields = (names: string[]) => {
    let group: string | undefined;
    const out: ReactNode[] = [];
    for (const name of names) {
      const def = schema.fields[name];
      if (def.group !== group) {
        group = def.group;
        if (group)
          out.push(
            <h4 key={"g-" + name} className="odoo-group">
              {group}
            </h4>,
          );
      }
      out.push(
        <OdooField
          key={name}
          def={def}
          value={values[name]}
          values={values}
          readOnly={readOnly}
          scope={scope}
          schema={schema}
          onValue={(value) => set(def, value)}
          onRows={(rows, line) => {
            const next = { ...latest.current, [def.name]: rows };
            onChange({ [def.name]: rows });
            if (line) void recompute(def.name, next, line);
            else if (def.onChange) void recompute(def.name, next);
          }}
        />,
      );
    }
    return out;
  };

  return (
    <div className="odoo-form">
      {header}
      {main.fields.length > 0 && (
        <div className="odoo-grid">{renderFields(main.fields)}</div>
      )}
      {tabs.length > 0 && (
        <>
          <div className="odoo-tabs" role="tablist">
            {tabs.map((section, index) => (
              <button
                type="button"
                role="tab"
                key={section.title}
                aria-selected={section === active}
                className={section === active ? "active" : ""}
                onClick={() => setTab(index)}
              >
                {section.title}
              </button>
            ))}
          </div>
          {active && (
            <div className="odoo-grid" role="tabpanel">
              {renderFields(active.fields)}
            </div>
          )}
        </>
      )}
      <p className="odoo-sync" aria-live="polite">
        {syncing ? "Recalculando no Odoo…" : warning}
      </p>
    </div>
  );
}

// Valores atuais em formato de gravação, para o recálculo do Odoo.
function payloadOnly(schema: FormSchema, values: Values) {
  return toPayload(schema, values);
}

function OdooField({
  def,
  value,
  values,
  readOnly,
  scope,
  schema,
  onValue,
  onRows,
  compact,
  line,
}: {
  def: FieldDef;
  value: unknown;
  values: Values;
  readOnly?: boolean;
  scope: Scope;
  schema: FormSchema;
  onValue: (value: unknown) => void;
  onRows?: (rows: Values[], line?: { index: number; field: string }) => void;
  compact?: boolean;
  line?: { field: string; values: Values };
}) {
  const locked = readOnly || def.readonly || check(def.readonlyIf, values);
  const required = def.required || check(def.requiredIf, values);
  const id = "f-" + (line ? line.field + "-" : "") + def.name;
  const wide =
    def.type === "one2many" ||
    def.type === "html" ||
    def.type === "text" ||
    def.widget === "image";
  let input: ReactNode;
  switch (def.type) {
    case "boolean":
      input = (
        <input
          id={id}
          type="checkbox"
          checked={!!value}
          disabled={locked}
          onChange={(e) => onValue(e.target.checked)}
        />
      );
      break;
    case "selection":
      input = (
        <select
          id={id}
          value={(value as string) ?? ""}
          disabled={locked}
          onChange={(e) => onValue(e.target.value || null)}
        >
          {!required && <option value="">—</option>}
          {required && !value && <option value="">Selecione</option>}
          {def.selection?.map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      );
      break;
    case "integer":
    case "float":
    case "monetary": {
      const percent = def.widget === "percentage";
      const shown =
        typeof value === "number" ? (percent ? value * 100 : value) : "";
      input = (
        <NumberInput
          id={id}
          value={shown}
          disabled={locked}
          integer={def.type === "integer"}
          onCommit={(n) => onValue(n === null ? null : percent ? n / 100 : n)}
        />
      );
      break;
    }
    case "date":
      input = (
        <input
          id={id}
          type="date"
          value={(value as string) ?? ""}
          disabled={locked}
          onChange={(e) => onValue(e.target.value || null)}
        />
      );
      break;
    case "datetime":
      input = (
        <input
          id={id}
          type="datetime-local"
          value={utcToLocal(value)}
          disabled={locked}
          onChange={(e) => onValue(localToUtc(e.target.value))}
        />
      );
      break;
    case "text":
    case "html":
      input = (
        <TextInput
          id={id}
          multiline={!compact}
          value={(value as string) ?? ""}
          disabled={locked}
          onCommit={(text) => onValue(text || null)}
        />
      );
      break;
    case "many2one":
      input = (
        <RelationInput
          id={id}
          def={def}
          value={isRef(value) ? value : null}
          disabled={locked}
          scope={scope}
          values={values}
          line={line}
          onSelect={(ref) => onValue(ref)}
        />
      );
      break;
    case "many2many":
      input = (
        <TagsInput
          id={id}
          def={def}
          value={Array.isArray(value) ? (value as Ref[]) : []}
          disabled={locked}
          scope={scope}
          values={values}
          line={line}
          onValues={(refs) => onValue(refs)}
        />
      );
      break;
    case "one2many":
      input = (
        <RowsInput
          def={def}
          rows={Array.isArray(value) ? (value as Values[]) : []}
          parent={values}
          disabled={locked}
          scope={scope}
          schema={schema}
          onRows={(rows, l) => onRows?.(rows, l)}
        />
      );
      break;
    case "binary":
      input = (
        <ImageInput
          id={id}
          value={(value as string) ?? null}
          disabled={locked}
          onValue={onValue}
        />
      );
      break;
    default:
      input = (
        <TextInput
          id={id}
          value={(value as string) ?? ""}
          disabled={locked}
          placeholder={def.placeholder}
          type={
            def.widget === "email"
              ? "email"
              : def.widget === "phone"
                ? "tel"
                : def.widget === "url"
                  ? "url"
                  : "text"
          }
          onCommit={(text) => onValue(text || null)}
        />
      );
  }
  if (compact) return <div className="odoo-cell">{input}</div>;
  return (
    <div
      className={
        "odoo-field" +
        (wide ? " wide" : "") +
        (def.type === "boolean" ? " boolean" : "")
      }
    >
      <label htmlFor={id}>
        {def.label}
        {required && !locked && <span className="required">*</span>}
      </label>
      {input}
    </div>
  );
}

// Campos de texto gravam o valor ao sair do campo, para não recalcular a cada tecla.
function TextInput({
  id,
  value,
  disabled,
  onCommit,
  multiline,
  placeholder,
  type = "text",
}: {
  id: string;
  value: string;
  disabled?: boolean;
  onCommit: (value: string) => void;
  multiline?: boolean;
  placeholder?: string;
  type?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft !== value) onCommit(draft);
  };
  if (multiline)
    return (
      <textarea
        id={id}
        rows={3}
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
      />
    );
  return (
    <input
      id={id}
      type={type}
      value={draft}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
      }}
    />
  );
}

function NumberInput({
  id,
  value,
  disabled,
  integer,
  onCommit,
}: {
  id: string;
  value: number | "";
  disabled?: boolean;
  integer?: boolean;
  onCommit: (value: number | null) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const text = draft.trim().replace(",", ".");
    const n = text === "" ? null : Number(text);
    if (
      n !== null &&
      (!Number.isFinite(n) || (integer && !Number.isInteger(n)))
    ) {
      setDraft(String(value));
      return;
    }
    if (n !== (value === "" ? null : value)) onCommit(n);
  };
  return (
    <input
      id={id}
      inputMode="decimal"
      value={draft}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
      }}
    />
  );
}

function useLookup(
  scope: Scope,
  def: FieldDef,
  q: string,
  open: boolean,
  values: Values,
  line?: { field: string; values: Values },
) {
  const [term, setTerm] = useState(q);
  useEffect(() => {
    const timer = setTimeout(() => setTerm(q), 250);
    return () => clearTimeout(timer);
  }, [q]);
  return useQuery({
    queryKey: ["odoo-lookup", scope.endpoint, line?.field, def.name, term],
    queryFn: () =>
      api<Ref[]>(scope.endpoint + "/lookup", {
        method: "POST",
        body: JSON.stringify(
          line
            ? {
                field: line.field,
                q: term,
                // Num item, "values" traz a linha + parent; a API quer o pedido.
                values: lookupValues((values.parent as Values) ?? values),
                line: { field: def.name, values: lookupValues(line.values) },
              }
            : { field: def.name, q: term, values: lookupValues(values) },
        ),
      }),
    enabled: open,
    staleTime: 30_000,
  });
}
// Para os filtros (domain) basta id/valor simples de cada campo.
function lookupValues(values: Values) {
  return Object.fromEntries(
    Object.entries(values).filter(
      ([, value]) => typeof value !== "string" || value.length < 500,
    ),
  );
}

function RelationInput({
  id,
  def,
  value,
  disabled,
  scope,
  values,
  line,
  onSelect,
}: {
  id: string;
  def: FieldDef;
  value: Ref | null;
  disabled?: boolean;
  scope: Scope;
  values: Values;
  line?: { field: string; values: Values };
  onSelect: (ref: Ref | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const options = useLookup(scope, def, q, open, values, line);
  if (disabled)
    return <input id={id} value={value?.name ?? ""} disabled readOnly />;
  return (
    <div className="odoo-combo">
      <div className="odoo-combo-input">
        <input
          id={id}
          value={open ? q : (value?.name ?? "")}
          placeholder={open ? "Buscar…" : "—"}
          onFocus={() => {
            setQ("");
            setOpen(true);
          }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(e) => setQ(e.target.value)}
          autoComplete="off"
        />
        {value && !open && (
          <button
            type="button"
            className="odoo-clear"
            aria-label={"Limpar " + def.label}
            onClick={() => onSelect(null)}
          >
            <X size={13} />
          </button>
        )}
      </div>
      {open && (
        <ul className="odoo-options" role="listbox">
          {options.isPending ? (
            <li className="muted">Buscando…</li>
          ) : options.error ? (
            <li className="error">{options.error.message}</li>
          ) : options.data?.length ? (
            options.data.map((option) => (
              <li
                key={option.id}
                role="option"
                aria-selected={option.id === value?.id}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelect(option);
                  setOpen(false);
                }}
              >
                {option.name}
              </li>
            ))
          ) : (
            <li className="muted">Nada encontrado</li>
          )}
        </ul>
      )}
    </div>
  );
}

function TagsInput({
  id,
  def,
  value,
  disabled,
  scope,
  values,
  line,
  onValues,
}: {
  id: string;
  def: FieldDef;
  value: Ref[];
  disabled?: boolean;
  scope: Scope;
  values: Values;
  line?: { field: string; values: Values };
  onValues: (refs: Ref[]) => void;
}) {
  return (
    <div className="odoo-tags">
      {value.map((ref) => (
        <span key={ref.id} className="odoo-tag">
          {ref.name}
          {!disabled && (
            <button
              type="button"
              aria-label={"Remover " + ref.name}
              onClick={() => onValues(value.filter((v) => v.id !== ref.id))}
            >
              <X size={11} />
            </button>
          )}
        </span>
      ))}
      {!disabled && (
        <RelationInput
          id={id}
          def={def}
          value={null}
          scope={scope}
          values={values}
          line={line}
          onSelect={(ref) => {
            if (ref && !value.some((v) => v.id === ref.id))
              onValues([...value, ref]);
          }}
        />
      )}
      {disabled && !value.length && <span className="muted">—</span>}
    </div>
  );
}

function ImageInput({
  id,
  value,
  disabled,
  onValue,
}: {
  id: string;
  value: string | null;
  disabled?: boolean;
  onValue: (value: string | null) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="odoo-image">
      {value ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={"data:image/*;base64," + value} alt="" />
      ) : (
        <span className="odoo-image-empty">
          <ImagePlus size={22} />
        </span>
      )}
      {!disabled && (
        <div>
          <input
            id={id}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.size > 3 * 1024 * 1024)
                return setError("Imagem acima de 3 MB");
              const reader = new FileReader();
              reader.onload = () => {
                setError(null);
                onValue(String(reader.result).split(",")[1] ?? null);
              };
              reader.readAsDataURL(file);
            }}
          />
          {value && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onValue(null)}
            >
              Remover imagem
            </Button>
          )}
          {error && <span className="error">{error}</span>}
        </div>
      )}
    </div>
  );
}

let virtualKey = 0;
function RowsInput({
  def,
  rows,
  parent,
  disabled,
  scope,
  schema,
  onRows,
}: {
  def: FieldDef;
  rows: Values[];
  parent: Values;
  disabled?: boolean;
  scope: Scope;
  schema: FormSchema;
  onRows: (rows: Values[], line?: { index: number; field: string }) => void;
}) {
  const sub = def.sub!;
  // Colunas dependem só do registro principal; cada célula pode se ocultar.
  const columns = sub.columns.filter(
    (name) => !check(sub.fields[name].columnInvisibleIf, { parent }),
  );
  const update = (index: number, name: string, value: unknown) => {
    const next = rows.map((row, i) =>
      i === index ? { ...row, [name]: value } : row,
    );
    onRows(
      next,
      sub.fields[name].onChange ? { index, field: name } : undefined,
    );
  };
  return (
    <div className="table-scroll odoo-rows">
      <table>
        <thead>
          <tr>
            {columns.map((name) => (
              <th key={name}>{sub.fields[name].label}</th>
            ))}
            {!disabled && <th aria-label="Remover" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={
                typeof row.id === "number" ? row.id : String(row._key ?? index)
              }
            >
              {columns.map((name) => {
                const field = sub.fields[name];
                const scopeValues = { ...row, parent };
                const hiddenHere = check(field.invisibleIf, scopeValues);
                return (
                  <td key={name}>
                    {!hiddenHere && (
                      <OdooField
                        def={field}
                        value={row[name]}
                        values={scopeValues}
                        readOnly={disabled}
                        scope={scope}
                        schema={schema}
                        compact
                        line={{ field: def.name, values: row }}
                        onValue={(value) => update(index, name, value)}
                      />
                    )}
                  </td>
                );
              })}
              {!disabled && (
                <td>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label="Remover item"
                    onClick={() => onRows(rows.filter((_, i) => i !== index))}
                  >
                    <Trash2 size={14} />
                  </Button>
                </td>
              )}
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={columns.length + 1} className="muted">
                Nenhum item.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {!disabled && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            // Item novo recebe os valores padrão do Odoo (campo vazio).
            onRows([...rows, { _key: "new-" + ++virtualKey }], {
              index: rows.length,
              field: "",
            })
          }
        >
          <Plus size={14} /> Adicionar item
        </Button>
      )}
    </div>
  );
}

// Busca compacta reutilizada nas listas.
export function SearchBox(props: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder: string;
}) {
  return (
    <label className="search">
      <Search size={17} />
      <input
        aria-label={props.label}
        placeholder={props.placeholder}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </label>
  );
}
