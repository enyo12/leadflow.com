"use client";

import { Loader2, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { COMPANY_SIZES, type CompanySize, type SearchCriteria } from "@/types";

export type SearchFormErrors = Partial<Record<keyof SearchCriteria, string>>;

interface SearchFormProps {
  value: SearchCriteria;
  onChange: (next: SearchCriteria) => void;
  /** The Server Action wired into `useActionState`, bound to the form. */
  action: (formData: FormData) => void;
  /** Client-side guard. Return false to block submission. */
  onSubmit: () => boolean;
  loading: boolean;
  errors: SearchFormErrors;
}

export function SearchForm({
  value,
  onChange,
  action,
  onSubmit,
  loading,
  errors,
}: SearchFormProps) {
  function update<K extends keyof SearchCriteria>(
    key: K,
    next: SearchCriteria[K],
  ) {
    onChange({ ...value, [key]: next });
  }

  return (
    <Card>
      <CardContent>
        <form
          action={action}
          onSubmit={(event) => {
            if (!onSubmit()) event.preventDefault();
          }}
          noValidate
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="industry">Industry</Label>
              <Input
                id="industry"
                name="industry"
                placeholder="e.g. Software"
                value={value.industry}
                onChange={(event) => update("industry", event.target.value)}
                aria-invalid={Boolean(errors.industry)}
                aria-describedby={errors.industry ? "industry-error" : undefined}
                disabled={loading}
              />
              {errors.industry ? (
                <p id="industry-error" className="text-xs text-destructive">
                  {errors.industry}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                name="location"
                placeholder="e.g. United States"
                value={value.location}
                onChange={(event) => update("location", event.target.value)}
                aria-invalid={Boolean(errors.location)}
                aria-describedby={errors.location ? "location-error" : undefined}
                disabled={loading}
              />
              {errors.location ? (
                <p id="location-error" className="text-xs text-destructive">
                  {errors.location}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="company-size">Company size</Label>
              <Select
                id="company-size"
                name="companySize"
                value={value.companySize}
                onChange={(event) =>
                  update("companySize", event.target.value as CompanySize)
                }
                disabled={loading}
              >
                {COMPANY_SIZES.map((size) => (
                  <option key={size.value} value={size.value}>
                    {size.label} employees
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex items-end">
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Search className="size-4" aria-hidden="true" />
                )}
                {loading ? "Searching…" : "Find Leads"}
              </Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
