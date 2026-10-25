import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { CATEGORY_LABELS, categoriesFor } from "@/lib/vehicle-categories";

type Defaults = {
  name?: string;
  type?: string;
  plate?: string;
  description?: string | null;
  hourlyRate?: number;
  dailyRate?: number;
  weekendRate?: number | null;
  locationId?: string | null;
  year?: number | null;
  engineCc?: number | null;
  powerHp?: number | null;
  seats?: number | null;
  licenseCategory?: string | null;
  category?: string | null;
};

const ron = (bani?: number | null) => (bani == null ? "" : String(bani / 100));
const num = (n?: number | null) => (n == null ? "" : String(n));

// The fields of the "new vehicle" and "edit vehicle" forms (provider and admin). Prices are typed in RON; the server
// stores them in bani and validates everything again.
export function VehicleFormFields({ mode, locations, defaults = {} }: { mode: "create" | "edit"; locations: { id: string; name: string; city: string; county: string }[]; defaults?: Defaults }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Name" htmlFor="vf-name" className="sm:col-span-2" hint="Brand and model, e.g. Yamaha Grizzly 700."><Input id="vf-name" name="name" defaultValue={defaults.name} required minLength={3} maxLength={80} /></Field>
      {mode === "create" ? (
        <>
          <Field label="Type" htmlFor="vf-type"><Select id="vf-type" name="type" defaultValue={defaults.type ?? "ATV"}><option value="ATV">ATV / quad</option><option value="MOTORCYCLE">Motorcycle</option><option value="SCOOTER">Scooter</option></Select></Field>
          <Field label="Plate number" htmlFor="vf-plate" hint="Cannot be changed later."><Input id="vf-plate" name="plate" defaultValue={defaults.plate} required minLength={4} maxLength={15} className="uppercase" /></Field>
        </>
      ) : null}
      <Field label="Pick-up location" htmlFor="vf-location" className="sm:col-span-2">
        <Select id="vf-location" name="locationId" defaultValue={defaults.locationId ?? ""} required>
          <option value="" disabled>Choose a location…</option>
          {locations.map((l) => <option key={l.id} value={l.id}>{l.county} · {l.name} ({l.city})</option>)}
        </Select>
      </Field>
      <Field label="Price per hour (RON)" htmlFor="vf-hourly"><Input id="vf-hourly" name="hourlyRon" type="number" min="1" max="100000" step="1" defaultValue={ron(defaults.hourlyRate)} required /></Field>
      <Field label="Price per day (RON)" htmlFor="vf-daily" hint="A rental of 24 hours or more is charged per started day."><Input id="vf-daily" name="dailyRon" type="number" min="1" max="100000" step="1" defaultValue={ron(defaults.dailyRate)} required /></Field>
      <Field label="Weekend flat rate (RON, optional)" htmlFor="vf-weekend" hint="Saturday 00:00 to Monday 00:00. Used when it is cheaper than the daily rate."><Input id="vf-weekend" name="weekendRon" type="number" min="1" max="100000" step="1" defaultValue={ron(defaults.weekendRate)} /></Field>
      <Field label="Year" htmlFor="vf-year"><Input id="vf-year" name="year" type="number" min="1990" max="2100" defaultValue={num(defaults.year)} /></Field>
      <Field label="Engine (cc)" htmlFor="vf-cc"><Input id="vf-cc" name="engineCc" type="number" min="20" max="5000" defaultValue={num(defaults.engineCc)} /></Field>
      <Field label="Power (hp)" htmlFor="vf-hp"><Input id="vf-hp" name="powerHp" type="number" min="1" max="500" defaultValue={num(defaults.powerHp)} /></Field>
      <Field label="Seats" htmlFor="vf-seats"><Input id="vf-seats" name="seats" type="number" min="1" max="8" defaultValue={num(defaults.seats)} /></Field>
      <Field label="Category" htmlFor="vf-category" hint="Helps visitors find it: shown on the card and in the catalog filter. It must match the type.">
        <Select id="vf-category" name="category" defaultValue={defaults.category ?? ""}>
          <option value="">No category</option>
          {mode === "create" ? (
            <>
              <optgroup label="Motorcycles">{categoriesFor("MOTORCYCLE").map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}</optgroup>
              <optgroup label="ATVs">{categoriesFor("ATV").map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}</optgroup>
            </>
          ) : (
            categoriesFor(defaults.type === "ATV" || defaults.type === "SCOOTER" ? defaults.type : "MOTORCYCLE").map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)
          )}
        </Select>
      </Field>
      <Field label="Licence category needed" htmlFor="vf-licence">
        <Select id="vf-licence" name="licenseCategory" defaultValue={defaults.licenseCategory ?? ""}>
          <option value="">Not specified</option><option value="AM">AM</option><option value="A1">A1</option><option value="A2">A2</option><option value="A">A</option><option value="B">B</option>
        </Select>
      </Field>
      <Field label="Description" htmlFor="vf-description" className="sm:col-span-2" hint="Shown to customers. Up to 1000 characters."><Textarea id="vf-description" name="description" maxLength={1000} defaultValue={defaults.description ?? ""} /></Field>
    </div>
  );
}
