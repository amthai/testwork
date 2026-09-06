import { useCallback, useRef, useState } from "react"

export type DeviceStatus =
  | "idle"
  | "requesting"
  | "ready"
  | "denied"
  | "unsupported"
  | "ended"

function permissionMessage(kind: "microphone" | "screen", error: unknown) {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return kind === "microphone"
      ? "Доступ к микрофону не разрешён. Разреши его в настройках браузера и попробуй снова."
      : "Экран не выбран. Нажми «Выбрать экран» и укажи окно с Figma."
  }

  return kind === "microphone"
    ? "Не получилось подключить микрофон. Проверь, что он не занят другим приложением."
    : "Не получилось начать демонстрацию экрана. Попробуй выбрать окно ещё раз."
}

export function useMediaSession() {
  const [microphoneStatus, setMicrophoneStatus] = useState<DeviceStatus>("idle")
  const [screenStatus, setScreenStatus] = useState<DeviceStatus>("idle")
  const [microphoneError, setMicrophoneError] = useState("")
  const [screenError, setScreenError] = useState("")
  const [microphoneStream, setMicrophoneStream] = useState<MediaStream | null>(null)
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null)
  const [microphoneEnabled, setMicrophoneEnabled] = useState(false)

  const microphoneRef = useRef<MediaStream | null>(null)
  const screenRef = useRef<MediaStream | null>(null)

  const requestMicrophone = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicrophoneStatus("unsupported")
      setMicrophoneError("Этот браузер не поддерживает доступ к микрофону.")
      return false
    }

    setMicrophoneStatus("requesting")
    setMicrophoneError("")

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true,
        },
      })

      microphoneRef.current?.getTracks().forEach((track) => track.stop())
      microphoneRef.current = stream
      setMicrophoneStream(stream)
      setMicrophoneEnabled(true)
      setMicrophoneStatus("ready")

      const [track] = stream.getAudioTracks()
      if (track) {
        track.onended = () => {
          if (microphoneRef.current === stream) {
            microphoneRef.current = null
            setMicrophoneStream(null)
            setMicrophoneEnabled(false)
            setMicrophoneStatus("ended")
          }
        }
      }

      return true
    } catch (error) {
      setMicrophoneStatus("denied")
      setMicrophoneError(permissionMessage("microphone", error))
      return false
    }
  }, [])

  const requestScreen = useCallback(async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setScreenStatus("unsupported")
      setScreenError("Этот браузер не поддерживает демонстрацию экрана.")
      return false
    }

    setScreenStatus("requesting")
    setScreenError("")

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 5 },
        audio: false,
      })

      screenRef.current?.getTracks().forEach((track) => {
        track.onended = null
        track.stop()
      })
      screenRef.current = stream
      setScreenStream(stream)
      setScreenStatus("ready")

      const [track] = stream.getVideoTracks()
      if (track) {
        track.onended = () => {
          if (screenRef.current === stream) {
            screenRef.current = null
            setScreenStream(null)
            setScreenStatus("ended")
            setScreenError("Демонстрация экрана остановлена. Выбери экран снова, если это произошло случайно.")
          }
        }
      }

      return true
    } catch (error) {
      setScreenStatus("denied")
      setScreenError(permissionMessage("screen", error))
      return false
    }
  }, [])

  const toggleMicrophone = useCallback(() => {
    const nextValue = !microphoneEnabled
    microphoneRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = nextValue
    })
    setMicrophoneEnabled(nextValue)
  }, [microphoneEnabled])

  const stopScreen = useCallback(() => {
    screenRef.current?.getTracks().forEach((track) => {
      track.onended = null
      track.stop()
    })
    screenRef.current = null
    setScreenStream(null)
    setScreenStatus("ended")
    setScreenError("")
  }, [])

  const stopAll = useCallback(() => {
    microphoneRef.current?.getTracks().forEach((track) => {
      track.onended = null
      track.stop()
    })
    screenRef.current?.getTracks().forEach((track) => {
      track.onended = null
      track.stop()
    })
    microphoneRef.current = null
    screenRef.current = null
    setMicrophoneStream(null)
    setScreenStream(null)
    setMicrophoneEnabled(false)
    setMicrophoneStatus("idle")
    setScreenStatus("idle")
    setMicrophoneError("")
    setScreenError("")
  }, [])

  return {
    microphoneStatus,
    screenStatus,
    microphoneError,
    screenError,
    microphoneStream,
    screenStream,
    microphoneEnabled,
    requestMicrophone,
    requestScreen,
    toggleMicrophone,
    stopScreen,
    stopAll,
  }
}
