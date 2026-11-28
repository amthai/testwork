import { LandingHandwriting } from "@/components/landing-handwriting"
import { LandingOpening } from "@/components/landing-opening"
import "./landing-page.css"

const benefits = [
  ["tabler-microphone", "Потренируйся", "отвечать на вопросы"],
  ["tabler-device-desktop", "Проверь понятен", "ли рассказ и презентация"],
  ["tabler-arrow-big-up-lines", "Узнай, что можно", "улучшить в твоей работе"],
]

export function LandingPage({ onStart }: { onStart: () => void }) {
  return <div className="landing-page">
    <main id="main-content">
      <LandingOpening onStart={onStart} />

      <section className="landing-benefits landing-column" aria-labelledby="landing-benefits-title">
        <h2 id="landing-benefits-title"><span>“Вслух” будет полезен дизайнерам</span> перед защитой тестового задания, встречей с коллегами или презентацией<br className="landing-desktop-break" /> заказчику.</h2>
        <ul>{benefits.map(([icon, first, second]) => <li key={first}>
          <img className="landing-benefit-icon" src={`/landing/${icon}.svg`} width={48} height={48} alt="" />
          <span>{first}<br />{second}</span>
        </li>)}</ul>
      </section>

      <LandingHandwriting />
    </main>
    <footer className="landing-footer">
      <p>«Вслух» работает на ИИ-технологии, У каждой своя задача:<br />GigaAM v3 распознаёт русскую, DeepSeek Flash является основным мозгом, Яндекс SpeechKit озвучивает реплики интервьюера.</p>
      <span>Контакты</span>
    </footer>
  </div>
}
