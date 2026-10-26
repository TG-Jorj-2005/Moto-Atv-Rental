"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { cn } from "@/lib/utils";

// A file field for vehicle photos with a preview of every chosen file before anything is sent. The checks here (name,
// type, size, count, and the first bytes of the file) are only a convenience: the server checks everything again
// and never trusts the browser. Rejected files are left out of the field, so they are not sent.

const EXTENSIONS = ["jpg", "jpeg", "png", "webp"];

type Picked = { file: File; url: string };

// The first bytes of a JPEG, PNG or WebP file: the same signatures as the server's.
async function looksLikeImage(file: File): Promise<"jpg" | "png" | "webp" | null> {
  const b = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "png";
  if (b.length >= 12 && String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return "webp";
  return null;
}

export function PhotoPicker({ name = "photos", id = "photos", max, maxBytes, required = false, className }: { name?: string; id?: string; max: number; maxBytes: number; required?: boolean; className?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<Picked[]>([]);
  const [messages, setMessages] = useState<string[]>([]);
  const urls = useRef<string[]>([]);

  // Free the preview addresses when the form goes away.
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  function sync(list: Picked[]) {
    setPicked(list);
    if (!input.current) return;
    const transfer = new DataTransfer();
    list.forEach((p) => transfer.items.add(p.file));
    input.current.files = transfer.files;
  }

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(e.target.files ?? []);
    const next = [...picked];
    const problems: string[] = [];
    for (const file of chosen) {
      // Choosing a file that is already selected changes nothing (some browsers list the earlier files again).
      if (next.some((p) => p.file.name === file.name && p.file.size === file.size && p.file.lastModified === file.lastModified)) continue;
      const ext = file.name.slice(file.name.lastIndexOf(".") + 1).toLowerCase();
      const kind = await looksLikeImage(file);
      if (!file.name.includes(".") || !EXTENSIONS.includes(ext)) problems.push(`${file.name}: only .jpg, .png and .webp files are accepted.`);
      else if (file.size === 0) problems.push(`${file.name}: the file is empty.`);
      else if (file.size > maxBytes) problems.push(`${file.name}: larger than ${Math.round(maxBytes / 1024 / 1024)} MB.`);
      else if (!kind || (ext === "jpeg" ? "jpg" : ext) !== kind) problems.push(`${file.name}: this is not a real ${ext.toUpperCase()} image.`);
      else if (next.length >= max) problems.push(`${file.name}: at most ${max} photos.`);
      else {
        const url = URL.createObjectURL(file);
        urls.current.push(url);
        next.push({ file, url });
      }
    }
    setMessages(problems);
    sync(next);
  }

  function remove(index: number) {
    const gone = picked[index];
    if (gone) URL.revokeObjectURL(gone.url);
    setMessages([]);
    sync(picked.filter((_, i) => i !== index));
  }

  return (
    <div className={cn("space-y-3", className)}>
      <input ref={input} id={id} name={name} type="file" accept="image/jpeg,image/png,image/webp" multiple required={required && picked.length === 0} onChange={onChange} aria-describedby={`${id}-status`}
        className="block w-full cursor-pointer rounded-lg border border-line-strong bg-surface text-sm text-fg-soft file:mr-3 file:cursor-pointer file:rounded-l-lg file:border-0 file:bg-surface-3 file:px-4 file:py-2.5 file:font-semibold file:text-fg" />
      <div id={`${id}-status`} aria-live="polite" className="space-y-1">
        {picked.length > 0 && <p className="text-sm text-muted">{picked.length} of {max} photos selected. They are sent when you save; the first one is the cover.</p>}
        {messages.map((m) => <p key={m} role="alert" className="text-sm text-danger">{m}</p>)}
      </div>
      {picked.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Photos to upload">
          {picked.map((p, i) => (
            <li key={p.url} className="relative overflow-hidden rounded-lg border border-line bg-surface-3">
              <img src={p.url} alt={`Preview of ${p.file.name}`} className="aspect-[4/3] w-full object-cover" />
              {i === 0 && <span className="absolute left-1.5 top-1.5 rounded-full bg-fg px-2 py-0.5 text-[11px] font-semibold text-canvas">Cover</span>}
              <button type="button" onClick={() => remove(i)} aria-label={`Remove ${p.file.name}`} className="absolute right-1.5 top-1.5 grid size-7 cursor-pointer place-items-center rounded-full bg-canvas/85 text-fg ring-1 ring-line-strong hover:bg-danger-solid"><X aria-hidden className="size-4" /></button>
              <p className="truncate px-2 py-1 text-xs text-muted">{p.file.name}</p>
            </li>
          ))}
        </ul>
      )}
      {picked.length === 0 && <p className="flex items-center gap-1.5 text-xs text-subtle"><ImagePlus aria-hidden className="size-3.5" /> JPEG, PNG or WebP, up to {Math.round(maxBytes / 1024 / 1024)} MB each, at most {max} photos.</p>}
    </div>
  );
}
