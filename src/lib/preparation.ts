export const preparationSteps = ["Задание", "Подключение", "Подготовка"] as const
export type PreparationStep = 0 | 1 | 2
export function canOpenPreparationStep(step: number, hasBrief: boolean, devicesReady: boolean) {
  return step === 0 || hasBrief && (step === 1 || step === 2 && devicesReady)
}
