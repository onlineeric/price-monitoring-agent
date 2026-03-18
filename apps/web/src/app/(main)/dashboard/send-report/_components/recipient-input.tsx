"use client";

import { Textarea } from "@/components/ui/textarea";

interface RecipientInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  errors?: string[];
}

export function RecipientInput({ value, onChange, disabled, errors }: RecipientInputProps) {
  return (
    <div className="space-y-2">
      <label htmlFor="manual-report-recipients" className="font-medium text-sm">
        Recipients
      </label>
      <Textarea
        id="manual-report-recipients"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder="one@example.com, two@example.com"
      />
      <p className="text-muted-foreground text-xs">
        Enter 1 to 3 comma-separated email addresses. Duplicate recipients are not allowed.
      </p>
      {errors && errors.length > 0 ? (
        <div className="space-y-1">
          {errors.map((error) => (
            <p key={error} className="text-destructive text-xs">
              {error}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
