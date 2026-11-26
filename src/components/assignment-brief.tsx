import { useEffect, useRef, useState } from "react"
import { ImagePlus, Loader2, X } from "lucide-react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { api, errorMessage } from "@/lib/api"
import { MAX_BRIEF_IMAGES, type Brief, type BriefImage } from "@/lib/methodology"
import { BRIEF_IMAGE_ACCEPT, prepareBriefImage, validateBriefFile } from "@/lib/brief-images"

type Props = {
  provider?: "openai" | "deepseek"; text: string; images: BriefImage[]; brief: Brief | null; disabled: boolean; canSave: boolean
  onText: (text: string) => void; onImages: (images: BriefImage[]) => void
  onContinue: () => void; onPrepared: (brief: Brief | null) => void; onBusyChange: (busy: boolean) => void
}

export function AssignmentBrief({ provider, text, images, brief, disabled, canSave, onText, onImages, onPrepared, onContinue, onBusyChange }: Props) {
  const [busy, setBusy] = useState(false)
  const [loadingImages, setLoadingImages] = useState(false)
  const [error, setError] = useState("")
  const [dragging, setDragging] = useState(false)
  const [previewImage, setPreviewImage] = useState<BriefImage | null>(null)
  const previewTrigger = useRef<HTMLButtonElement | null>(null)
  const generation = useRef(0)
  const fileInput = useRef<HTMLInputElement>(null)
  const locked = disabled || busy || loadingImages
  const valid = text.trim().length >= 40 || images.length > 0
  useEffect(() => { onBusyChange(busy || loadingImages) }, [busy, loadingImages, onBusyChange])
  useEffect(() => () => { generation.current++; onBusyChange(false) }, [onBusyChange])

  const addImages = async (files: File[]) => {
    if (locked || !files.length) return
    setError(""); setDragging(false)
    if (files.length + images.length > MAX_BRIEF_IMAGES) { setError("Можно добавить до трёх фото. Удали лишнее или выбери меньше файлов."); return }
    const current = ++generation.current
    setLoadingImages(true)
    try {
      files.forEach(validateBriefFile)
      const prepared: BriefImage[] = []
      for (const file of files) prepared.push(await prepareBriefImage(file))
      if (generation.current === current) { onImages([...images, ...prepared]); onPrepared(null) }
    } catch (cause) { if (generation.current === current) setError(errorMessage(cause)) }
    finally { if (generation.current === current) setLoadingImages(false) }
  }
  const save = async () => {
    if (locked || !valid || !canSave || brief) return
    const current = ++generation.current
    setBusy(true); setError("")
    try { const prepared = await api.prepareBrief(text, images); if (generation.current === current) { onPrepared(prepared); onContinue() } }
    catch (cause) { if (generation.current === current) setError(errorMessage(cause)) }
    finally { if (generation.current === current) setBusy(false) }
  }

  return <form id="assignment-form" aria-label="Материалы задания" className="space-y-5" onSubmit={event => { event.preventDefault(); void save() }}>
    <div>
      <div className="flex items-center justify-between gap-3"><label htmlFor="assignment-text" className="text-sm font-medium">Текст задания</label><span className="text-xs tabular-nums text-muted-foreground">{text.length.toLocaleString("ru")} / 16 000</span></div>
      <Textarea id="assignment-text" rows={6} maxLength={16000} value={text} disabled={locked} onChange={e => { onText(e.target.value); onPrepared(null); setError("") }} placeholder="Вставь задание работодателя: что нужно сделать, какой результат ожидается и какие есть ограничения." aria-describedby="assignment-hint" className="mt-2 block w-full min-h-32 rounded-xl border-0 bg-secondary/70 p-4 leading-(--copy-leading) focus-visible:outline-2 focus-visible:outline-ring" />
      <p id="assignment-hint" className="mt-2 text-xs leading-(--copy-leading) text-muted-foreground">От 40 символов. Если прикрепишь фото, текст необязателен.</p>
    </div>
    <div className={`rounded-2xl p-4 transition-colors sm:p-5 ${dragging ? "bg-secondary" : "bg-secondary/60"}`}
      onDragOver={event => { event.preventDefault(); if (!locked) setDragging(true) }}
      onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false) }}
      onDrop={event => { event.preventDefault(); setDragging(false); void addImages(Array.from(event.dataTransfer.files)) }}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-sm font-medium">Фото или скриншоты</p><p className="mt-1 text-xs leading-(--copy-leading) text-muted-foreground">До 3 фото · JPG, PNG, WebP · до 10 МБ каждое</p></div>
        <Button type="button" variant="tertiary" className="h-10 w-fit shrink-0 px-4" disabled={locked || images.length >= MAX_BRIEF_IMAGES} onClick={() => fileInput.current?.click()}>{loadingImages ? <Loader2 className="animate-spin" /> : <ImagePlus />}{loadingImages ? "Готовим фото…" : "Прикрепить фото"}</Button>
        <input ref={fileInput} type="file" accept={BRIEF_IMAGE_ACCEPT} multiple tabIndex={-1} className="hidden" aria-label="Фото задания" disabled={locked} onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ""; void addImages(files) }} />
      </div>
      {images.length > 0 && <ul className="mt-4 space-y-2" aria-label="Прикреплённые фото">{images.map((image, index) => <li key={image.id} className="flex items-center gap-3 rounded-xl bg-card p-2">
        <button type="button" className="shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-brand" aria-label={`Посмотреть фото ${index + 1}`} onClick={event => { previewTrigger.current = event.currentTarget; setPreviewImage(image) }}><img src={image.dataUrl} alt={`Фото задания ${index + 1}`} className="size-14 rounded-full object-cover" /></button>
        <div className="min-w-0 flex-1"><p className="truncate text-sm" title={image.name}>{image.name}</p><p className="mt-1 text-xs text-muted-foreground">Фото {index + 1}</p></div>
        <Button type="button" variant="ghost" size="icon" className="size-10 shrink-0 text-muted-foreground" aria-label={`Удалить фото ${index + 1}`} disabled={locked} onClick={() => { onImages(images.filter(item => item.id !== image.id)); onPrepared(null); setError("") }}><X /></Button>
      </li>)}</ul>}
    </div>
    <Dialog open={Boolean(previewImage)} onOpenChange={open => { if (!open) setPreviewImage(null) }}>
      <DialogContent size="xl" aria-describedby={undefined} onCloseAutoFocus={event => { event.preventDefault(); previewTrigger.current?.focus() }}>
        <DialogTitle className="truncate pr-8">{previewImage?.name}</DialogTitle>
        {previewImage && <img src={previewImage.dataUrl} alt="Прикреплённое задание в полном размере" className="mx-auto mt-3 max-h-[70svh] max-w-full object-contain" />}
      </DialogContent>
    </Dialog>
    <p className="text-xs leading-(--copy-leading) text-muted-foreground">Денис получит задание как контекст для разговора. Текст с фото распознаёт {provider === "deepseek" ? "DeepSeek" : provider === "openai" ? "OpenAI" : "модель"}. Черновик хранится 24 часа, после звонка задание сохраняется вместе с защитой. Сами фото остаются во вкладке и передаются только для распознавания.</p>
    {error && <div role="alert" className="rounded-xl bg-neutral-50 p-4 text-sm leading-(--copy-leading) text-neutral-950"><p>{error}</p><p className="mt-1 text-xs text-neutral-900/80">Материалы остались здесь. Можно повторить действие.</p></div>}
    {brief && <Button type="button" variant="ghost" className="mt-3 h-auto p-0 text-xs text-muted-foreground" disabled={locked} onClick={async () => {
        const current = ++generation.current; setBusy(true)
        try { await api.deleteBrief(); if (generation.current === current) { onPrepared(null); onText(""); onImages([]); setError("") } }
        catch (cause) { if (generation.current === current) setError(errorMessage(cause)) }
        finally { if (generation.current === current) setBusy(false) }
      }}>Удалить задание</Button>}
  </form>
}
