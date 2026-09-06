import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  ArrowUpRight,
  BadgeCheck,
  Camera,
  Check,
  CircleStop,
  Clock3,
  Headphones,
  Info,
  Mic,
  MicOff,
  MonitorUp,
  Radio,
  ScanEye,
  ShieldCheck,
  Sparkles,
  Volume2,
  X,
} from 'lucide-react'
import { createRealtimeTransport } from './lib/realtime'

type CallStage = 'idle' | 'connecting' | 'presenting' | 'questions' | 'finished'
type ScreenState = 'waiting' | 'sharing' | 'blocked'
type FeedKind = 'assistant' | 'system' | 'user'

type FeedItem = {
  id: string
  kind: FeedKind
  text: string
  time: string
}

type Snapshot = {
  id: number
  label: string
  image: string
}

const initialFeed: FeedItem[] = [
  {
    id: 'welcome',
    kind: 'assistant',
    text: 'Привет. Я посмотрю на ход защиты и в конце дам спокойный, конкретный разбор.',
    time: 'до начала',
  },
  {
    id: 'rules',
    kind: 'system',
    text: 'После старта открой Figma в соседнем окне. Ничего дополнительно нажимать не нужно.',
    time: 'сценарий',
  },
]

const stageCopy: Record<CallStage, { label: string; description: string }> = {
  idle: { label: 'Готов к созвону', description: 'Стартуем, когда ты будешь готов' },
  connecting: { label: 'Подключаюсь', description: 'Проверяю микрофон и экран' },
  presenting: { label: 'Слушаю защиту', description: 'Говори в своём темпе' },
  questions: { label: 'Блок вопросов', description: 'Возвращаемся к важным решениям' },
  finished: { label: 'Созвон завершён', description: 'Разбор уже собран' },
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0')
  const remainder = (seconds % 60).toString().padStart(2, '0')
  return `${minutes}:${remainder}`
}

function timeLabel() {
  return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(new Date())
}

function IconLabel({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <span className="icon-label">
      <Icon size={14} strokeWidth={1.8} />
      {children}
    </span>
  )
}

function App() {
  const [stage, setStage] = useState<CallStage>('idle')
  const [screenState, setScreenState] = useState<ScreenState>('waiting')
  const [micEnabled, setMicEnabled] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [feed, setFeed] = useState<FeedItem[]>(initialFeed)
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [notice, setNotice] = useState('')
  const [showFeedback, setShowFeedback] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const screenStreamRef = useRef<MediaStream | null>(null)
  const audioStreamRef = useRef<MediaStream | null>(null)
  const captureTimerRef = useRef<number | null>(null)
  const pitchTimerRef = useRef<number | null>(null)
  const questionTimerRef = useRef<number | null>(null)
  const startedAtRef = useRef<number | null>(null)
  const snapshotIdRef = useRef(0)
  const transportRef = useRef(createRealtimeTransport())

  const currentStage = stageCopy[stage]
  const isLive = stage !== 'idle' && stage !== 'finished'

  const pushFeed = useCallback((kind: FeedKind, text: string) => {
    setFeed((items) => [
      ...items,
      { id: `${kind}-${Date.now()}`, kind, text, time: timeLabel() },
    ])
  }, [])

  const stopMedia = useCallback(() => {
    screenStreamRef.current?.getTracks().forEach((track) => track.stop())
    audioStreamRef.current?.getTracks().forEach((track) => track.stop())
    screenStreamRef.current = null
    audioStreamRef.current = null
    if (captureTimerRef.current) window.clearInterval(captureTimerRef.current)
    if (pitchTimerRef.current) window.clearTimeout(pitchTimerRef.current)
    if (questionTimerRef.current) window.clearTimeout(questionTimerRef.current)
    captureTimerRef.current = null
    pitchTimerRef.current = null
    questionTimerRef.current = null
  }, [])

  const captureSnapshot = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.readyState < 2 || !video.videoWidth) return

    canvas.width = 960
    canvas.height = Math.round((video.videoHeight / video.videoWidth) * canvas.width)
    const context = canvas.getContext('2d')
    if (!context) return
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    const image = canvas.toDataURL('image/jpeg', 0.7)
    snapshotIdRef.current += 1
    setSnapshots((items) => [
      ...items,
      { id: snapshotIdRef.current, label: `Кадр ${String(snapshotIdRef.current).padStart(2, '0')}`, image },
    ].slice(-3))
  }, [])

  const startScreenCapture = useCallback(async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setScreenState('blocked')
      setNotice('В этом браузере нет доступа к захвату экрана. Созвон продолжится без визуального слоя.')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 5 },
        audio: false,
      })
      screenStreamRef.current = stream
      setScreenState('sharing')
      pushFeed('system', 'Экран подключён. Я буду брать редкие кадры, а не записывать видео целиком.')
      const [track] = stream.getVideoTracks()
      if (track) {
        track.addEventListener('ended', () => {
          if (stage !== 'finished') {
            setScreenState('waiting')
            setNotice('Шаринг экрана остановлен. Если это случайно, запусти созвон заново.')
          }
        })
      }
    } catch {
      setScreenState('blocked')
      setNotice('Шаринг экрана пропущен. Защита всё равно продолжится в аудиорежиме.')
      pushFeed('system', 'Экран не подключён — продолжаем только с голосом.')
    }
  }, [pushFeed, stage])

  const startMicrophone = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      audioStreamRef.current = stream
      setMicEnabled(true)
    } catch {
      setMicEnabled(false)
      setNotice('Микрофон не подключён. Разреши доступ к нему, чтобы тренироваться голосом.')
      pushFeed('system', 'Микрофон не подключён — можно продолжить просмотром прототипа.')
    }
  }, [pushFeed])

  const toggleMicrophone = useCallback(() => {
    const nextValue = !micEnabled
    audioStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = nextValue
    })
    setMicEnabled(nextValue)
  }, [micEnabled])

  const startCall = useCallback(async () => {
    if (stage !== 'idle') return
    setNotice('')
    setStage('connecting')
    startedAtRef.current = Date.now()
    // Ask for browser permissions directly from the button gesture. The real
    // transport can connect in parallel once this media handshake starts.
    const screenPromise = startScreenCapture()
    const microphonePromise = startMicrophone()
    await transportRef.current.connect()
    await Promise.all([screenPromise, microphonePromise])
    setStage('presenting')
    pushFeed('assistant', 'Отлично, начинаем. Переходи в Figma и рассказывай, как ты пришёл к своему решению.')
    pitchTimerRef.current = window.setTimeout(() => {
      setStage('questions')
      pushFeed('assistant', 'Кажется, основную часть ты показал. Давай теперь разберём несколько решений подробнее.')
      questionTimerRef.current = window.setTimeout(() => {
        pushFeed('assistant', 'Почему ты выбрал именно этот сценарий для первого экрана? Что было главным критерием?')
      }, 1800)
    }, 12000)
  }, [pushFeed, startMicrophone, startScreenCapture, stage])

  const endCall = useCallback(() => {
    if (!isLive) return
    transportRef.current.disconnect()
    stopMedia()
    setStage('finished')
    setMicEnabled(false)
    setElapsed(startedAtRef.current ? Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000)) : elapsed)
    pushFeed('system', 'Созвон завершён. Результаты защиты готовы справа.')
    window.setTimeout(() => setShowFeedback(true), 350)
  }, [elapsed, isLive, pushFeed, stopMedia])

  useEffect(() => {
    if (!isLive) return
    const timer = window.setInterval(() => {
      if (startedAtRef.current) setElapsed(Math.round((Date.now() - startedAtRef.current) / 1000))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [isLive])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.srcObject = screenStreamRef.current
    if (screenStreamRef.current) {
      video.play().catch(() => undefined)
      window.setTimeout(captureSnapshot, 1000)
      captureTimerRef.current = window.setInterval(captureSnapshot, 5000)
    }
    return () => {
      if (captureTimerRef.current) window.clearInterval(captureTimerRef.current)
      captureTimerRef.current = null
    }
  }, [captureSnapshot, screenState])

  useEffect(() => () => stopMedia(), [stopMedia])

  const insightCount = useMemo(() => Math.max(2, Math.min(5, snapshots.length + 2)), [snapshots.length])

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark"><span /></div>
          <div>
            <div className="brand-name">proof<span>.</span></div>
            <div className="brand-caption">defense studio / 01</div>
          </div>
        </div>
        <div className="topbar-center"><span className="status-dot" /> {currentStage.label}</div>
        <div className="topbar-meta">
          <span className="mock-badge"><Sparkles size={13} /> mock realtime</span>
          <span className="session-time"><Clock3 size={14} /> {formatTime(elapsed)}</span>
        </div>
      </header>

      <main className={`workspace workspace--${stage}`}>
        <aside className="mentor-panel panel">
          <div className="panel-kicker"><span>mentor / visual designer</span><span className="kicker-index">01</span></div>
          <div className="mentor-avatar-wrap">
            <div className={`mentor-avatar ${isLive ? 'mentor-avatar--live' : ''}`}>
              <div className="avatar-core"><span>p</span></div>
              {isLive && <span className="avatar-ring avatar-ring--one" />}
              {isLive && <span className="avatar-ring avatar-ring--two" />}
            </div>
            <div className="voice-state">
              <span className="voice-state-dot" />
              <span>{isLive ? 'голосовой канал активен' : 'канал готов'}</span>
            </div>
          </div>
          <div className="mentor-copy">
            <p className="eyebrow">AI mentor</p>
            <h1>Защити<br /><em>своё решение.</em></h1>
            <p className="mentor-description">Я слушаю ход мысли, смотрю на экраны и задаю вопросы как нанимающий дизайнер.</p>
          </div>
          <div className="session-steps">
            <div className={`session-step ${stage !== 'idle' ? 'is-done' : 'is-active'}`}><span>{stage !== 'idle' ? <Check size={12} /> : '01'}</span><div><b>Созвон</b><small>живой голос</small></div></div>
            <div className={`session-step ${stage === 'questions' ? 'is-active' : stage === 'finished' ? 'is-done' : ''}`}><span>{stage === 'finished' ? <Check size={12} /> : '02'}</span><div><b>Разбор</b><small>вопросы по решениям</small></div></div>
            <div className={`session-step ${stage === 'finished' ? 'is-active' : ''}`}><span>03</span><div><b>Фидбэк</b><small>точки роста</small></div></div>
          </div>
          <div className="mentor-footer"><ShieldCheck size={14} /><span>Сессия приватна и не записывает видео целиком</span></div>
        </aside>

        <section className="stage-panel panel">
          <div className="stage-toolbar">
            <div><p className="eyebrow">screen relay</p><h2>Твой экран</h2></div>
            <div className={`relay-status relay-status--${screenState}`}>
              <span className="relay-status-dot" />
              {screenState === 'sharing' ? 'экран виден' : screenState === 'blocked' ? 'только голос' : 'ждём экран'}
            </div>
          </div>
          <div className="screen-frame">
            <div className="screen-frame-top"><span className="window-pill"><span /> figma / test task</span><span className="frame-note"><ScanEye size={13} /> кадр раз в ~5 сек</span></div>
            <div className="screen-preview">
              <video ref={videoRef} muted playsInline />
              {screenState !== 'sharing' && (
                <div className="screen-empty">
                  <div className="empty-orbit"><MonitorUp size={27} strokeWidth={1.2} /><span /></div>
                  <h3>{stage === 'idle' ? 'Экран подключится после старта' : 'Визуальный слой не подключён'}</h3>
                  <p>{stage === 'idle' ? 'После приветствия просто открой Figma и начинай говорить.' : 'Созвон продолжится — рассказывай решение голосом.'}</p>
                </div>
              )}
              {screenState === 'sharing' && <div className="screen-live-pill"><span className="live-dot" /> LIVE / screen</div>}
            </div>
            <div className="screen-frame-bottom"><span><Radio size={13} /> {currentStage.description}</span><span>{snapshots.length ? `${snapshots.length} кадра в памяти` : 'кадров пока нет'}</span></div>
          </div>
          <div className="observation-strip">
            <div className="observation-heading"><IconLabel icon={Camera}>Последние наблюдения</IconLabel><span>непрерывное видео не хранится</span></div>
            {snapshots.length === 0 ? (
              <div className="snapshot-placeholder"><span className="placeholder-line" /><span className="placeholder-line placeholder-line--short" /><span className="placeholder-tag">появятся во время защиты</span></div>
            ) : (
              <div className="snapshot-list">{snapshots.map((snapshot) => <div className="snapshot-card" key={snapshot.id}><img src={snapshot.image} alt={snapshot.label} /><span>{snapshot.label}</span></div>)}</div>
            )}
          </div>
          {notice && <div className="notice"><Info size={15} /><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Закрыть уведомление"><X size={14} /></button></div>}
        </section>

        <aside className="transcript-panel panel">
          <div className="transcript-head"><div><p className="eyebrow">live notes</p><h2>Ход защиты</h2></div><div className="transcript-pulse"><span /><span /><span /></div></div>
          <div className="transcript-feed">
            {feed.map((item) => (
              <article className={`feed-item feed-item--${item.kind}`} key={item.id}>
                <div className="feed-meta"><span>{item.kind === 'assistant' ? 'proof / AI' : item.kind === 'user' ? 'ты' : 'система'}</span><time>{item.time}</time></div>
                <p>{item.text}</p>
              </article>
            ))}
            {isLive && <div className="listening-line"><span className="listening-bars"><i /><i /><i /><i /></span> слушаю тебя</div>}
          </div>
          <div className="transcript-bottom">
            <div className="privacy-note"><BadgeCheck size={15} /><span>Здесь появятся ключевые мысли<br />и вопросы после защиты</span></div>
            <div className="audio-controls">
              <button className={`icon-button ${micEnabled ? 'is-active' : ''}`} title={micEnabled ? 'Микрофон включён' : 'Микрофон выключен'} aria-label={micEnabled ? 'Выключить микрофон' : 'Включить микрофон'} onClick={toggleMicrophone}>{micEnabled ? <Mic size={16} /> : <MicOff size={16} />}</button>
              <span>{micEnabled ? 'микрофон включён' : 'микрофон выключен'}</span>
            </div>
          </div>
        </aside>
      </main>

      <footer className="controlbar">
        <div className="control-hint"><span className="hint-key">esc</span><span>{isLive ? 'Всё идёт автоматически' : stage === 'finished' ? 'Спасибо за защиту' : 'Одна кнопка — и можно начинать'}</span></div>
        <div className="control-actions">
          {stage === 'idle' && <button className="start-button" onClick={startCall}><span className="start-button-icon"><Headphones size={17} /></span><span>Начать созвон</span><ArrowUpRight size={16} /></button>}
          {isLive && <button className="end-button" onClick={endCall}><CircleStop size={16} /><span>Завершить созвон</span></button>}
          {stage === 'finished' && <button className="report-button" onClick={() => setShowFeedback(true)}><Sparkles size={16} /><span>Открыть фидбэк</span></button>}
        </div>
        <div className="control-meta"><span><Volume2 size={14} /> speech-to-speech</span><span className="divider" /><span>v0.1 / defense only</span></div>
      </footer>

      {showFeedback && (
        <div className="feedback-backdrop" onClick={() => setShowFeedback(false)}>
          <section className="feedback-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="feedback-sheet-top"><div><p className="eyebrow">session review / 01</p><h2>Защита разобрана.</h2></div><button className="close-button" onClick={() => setShowFeedback(false)} aria-label="Закрыть фидбэк"><X size={18} /></button></div>
            <p className="feedback-lede">У тебя получилось держать нить рассказа. Ниже — первый черновик обратной связи, собранный из хода созвона и кадров экрана.</p>
            <div className="feedback-stats"><div><strong>8.4</strong><span>ясность истории</span></div><div><strong>7.8</strong><span>аргументация</span></div><div><strong>{insightCount}</strong><span>точки для роста</span></div></div>
            <div className="feedback-grid"><div className="feedback-card feedback-card--accent"><div className="feedback-card-label"><Sparkles size={14} /> сильная сторона</div><h3>Ты объясняешь через контекст, а не только через экраны.</h3><p>Это помогает слушателю понять, почему решение появилось именно таким.</p></div><div className="feedback-card"><div className="feedback-card-label"><Info size={14} /> попробовать в следующий раз</div><h3>Раньше назвать критерии выбора.</h3><p>До показа финального UI зафиксируй 1–2 ограничения, которые вели решение.</p></div></div>
            <div className="feedback-footer"><span><ScanEye size={15} /> {snapshots.length || 0} визуальных наблюдений</span><span><Activity size={15} /> mock report — подключим AI-разбор после ключа</span></div>
          </section>
        </div>
      )}
      <canvas ref={canvasRef} className="capture-canvas" aria-hidden="true" />
    </div>
  )
}

export default App
