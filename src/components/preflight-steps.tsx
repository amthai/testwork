import { Check } from "lucide-react"
import { canOpenPreparationStep, preparationSteps, type PreparationStep } from "@/lib/preparation"

export function PreflightSteps({ current, hasBrief, devicesReady, disabled, onChange }: {
  current: PreparationStep; hasBrief: boolean; devicesReady: boolean; disabled: boolean; onChange: (step: PreparationStep) => void
}) {
  return <nav aria-label="Этапы подготовки" className="preflight-steps">
    <ol>{preparationSteps.map((label, index) => {
      const complete = current !== index && hasBrief && (index === 0 || index === 1 && devicesReady)
      return <li key={label}>
        <button type="button" aria-current={index === current ? "step" : undefined}
          disabled={disabled || !canOpenPreparationStep(index, hasBrief, devicesReady)}
          onClick={() => onChange(index as PreparationStep)}>
          <span className="prep-step-number">{index + 1}</span>
          <span>{label}</span>
          {complete && <Check size={13} aria-label="Готово" />}
        </button>
      </li>
    })}</ol>
  </nav>
}
