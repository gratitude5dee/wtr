"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PRESET_NAME, PRESET_SENTENCE } from "@/lib/dashboard/format";

import {
  createRequestAction,
  type NewRequestState,
} from "@/app/(dashboard)/requests/new/actions";

const MODALITIES = ["any", "audio", "image", "video", "3d", "motion"] as const;
const PRESETS = ["WTR-TRAIN-EXCLUSIVE", "WTR-TRAIN-NONEXCLUSIVE", "WTR-NO-TRAIN"] as const;
const FIELD_TYPES = ["string", "number", "boolean", "file", "timestamp", "object"] as const;

const FUNDING_CHOICES = [
  {
    value: "none",
    label: "Post without deposit",
    hint: "Creators see the brief as unfunded.",
  },
  {
    value: "deposit",
    label: "Deposit 10%",
    hint: "Signals intent — at least a tenth of the budget up front.",
  },
  {
    value: "full",
    label: "Pay the full amount",
    hint: "The whole budget up front; the brief shows as fully funded.",
  },
] as const;

type FundingChoice = (typeof FUNDING_CHOICES)[number]["value"];

interface ShapeField {
  id: string;
  name: string;
  type: string;
}

/** 10% of a decimal IP budget, as a decimal string — display only. */
function tenthOf(budget: string): string {
  const value = Number(budget);
  if (!Number.isFinite(value) || value <= 0) return "";
  return String(Math.round((value / 10) * 1e6) / 1e6);
}

export function RequestForm() {
  const [state, formAction, pending] = useActionState<NewRequestState, FormData>(
    createRequestAction,
    { error: null },
  );
  // datetime-local strings carry no offset — convert to a UTC instant in the
  // poster's browser so the server never guesses a timezone.
  const [deadlineIso, setDeadlineIso] = useState("");
  const [deadlineLocal, setDeadlineLocal] = useState("");
  // Controlled throughout: a rejected submit re-renders the form, and only
  // React-held values survive that, so a validation error never eats the brief.
  const [title, setTitle] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [notes, setNotes] = useState("");
  const [instructions, setInstructions] = useState("");
  const [budget, setBudget] = useState("");
  const [fundingMode, setFundingMode] = useState<FundingChoice>("none");
  const [fundedAmount, setFundedAmount] = useState("");
  const [fields, setFields] = useState<ShapeField[]>([
    { id: "field-1", name: "", type: "string" },
  ]);

  // The funded amount is derived from the mode, but stays editable so a lab
  // can put down more than the 10% floor.
  const suggested =
    fundingMode === "full" ? budget : fundingMode === "deposit" ? tenthOf(budget) : "";
  const chooseFunding = (mode: FundingChoice) => {
    setFundingMode(mode);
    setFundedAmount(mode === "full" ? budget : mode === "deposit" ? tenthOf(budget) : "");
  };

  const dataShape = JSON.stringify(
    Object.fromEntries(
      fields
        .filter((field) => field.name.trim() !== "")
        .map((field) => [field.name.trim(), field.type]),
    ),
  );

  return (
    <form action={formAction} className="space-y-4 text-sm">
      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          name="title"
          placeholder="Field recordings of urban rain, 48kHz+"
          maxLength={200}
          required
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Modality</legend>
        <div className="flex flex-wrap gap-3">
          {MODALITIES.map((modality) => (
            <label key={modality} className="flex items-center gap-1.5">
              <input
                type="radio"
                name="modality"
                value={modality}
                defaultChecked={modality === "any"}
              />
              {modality}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">License terms you need</legend>
        <div className="space-y-2">
          {PRESETS.map((preset) => (
            <label key={preset} className="flex items-start gap-2">
              <input
                type="radio"
                name="licensePreset"
                value={preset}
                defaultChecked={preset === "WTR-TRAIN-NONEXCLUSIVE"}
                className="mt-1"
              />
              <span>
                <span className="font-medium">{PRESET_NAME[preset] ?? preset}</span>
                <span className="block text-muted-foreground">
                  {PRESET_SENTENCE[preset] ?? ""}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="budget">Total budget (IP)</Label>
          <Input
            id="budget"
            name="budget"
            placeholder="25"
            inputMode="decimal"
            required
            value={budget}
            onChange={(event) => {
              setBudget(event.target.value);
              if (fundingMode === "full") setFundedAmount(event.target.value);
              if (fundingMode === "deposit") setFundedAmount(tenthOf(event.target.value));
            }}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="unitPrice">Per-item price (IP, optional)</Label>
          <Input
            id="unitPrice"
            name="unitPrice"
            placeholder="0.5"
            inputMode="decimal"
            value={unitPrice}
            onChange={(event) => setUnitPrice(event.target.value)}
          />
        </div>
      </div>

      <fieldset className="space-y-2" data-tour="request-funding">
        <legend className="text-sm font-medium">Funding</legend>
        <div className="space-y-2">
          {FUNDING_CHOICES.map((choice) => (
            <label key={choice.value} className="flex items-start gap-2">
              <input
                type="radio"
                name="fundingMode"
                value={choice.value}
                checked={fundingMode === choice.value}
                onChange={() => chooseFunding(choice.value)}
                className="mt-1"
              />
              <span>
                <span className="font-medium">{choice.label}</span>
                <span className="block text-muted-foreground">{choice.hint}</span>
              </span>
            </label>
          ))}
        </div>
        {fundingMode !== "none" && (
          <div className="space-y-2 pt-2">
            <Label htmlFor="fundedAmount">
              {fundingMode === "deposit" ? "Deposit (IP)" : "Amount paid (IP)"}
            </Label>
            <Input
              id="fundedAmount"
              name="fundedAmount"
              inputMode="decimal"
              value={fundedAmount}
              placeholder={suggested || "0"}
              onChange={(event) => setFundedAmount(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {fundingMode === "deposit"
                ? `At least 10% of the budget${suggested ? ` — ${suggested} IP` : ""}.`
                : "Must equal the total budget."}
            </p>
          </div>
        )}
      </fieldset>

      <fieldset className="space-y-2" data-tour="request-data-shape">
        <legend className="text-sm font-medium">Data shape</legend>
        <p className="text-muted-foreground">
          The object you want back, field by field.
        </p>
        <div className="space-y-2">
          {fields.map((field, index) => (
            <div key={field.id} className="flex items-center gap-2">
              <Input
                aria-label={`Field ${index + 1} name`}
                placeholder="transcript"
                value={field.name}
                onChange={(event) =>
                  setFields((current) =>
                    current.map((row) =>
                      row.id === field.id ? { ...row, name: event.target.value } : row,
                    ),
                  )
                }
              />
              <select
                aria-label={`Field ${index + 1} type`}
                className="h-9 rounded-md border bg-transparent px-2 text-sm"
                value={field.type}
                onChange={(event) =>
                  setFields((current) =>
                    current.map((row) =>
                      row.id === field.id ? { ...row, type: event.target.value } : row,
                    ),
                  )
                }
              >
                {FIELD_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  setFields((current) =>
                    current.length === 1
                      ? current
                      : current.filter((row) => row.id !== field.id),
                  )
                }
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() =>
            setFields((current) => [
              ...current,
              { id: `field-${current.length + 1}-${Date.now()}`, name: "", type: "string" },
            ])
          }
        >
          Add field
        </Button>
        <input type="hidden" name="dataShape" value={dataShape} />
      </fieldset>

      <div className="space-y-2" data-tour="request-deadline">
        <Label htmlFor="deadline">Deadline (optional)</Label>
        <Input
          id="deadline"
          type="datetime-local"
          value={deadlineLocal}
          onChange={(event) => {
            const local = event.target.value;
            setDeadlineLocal(local);
            const parsed = new Date(local);
            setDeadlineIso(local && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : "");
          }}
        />
        <input type="hidden" name="deadline" value={deadlineIso} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Brief</Label>
        <Textarea
          id="notes"
          name="notes"
          rows={4}
          maxLength={2000}
          placeholder="What you need, quality bar, what gets accepted…"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>

      <div className="space-y-2" data-tour="request-instructions">
        <Label htmlFor="specialInstructions">Special instructions</Label>
        <Textarea
          id="specialInstructions"
          name="specialInstructions"
          rows={3}
          maxLength={2000}
          placeholder="Delivery format, naming, anything a creator must do differently…"
          value={instructions}
          onChange={(event) => setInstructions(event.target.value)}
        />
      </div>

      <label className="flex items-center gap-2">
        <Checkbox name="kycRequired" />
        Only accept KYC-verified creators
      </label>

      {state.error && <p className="text-destructive">{state.error}</p>}

      <Button type="submit" disabled={pending}>
        {pending ? "Posting…" : "Post request"}
      </Button>
    </form>
  );
}
