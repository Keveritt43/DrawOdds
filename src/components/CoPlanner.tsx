"use client";
import { useEffect, useState } from "react";
type Hunt = {
  id: string;
  name: string;
  slug: string | null;
  species: string;
  code: string | null;
  odds: number | null;
  success: number | null;
  second: boolean;
};
export function CoPlanner({
  hunts,
  signedIn,
}: {
  hunts: Hunt[];
  signedIn: boolean;
}) {
  const [codes, setCodes] = useState<string[]>([]),
    [loaded, setLoaded] = useState(false),
    [species, setSpecies] = useState("DEER"),
    [code, setCode] = useState(""),
    [status, setStatus] = useState("");
  useEffect(() => {
    let active = true;
    async function load() {
      if (signedIn) {
        const r = await fetch("/api/co-plan");
        if (r.ok) {
          const b = await r.json();
          if (active) setCodes(Array.isArray(b.codes) ? b.codes : []);
        }
      } else {
        try {
          const x = JSON.parse(
            localStorage.getItem("drawodds.co.plan") ?? "[]",
          );
          if (active && Array.isArray(x)) setCodes(x);
        } catch {}
      }
      if (active) setLoaded(true);
    }
    void load();
    return () => {
      active = false;
    };
  }, [signedIn]);
  async function save(next: string[]) {
    setCodes(next);
    if (signedIn) {
      try {
        const r = await fetch("/api/co-plan", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ codes: next }),
        });
        setStatus(
          r.ok ? "Saved to account" : "Could not save; retry your change",
        );
      } catch {
        setStatus("Could not save; retry your change");
      }
    } else {
      try {
        localStorage.setItem("drawodds.co.plan", JSON.stringify(next));
        setStatus("Saved in this browser");
      } catch {
        setStatus("Browser storage unavailable");
      }
    }
  }
  return (
    <>
      <p>
        {signedIn
          ? "Your choices are saved to your account."
          : "Your choices stay in this browser; sign in to use them across devices."}{" "}
        Colorado plans are kept separately from Idaho plans.
      </p>
      <label>
        Species{" "}
        <select
          value={species}
          onChange={(e) => {
            setSpecies(e.target.value);
            setCode("");
          }}
        >
          <option value="DEER">Deer</option>
          <option value="ELK">Elk</option>
        </select>
      </label>{" "}
      <label>
        Hunt{" "}
        <select
          aria-label="Colorado planner hunt"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        >
          <option value="">Choose a hunt</option>
          {hunts
            .filter((h) => h.species === species)
            .map((h) => (
              <option key={h.id} value={h.id}>
                {h.code} · {h.name}
              </option>
            ))}
        </select>
      </label>{" "}
      <button
        disabled={
          !loaded ||
          !code ||
          codes.includes(code) ||
          codes.filter(
            (id) => hunts.find((h) => h.id === id)?.species === species,
          ).length >= 4
        }
        onClick={() => void save([...codes, code])}
      >
        Add choice
      </button>
      {["DEER", "ELK"].map((sp) => (
        <section key={sp}>
          <h2>{sp === "DEER" ? "Deer" : "Elk"} Choices</h2>
          <ol>
            {codes
              .filter((id) => hunts.find((h) => h.id === id)?.species === sp)
              .map((id, i) => {
                const h = hunts.find((h) => h.id === id)!;
                return (
                  <li key={id}>
                    <a href={"/hunts/" + h.slug}>
                      {h.code} · {h.name}
                    </a>{" "}
                    ·{" "}
                    {i === 0
                      ? h.odds === null
                        ? "No first-choice estimate"
                        : Math.round(h.odds * 100) +
                          "% projected first-choice odds"
                      : h.second
                        ? "Reached later choices in the observed draw"
                        : "Later-choice probability not estimated"}{" "}
                    <button
                      onClick={() => void save(codes.filter((c) => c !== id))}
                    >
                      Remove
                    </button>
                    {i > 0 && (
                      <button
                        onClick={() => {
                          const next = codes.slice(),
                            prior = codes
                              .map((x, j) =>
                                j < codes.indexOf(id) &&
                                hunts.find((h) => h.id === x)?.species === sp
                                  ? j
                                  : -1,
                              )
                              .reduce((a, b) => Math.max(a, b), -1),
                            at = codes.indexOf(id);
                          [next[prior], next[at]] = [next[at], next[prior]];
                          void save(next);
                        }}
                      >
                        Move up
                      </button>
                    )}
                  </li>
                );
              })}
          </ol>
        </section>
      ))}
      <p role="status">{status}</p>
      <p className="small muted">
        Only first-choice odds are modeled. Do not combine these probabilities
        as independent chances. Drawing a primary first choice uses points;
        later-choice and general-license rules differ. Confirm all choices,
        eligibility and deadlines in current CPW instructions.
      </p>
      <a href="https://cpw.state.co.us/activities/hunting/big-game/primary-draw">
        CPW application information
      </a>
    </>
  );
}
