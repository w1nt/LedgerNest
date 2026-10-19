import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ExperienceContext } from "./ExperienceContext";
import type { Experience } from "./ExperienceContext";
function initial(): Experience {
  try {
    const value = JSON.parse(
      localStorage.getItem("ledgernest-experience") || "{}",
    );
    return {
      motion: value.motion === "reduce" ? "reduce" : "system",
      density: value.density === "compact" ? "compact" : "comfortable",
    };
  } catch {
    return { motion: "system", density: "comfortable" };
  }
}
export default function ExperienceProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [experience, setExperience] = useState(initial);
  useEffect(() => {
    document.documentElement.dataset.motion = experience.motion;
    document.documentElement.dataset.density = experience.density;
    try {
      localStorage.setItem("ledgernest-experience", JSON.stringify(experience));
    } catch {
      /* Preferences remain usable in memory. */
    }
  }, [experience]);
  return (
    <ExperienceContext.Provider
      value={{
        experience,
        update: (value) =>
          setExperience((current) => ({ ...current, ...value })),
      }}
    >
      {children}
    </ExperienceContext.Provider>
  );
}
