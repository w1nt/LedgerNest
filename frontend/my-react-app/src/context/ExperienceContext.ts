import { createContext, useContext } from "react";
export type MotionMode = "system" | "reduce";
export type Density = "comfortable" | "compact";
export interface Experience {
  motion: MotionMode;
  density: Density;
}
export const ExperienceContext = createContext<{
  experience: Experience;
  update: (value: Partial<Experience>) => void;
} | null>(null);
export function useExperience() {
  const value = useContext(ExperienceContext);
  if (!value) throw new Error("ExperienceProvider required.");
  return value;
}
