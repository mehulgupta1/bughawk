// Per-project plain-text scratchpad. Value + onChange come from App (debounced
// persistence handled by the useProjectValue hook).
export default function NotesScratchpad({ value, onChange }) {
  return (
    <textarea
      className="scratchpad"
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Project notes — scope, creds, ideas, todo… (auto-saved)"
      spellCheck={false}
    />
  );
}
