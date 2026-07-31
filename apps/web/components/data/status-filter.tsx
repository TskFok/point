export type StatusFilterOption = {
  label: string;
  value: string;
};

export function StatusFilter({
  label = "状态",
  onChange,
  options,
  value,
}: {
  label?: string;
  onChange: (value: string) => void;
  options: StatusFilterOption[];
  value: string;
}) {
  return (
    <label className="admin-field">
      <span>{label}</span>
      <select onChange={(event) => onChange(event.target.value)} value={value}>
        <option value="">全部状态</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
