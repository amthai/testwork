import { exampleSession } from "./fixtures.js"
import type { DefenseSession } from "../src/lib/session.js"

export const evaluationCases: { id: string; expected: string; session: DefenseSession }[] = [
  { id: "honest-unknown", expected: "Признать конкретный пробел, не унижать, не выдумывать решение за пользователя.", session: { ...structuredClone(exampleSession), feedback: null } },
  { id: "vague-answer", expected: "Указать, что после двух уточнений нет конкретного следующего шага. Дать практический способ подготовить ответ.", session: { ...structuredClone(exampleSession), feedback: null,
    transcript: [...exampleSession.transcript.slice(0, 2), { id: "u2", role: "user", at: 60000, text: "Я ориентировался на удобство, современные практики и хороший пользовательский опыт." },
      { id: "a2", role: "assistant", at: 70000, text: "Какое конкретное действие сможет сделать пользователь, когда товара нет?" }, { id: "u3", role: "user", at: 80000, text: "Нужно сделать всё понятно и удобно." },
      { id: "a3", role: "assistant", at: 90000, text: "Представь, что лекарство закончилось. Как пользователь продолжит покупку?" }, { id: "u4", role: "user", at: 100000, text: "Я бы использовал лучшие UX-практики для такого случая." }],
    questions: [exampleSession.questions[0], { ...exampleSession.questions[0], id: "q2", followUp: 1, at: 70000, spokenEntryId: "a2" }, { ...exampleSession.questions[0], id: "q3", followUp: 2, at: 90000, spokenEntryId: "a3" }].map(q => ({ ...q, assessment: { status: "not_assessed", summary: "", evidenceIds: [] } })),
  } },
  { id: "strong-answer", expected: "Принять конкретное обоснование. Не критиковать отсутствие полного исследования за четыре часа или необязательных компонентов.", session: { ...structuredClone(exampleSession), feedback: null,
    transcript: [...exampleSession.transcript.slice(0, 2), { id: "u2", role: "user", at: 60000, text: "Если товара нет, показываем ближайшие аптеки с остатком. Введённые контактные данные сохраняются, меняется только точка получения. Это гипотеза: за четыре часа проверку с пользователями не проводил, поэтому не заявляю рост конверсии. На проверке дам задачу найти препарат при отсутствии в первой аптеке и посмотрю, смогут ли люди завершить заказ без помощи." }],
    questions: exampleSession.questions.map(q => ({ ...q, assessment: { status: "not_assessed", summary: "", evidenceIds: [] } })),
  } },
  { id: "defensible-tradeoff", expected: "Не считать больше шагов плохим UX автоматически. Разобрать компромисс, не навязывать одну структуру решения.", session: { ...structuredClone(exampleSession), feedback: null,
    transcript: [exampleSession.transcript[0], { id: "a1", role: "assistant", at: 50000, text: "Почему выбор аптеки и ввод контактов на разных шагах?" }, { id: "u2", role: "user", at: 60000, text: "На первом шаге человек сравнивает наличие и расстояние. На втором вводит только контакты. В варианте на одном экране сравнение аптек оказывалось ниже длинной формы, поэтому я разделил задачи. Недостаток — дополнительный переход; его приемлемость ещё нужно проверить, это не доказанный результат." }],
    questions: [{ ...exampleSession.questions[0], question: "Почему выбор аптеки и ввод контактов на разных шагах?", assessment: { status: "not_assessed", summary: "", evidenceIds: [] } }],
  } },
]
