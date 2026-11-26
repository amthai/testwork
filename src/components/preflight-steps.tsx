import { Check, FileText, Headphones, Presentation } from "lucide-react"
import { canOpenPreparationStep, preparationSteps, type PreparationStep } from "@/lib/preparation"

const icons = [FileText, Headphones, Presentation]

export function PreflightSteps({ current, hasBrief, microphoneReady, disabled, onChange }: {
  current: PreparationStep; hasBrief: boolean; microphoneReady: boolean; disabled: boolean; onChange: (step: PreparationStep) => void
}) {
  return <nav aria-label="Этапы подготовки" className="preflight-steps">
    <ol>{preparationSteps.map((label, index) => {
      const complete = index < 2 && hasBrief && (index === 0 || microphoneReady)
      const Icon = complete && current !== index ? Check : icons[index]
      return <li key={label}>
        <button type="button" aria-current={index === current ? "step" : undefined}
          disabled={disabled || !canOpenPreparationStep(index, hasBrief, microphoneReady)}
          onClick={() => onChange(index as PreparationStep)}>
          <Icon size={17} aria-hidden="true" /><span>{label}</span>
          {complete && current !== index && <span className="sr-only">Готово</span>}
        </button>
      </li>
    })}</ol>
  </nav>
}
