"use client";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { api } from "../lib/session";
import { Button } from "./ui/button";
import {
  type FormSchema,
  OdooFormView,
  type Values,
  toPayload,
  useOdooForm,
} from "./odoo-form";

export type RecordForm<Extra = object> = {
  schema: FormSchema;
  values: Values;
} & Extra;

// Janela de cadastro completo de um registro do Odoo (novo ou existente).
export function OdooRecordDialog<Extra = object>({
  endpoint,
  recordId,
  newQuery,
  eyebrow,
  title,
  canEdit,
  invalidate,
  onClose,
  extra,
  extraValues,
  header,
  actions,
  savedLabel = "Salvar",
  createLabel = "Cadastrar",
}: {
  endpoint: string;
  recordId?: number;
  // Parâmetros do formulário de novo registro (ex.: tipo de operação).
  newQuery?: string;
  eyebrow: string;
  title: (form: RecordForm<Extra> | undefined) => string;
  canEdit: boolean;
  invalidate: string[];
  onClose: () => void;
  // Campos próprios da ERA (fora da tela do Odoo), enviados como "extra".
  extra?: (
    form: RecordForm<Extra>,
    values: Values,
    set: (values: Values) => void,
  ) => ReactNode;
  extraValues?: (form: RecordForm<Extra>) => Values;
  header?: (form: RecordForm<Extra>) => ReactNode;
  actions?: (form: RecordForm<Extra>, busy: boolean) => ReactNode;
  savedLabel?: string;
  createLabel?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const cache = useQueryClient();
  const key = ["odoo-form", endpoint, recordId ?? "new", newQuery];
  const form = useQuery({
    queryKey: key,
    queryFn: () =>
      api<RecordForm<Extra>>(
        endpoint +
          (recordId
            ? "/" + recordId + "/form"
            : "/form" + (newQuery ? "?" + newQuery : "")),
      ),
    staleTime: 0,
    gcTime: 0,
  });
  const state = useOdooForm({});
  const [extraState, setExtraState] = useState<Values>({});
  const [extraDirty, setExtraDirty] = useState(false);
  const { reset } = state;
  useEffect(() => {
    if (form.data) {
      reset(form.data.values);
      setExtraState(form.data ? (extraValues?.(form.data) ?? {}) : {});
      setExtraDirty(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.data, reset]);
  const save = useMutation({
    mutationFn: () => {
      const schema = form.data!.schema;
      // Novo registro envia tudo; edição envia só o que mudou.
      const values = toPayload(schema, recordId ? state.changed : state.values);
      const body = JSON.stringify({
        values,
        ...(extraDirty || !recordId ? { extra: extraState } : {}),
      });
      return recordId
        ? api<Values>(endpoint + "/" + recordId, { method: "PATCH", body })
        : api<Values>(endpoint, { method: "POST", body });
    },
    onSuccess: async () => {
      for (const name of invalidate)
        void cache.invalidateQueries({ queryKey: [name] });
      void cache.invalidateQueries({ queryKey: ["audit"] });
      if (recordId) await form.refetch();
      else onClose();
    },
  });
  const pending = save.isPending;
  const hasChanges = !recordId || state.dirty.size > 0 || extraDirty;
  return (
    <dialog
      ref={dialog}
      className="modal modal-wide"
      aria-labelledby="record-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!pending) onClose();
      }}
    >
      <div className="modal-heading">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2 id="record-title">{title(form.data)}</h2>
        </div>
        <Button
          variant="outline"
          aria-label="Fechar"
          onClick={onClose}
          disabled={pending}
        >
          <X size={17} />
        </Button>
      </div>
      {form.error ? (
        <div className="empty" role="alert">
          <p>{form.error.message}</p>
          <Button variant="outline" onClick={() => form.refetch()}>
            Tentar novamente
          </Button>
        </div>
      ) : !form.data ? (
        <div className="empty">Carregando o formulário do Odoo…</div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!hasChanges) return onClose();
            save.mutate();
          }}
        >
          {header?.(form.data)}
          {extra?.(form.data, extraState, (patch) => {
            setExtraState((current) => ({ ...current, ...patch }));
            setExtraDirty(true);
          })}
          <OdooFormView
            schema={form.data.schema}
            values={state.values}
            onChange={state.change}
            scope={{ endpoint, recordId }}
            readOnly={!canEdit}
          />
          {save.error && (
            <p role="alert" className="error">
              {save.error.message}
            </p>
          )}
          <div className="form-actions">
            {actions?.(form.data, pending || state.dirty.size > 0)}
            <span className="spacer" />
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={pending}
            >
              Fechar
            </Button>
            {canEdit && (
              <Button disabled={pending || !hasChanges}>
                {pending
                  ? "Gravando no Odoo…"
                  : recordId
                    ? savedLabel
                    : createLabel}
              </Button>
            )}
          </div>
        </form>
      )}
    </dialog>
  );
}
