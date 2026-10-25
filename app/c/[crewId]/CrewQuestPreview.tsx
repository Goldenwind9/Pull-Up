"use client";

import { useEffect, useState } from "react";
import Blobs from "@/app/components/Blobs";
import BouncyTitle from "@/app/components/BouncyTitle";
import ComingSoon from "@/app/components/ComingSoon";

// Sample content for designing the screen before quest generation is connected.
const SAMPLE_QUEST = {
  title: "Campus Photo Quest",
  location: "UT Austin",
  meetingPoint: "Meet at the campus pin shown on the map below.",
  lat: 30.2849,
  lng: -97.7341,
  instructions: [
    "Gather your crew at the meeting point.",
    "Take a short walk together and find an interesting backdrop.",
    "Choose a movie scene and recreate its pose as a group.",
    "Take a photo with everyone in the frame to prove you pulled up!",
  ],
  proofHint: "Your photo should show your crew posing together at your chosen spot.",
};

export default function CrewQuestPreview() {
  // State is a value React remembers. Changing it updates the screen.
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Start the timer when this component appears in the browser.
    const timer = window.setTimeout(() => setIsLoading(false), 5000);

    // Cancel the timer if the user leaves before it finishes.
    return () => window.clearTimeout(timer);
  }, []);

  if (isLoading) {
    return <ComingSoon title="Crew home" emoji="🗺️" />;
  }

  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${SAMPLE_QUEST.lat},${SAMPLE_QUEST.lng}`;

  return (
    <main className="relative mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 py-12">
      <Blobs />

      <header className="animate-bounce-in text-center">
        <span className="sticker inline-block -rotate-3 bg-sky px-3 py-1 text-sm font-semibold">
          Sample quest preview
        </span>
        <BouncyTitle text="Your quest" className="mt-4 text-5xl" />
        <p className="mt-3 text-lg">Grab your crew. Here&apos;s the plan!</p>
      </header>

      <section className="sticker animate-bounce-in bg-white p-5" aria-labelledby="quest-title">
        <h1 id="quest-title" className="text-3xl font-bold">{SAMPLE_QUEST.title}</h1>
        <div className="mt-5 rounded-2xl border-2 border-ink bg-cream p-4">
          <h2 className="text-xl font-semibold">Location: {SAMPLE_QUEST.location}</h2>
          <p className="mt-2">{SAMPLE_QUEST.meetingPoint}</p>
          <a className="btn mt-4 inline-block bg-sky px-4 py-2" href={mapsUrl} target="_blank" rel="noopener noreferrer">
            Open in Google Maps
          </a>
        </div>

        <!-- todo: test code-->
        <p>{getCrewHome().then((crewHome) => {return crewHome})}</p>

        <h2 className="mt-6 text-xl font-bold">Your instructions</h2>
        <ol className="mt-3 list-decimal space-y-3 pl-6">
          {SAMPLE_QUEST.instructions.map((instruction) => (
            <li key={instruction} className="pl-1">{instruction}</li>
          ))}
        </ol>
      </section>

      <section className="sticker animate-bounce-in bg-sun p-5" aria-labelledby="proof-title">
        <h2 id="proof-title" className="text-xl font-bold">Prove you pulled up</h2>
        <p className="mt-2">{SAMPLE_QUEST.proofHint}</p>
        <p className="mt-3 text-sm">Photo uploads will be available when this screen is connected to the backend.</p>
      </section>
    </main>
  );
}
