"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormField } from "./form-field";

export type Option = { value: string; label: string };

/** A labelled select that submits its value under `name`. */
export function SelectField({
  label,
  name,
  defaultValue,
  options,
  error,
  hint,
  onValueChange,
  className,
}: {
  label: string;
  name: string;
  defaultValue: string;
  options: Option[];
  error?: string;
  hint?: string;
  onValueChange?: (value: string) => void;
  className?: string;
}) {
  return (
    <FormField label={label} error={error} hint={hint} className={className}>
      {(control) => (
        <Select
          name={name}
          defaultValue={defaultValue}
          onValueChange={onValueChange}
        >
          <SelectTrigger {...control} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </FormField>
  );
}

export const optionsFrom = (
  values: readonly string[],
  labels: Record<string, string>,
): Option[] =>
  values.map((value) => ({ value, label: labels[value] ?? value }));
