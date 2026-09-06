import { ArrowRight, Eye, MessageCircleMore, Mic2, MonitorUp } from "lucide-react"
import { motion } from "motion/react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Logo } from "@/components/logo"

type LandingPageProps = {
  onStart: () => void
}

const benefits = [
  { icon: Mic2, title: "Живой разговор", copy: "Без пауз на ввод текста" },
  { icon: Eye, title: "Видит твой экран", copy: "Понимает, что ты показываешь" },
  { icon: MessageCircleMore, title: "Задаёт вопросы", copy: "Как на настоящей защите" },
]

export function LandingPage({ onStart }: LandingPageProps) {
  return (
    <motion.div
      className="min-h-svh bg-background"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22 }}
    >
      <header className="mx-auto flex h-20 w-full max-w-[1280px] items-center justify-between px-5 sm:px-8">
        <Logo />
        <Button variant="outline" size="lg" className="h-11 rounded-full px-5" onClick={onStart}>
          Попробовать
        </Button>
      </header>

      <main id="main-content">
        <section className="mx-auto flex max-w-[1120px] flex-col items-center px-5 pb-20 pt-20 text-center sm:px-8 sm:pt-28 lg:pt-32">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          >
            <Badge variant="outline" className="h-7 rounded-full bg-card px-3 text-xs font-normal">
              AI-тренажёр для продуктовых дизайнеров
            </Badge>
          </motion.div>

          <motion.h1
            className="mt-7 max-w-[1000px] text-balance font-heading text-[clamp(3.25rem,8.2vw,7.15rem)] font-semibold leading-[0.9] tracking-[-0.072em]"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.06, duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
          >
            Защити тестовое до настоящего собеседования.
          </motion.h1>

          <motion.p
            className="mt-8 max-w-[620px] text-pretty text-base leading-7 text-muted-foreground sm:text-lg"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12, duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
          >
            Покажи макеты, расскажи ход решений и ответь на вопросы AI-интервьюера — как на обычном созвоне.
          </motion.p>

          <motion.div
            className="mt-8 flex flex-col items-center gap-3"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          >
            <Button size="lg" className="h-13 rounded-full px-7 text-base shadow-sm" onClick={onStart}>
              Начать защиту
              <ArrowRight data-icon="inline-end" className="size-4" />
            </Button>
            <span className="text-xs text-muted-foreground">Ничего загружать не нужно · 20–30 минут</span>
          </motion.div>
        </section>

        <section className="mx-auto max-w-[1040px] px-5 sm:px-8">
          <motion.div
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            <Card className="overflow-hidden rounded-[1.75rem] border-0 bg-zinc-950 p-3 shadow-[0_30px_90px_-48px_rgba(0,0,0,0.55)] ring-1 ring-black/10 sm:p-4">
              <div className="relative flex aspect-[16/9] min-h-[340px] flex-col overflow-hidden rounded-[1.2rem] bg-[#20211f] text-white">
                <div className="flex items-center justify-between px-5 py-4 text-xs text-white/60 sm:px-6">
                  <Logo inverted className="text-white" />
                  <span className="rounded-full bg-white/8 px-3 py-1.5">00:12</span>
                </div>
                <div className="flex flex-1 flex-col items-center justify-center px-6 pb-20">
                  <div className="grid size-24 place-items-center rounded-full bg-[#f0f0eb] font-heading text-3xl font-semibold text-zinc-950 ring-8 ring-white/5 sm:size-32 sm:text-4xl">
                    P
                  </div>
                  <p className="mt-5 font-medium">Proof mentor</p>
                  <p className="mt-1 text-sm text-white/45">Слушаю твою защиту</p>
                </div>
                <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/35 p-2 ring-1 ring-white/10 backdrop-blur-md">
                  <span className="grid size-10 place-items-center rounded-full bg-white/10"><Mic2 className="size-4" /></span>
                  <span className="grid size-10 place-items-center rounded-full bg-white/10"><MonitorUp className="size-4" /></span>
                  <span className="h-10 rounded-full bg-red-500 px-5 text-sm font-medium leading-10">Завершить</span>
                </div>
              </div>
            </Card>
          </motion.div>
        </section>

        <section className="mx-auto grid max-w-[1040px] gap-8 px-5 py-20 sm:grid-cols-3 sm:px-8 sm:py-24">
          {benefits.map(({ icon: Icon, title, copy }) => (
            <div key={title} className="flex items-start gap-4 border-t pt-5">
              <div className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary"><Icon className="size-4" /></div>
              <div><h2 className="font-heading text-base font-medium">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{copy}</p></div>
            </div>
          ))}
        </section>
      </main>

      <footer className="mx-auto flex max-w-[1280px] items-center justify-between border-t px-5 py-7 text-sm text-muted-foreground sm:px-8">
        <span>© 2026 Proof</span>
        <span>Тренажёр защиты тестового</span>
      </footer>
    </motion.div>
  )
}
