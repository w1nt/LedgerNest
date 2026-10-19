import { useId } from "react";
export default function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const id = useId();
  return (
    <div className="segmented-control" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          className={value === option.value ? "selected" : ""}
          aria-describedby={id}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
      <span className="sr-only" id={id}>
        {label}
      </span>
    </div>
  );
}
