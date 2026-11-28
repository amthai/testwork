import { LandingOpening } from "@/components/landing-opening"
import "./landing-page.css"

const benefits = [
  ["Потренируйся", "отвечать на вопросы"],
  ["Проверь понятен", "ли рассказ и презентация"],
  ["Узнай, что можно", "улучшить в твоей работе"],
]

export function LandingPage({ onStart }: { onStart: () => void }) {
  return <div className="landing-page">
    <main id="main-content">
      <LandingOpening onStart={onStart} />

      <section className="landing-benefits landing-column" aria-labelledby="landing-benefits-title">
        <h2 id="landing-benefits-title"><span>“Вслух” будет полезен дизайнерам</span> перед защитой тестового задания, встречей с коллегами или презентацией<br className="landing-desktop-break" /> заказчику.</h2>
        <ul>{benefits.map(([first, second]) => <li key={first}>
          <span>{first}<br />{second}</span>
        </li>)}</ul>
      </section>

      <p className="landing-script">Privet! Vidno moi ekran?</p>
    </main>
    <footer className="landing-footer">
      <p>«Вслух» работает на ИИ-технологии, У каждой своя задача:<br />GigaAM v3 распознаёт русскую, DeepSeek Flash является основным мозгом, Яндекс SpeechKit озвучивает реплики интервьюера.</p>
      <span>Контакты</span>
    </footer>
  </div>
}
