"use client";
// The crew's optional features. Only the creator can change them; everyone else sees what's on.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { post } from "@/app/lib/post";
import FeatureToggles from "@/app/components/FeatureToggles";
import type { Features } from "@/lib/features";

export default function CrewSettings({
  crewId,
  features,
  canEdit,
}: {
  crewId: string;
  features: Features;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(features);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const changed = JSON.stringify(value) !== JSON.stringify(features);

  async function save() {
    setMessage("");
    setSaving(true);
    const res = await post(`/api/crews/${crewId}/features`, value);
    setSaving(false);
    if (!res.ok) return setMessage(res.error);
    setMessage("Saved ✓");
    router.refresh();
  }

  return (
    <section className="sticker bg-white p-4">
      <h2 className="text-xl font-bold">✨ Extras</h2>
      <p className="mb-3 text-sm">
        {canEdit ? "Turn the extra games on or off for the whole crew." : "Only the person who made the crew can change these."}
      </p>
      <FeatureToggles value={value} onChange={canEdit ? setValue : undefined} disabled={!canEdit} />
      {canEdit && (
        <button onClick={save} disabled={!changed || saving} className="btn mt-4 w-full bg-sun px-4 py-3 text-lg disabled:opacity-40">
          {saving ? "Saving…" : "Save"}
        </button>
      )}
      {message && <p className="mt-2 text-center font-semibold">{message}</p>}
    </section>
  );
}
