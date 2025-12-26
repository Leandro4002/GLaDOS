import { useRef, useState, useEffect } from 'react'
import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition'
import './App.css'
import assert from 'assert-ts'

const App = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [canvasCtx, setCanvasCtx] = useState<CanvasRenderingContext2D>()
  const [audioCtx, setAudioCtx] = useState<AudioContext | null>(null)
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null)
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null)
  const [animFrameId, setAnimFrameId] = useState<number | null>(null)
  const [intervalId, setIntervalId] = useState<number | null>(null)
  const [volume, setVolume] = useState('0')
  const [pitch, setPitch] = useState('0')
  const dbg = useRef({
    show: true,
    showPoints: false,
    showVelocity: true,
  })
  const showDebugPoints = useRef(false)
  const showDebugVelocity = useRef(true)
  const mousePos = useRef<{ x: number, y: number }>({ x: 0, y: 0 })
  const lastTick = useRef(performance.now())
  const [isRecording, setIsRecording] = useState(false)
  const glados = useRef({
    audioStart: null as HTMLAudioElement | null,
    audioStop: null as HTMLAudioElement | null,
    poweredOn: false, powerFactor: 0.0, // 1 = full power, 0 = off
    powerFactorSpeed: 7.0,
    velocityX: 0, velocityY: 0,
    velocityDecay: 0.6,
    mouseForce: 1, idleMoveForce: 100,
    // positions for different body parts
    spinePosX: 0, spinePosY: 0,
    bodyPosX: 0, bodyPosY: 0,
    torsoPosX: 0, torsoPosY: 0,
    headPosX: 0, headPosY: 0,
    facePosX: 0, facePosY: 0,
    eyePosX: 0, eyePosY: 0,
    // offsets for different body parts
    spineOffsetX: 0, spineOffsetY: -150,
    bodyOffsetX: 0, bodyOffsetY: 30,
    torsoOffsetX: 0, torsoOffsetY: 30,
    headOffsetX: 0, headOffsetY: 20,
    faceOffsetX: -20, faceOffsetY: 10,
    eyeOffsetX: 0, eyeOffsetY: 0,
    eyeRedOffsetX: 14, eyeRedOffsetY: 14,
    // limits for different body parts
    spineLimitX: 350, spineLimitY: 50,
    bodyLimitX: 30, bodyLimitY: 30,
    torsoLimitX: 70, torsoLimitY: 10,
    headLimitX: 60, headLimitY: 65,
    faceLimitX: 23, faceLimitY: 30,
    eyeLimitX: 12, eyeLimitY: 40,
    velocityLimit: 100,
    // size of different body parts
    spineWidth: 120, spineHeight: 700,
    bodyWidth: 300, bodyHeight: 200,
    torsoWidth: 200, torsoHeight: 180,
    headWidth: 130, headHeight: 250,
    faceWidth: 67, faceHeight: 143,
    eyeRadius: 20, eyeRedRadius: 5,
    headAngle: 0, torsoAngle: 0, spineAngle: 0,
    eyesPosScalarX: 0.25, eyesPosScalarY: 0.7,
    headAngleLimit: 0.8, torsoAngleLimit: 0.4, spineAngleLimit: 0.2,
    headAngleScalar: 0.008, torsoAngleScalar: 0.005, spineAngleScalar: 0.0008,
    blinkSpeed: 0.1, blinkTime: 0.2, blinkDelay: 0,
    redBlinkTime: 0.1, redBlinkDelay: 0,
    blink_function: () => {},
    redBlink_function: () => {},
    noise_function: (() => {
      const perm = new Uint8Array(512)
      for (let i = 0; i < 256; i++) perm[i] = i
      for (let i = 255; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[perm[i], perm[j]] = [perm[j], perm[i]]
      }
      for (let i = 0; i < 256; i++) perm[256 + i] = perm[i]

      const fade = t => t * t * t * (t * (t * 6 - 15) + 10)
      const grad = (hash, x) => ((hash & 1) === 0 ? x : -x)

      return x => {
        const xi = Math.floor(x) & 255
        const xf = x - Math.floor(x)

        const g1 = grad(perm[xi], xf)
        const g2 = grad(perm[xi + 1], xf - 1)

        const u = fade(xf)

        return (g1 + u * (g2 - g1) + 1) / 2 // normalize 0..1
      }
    })(),
    blinkCooldownDuration: 3.0, blinkCooldownJitterDuration: 1.0,
    redBlinkCooldownDuration: 0.2, redBlinkCooldownJitterDuration: 5.0,
  })

  const { transcript, browserSupportsSpeechRecognition } = useSpeechRecognition()

  const lerpColor = (a: string, b: string, t: number) => {
    const ah = parseInt(a.replace('#',''), 16)
    const bh = parseInt(b.replace('#',''), 16)

    const ar = ah >> 16, ag = (ah >> 8) & 0xff, ab = ah & 0xff
    const br = bh >> 16, bg = (bh >> 8) & 0xff, bb = bh & 0xff

    const r = Math.round(ar + (br - ar) * t)
    const g = Math.round(ag + (bg - ag) * t)
    const b2 = Math.round(ab + (bb - ab) * t)

    return `#${((1 << 24) + (r << 16) + (g << 8) + b2).toString(16).slice(1)}`
  }

  const getAverageVolume = (dataArray: Uint8Array) => {
    let sum = 0
    for (let i = 0; i < dataArray.length; i++) {
      const val = (dataArray[i] - 128) / 128
      sum += val * val
    }
    return Math.sqrt(sum / dataArray.length)
  }

  const autoCorrelate = (buf: Uint8Array, sampleRate: number) => {
    let SIZE = buf.length
    let rms = 0
    for (let i = 0; i < SIZE; i++) {
      const val = (buf[i] - 128) / 128
      rms += val * val
    }
    rms = Math.sqrt(rms / SIZE)
    if (rms < 0.01) return 0

    let r1 = 0, r2 = SIZE - 1
    const thres = 0.2
    for (let i = 0; i < SIZE / 2; i++) {
      if (Math.abs(buf[i] - 128) > thres * 128) { r1 = i; break }
    }
    for (let i = 1; i < SIZE / 2; i++) {
      if (Math.abs(buf[SIZE - i] - 128) > thres * 128) { r2 = SIZE - i; break }
    }
    buf = buf.slice(r1, r2)
    SIZE = buf.length

    const c = new Array(SIZE).fill(0)
    for (let i = 0; i < SIZE; i++) {
      for (let j = 0; j < SIZE - i; j++) c[i] += (buf[j] - 128) * (buf[j + i] - 128)
    }
    let d = 0
    while (c[d] > c[d + 1]) d++
    let maxval = -1, maxpos = -1
    for (let i = d; i < SIZE; i++) {
      if (c[i] > maxval) { maxval = c[i]; maxpos = i }
    }
    const T0 = maxpos
    return sampleRate / T0
  }

  const loop = () => {
    const now = performance.now()
    const delta = (now - lastTick.current) / 1000
    lastTick.current = now

    if (delta > 1) return // skip large deltas

    const g = glados.current

    const randAngle = g.noise_function(now / 1000) * Math.PI * 2
    
    if (g.poweredOn) {
      // glados tries to go back to center
      g.velocityX += -g.spinePosX * g.mouseForce * delta
      g.velocityY += -g.spinePosY * g.mouseForce * delta

      // glados idle movements
      g.velocityX += Math.cos(randAngle) * delta * g.idleMoveForce
      g.velocityY += Math.sin(randAngle) * delta * g.idleMoveForce

      // glados talks
      // g.velocityX += Math.sin(now / 500) * delta * 50
      // g.velocityY += Math.sin(now / 100) * delta * 100
    }

    // apply velocity decay
    g.velocityX = g.velocityX * ( 1 - delta) + g.velocityX * g.velocityDecay * delta
    g.velocityY = g.velocityY * ( 1 - delta) + g.velocityY * g.velocityDecay * delta

    // limit velocity
    const velocity = Math.sqrt(g.velocityX * g.velocityX + g.velocityY * g.velocityY)
    if (velocity > g.velocityLimit) {
      g.velocityX = (g.velocityX / velocity) * g.velocityLimit
      g.velocityY = (g.velocityY / velocity) * g.velocityLimit
    }

    g.spinePosX += g.velocityX * delta
    g.spinePosY += g.velocityY * delta
    g.spinePosX = Math.max(-g.spineLimitX, Math.min(g.spineLimitX, g.spinePosX))
    g.spinePosY = Math.max(-g.spineLimitY, Math.min(g.spineLimitY, g.spinePosY))

    g.bodyPosX += g.velocityX * delta
    g.bodyPosY += g.velocityY * delta
    g.bodyPosX = Math.max(-g.bodyLimitX, Math.min(g.bodyLimitX, g.bodyPosX))
    g.bodyPosY = Math.max(-g.bodyLimitY, Math.min(g.bodyLimitY, g.bodyPosY))

    g.torsoPosX += g.velocityX * delta
    g.torsoPosY += g.velocityY * delta
    g.torsoPosX = Math.max(-g.torsoLimitX, Math.min(g.torsoLimitX, g.torsoPosX))
    g.torsoPosY = Math.max(-g.torsoLimitY, Math.min(g.torsoLimitY, g.torsoPosY))

    g.headPosX += g.velocityX * delta
    g.headPosY += g.velocityY * delta
    g.headPosX = Math.max(-g.headLimitX, Math.min(g.headLimitX, g.headPosX))
    g.headPosY = Math.max(-g.headLimitY, Math.min(g.headLimitY, g.headPosY))

    g.facePosX += g.velocityX * delta
    g.facePosY += g.velocityY * delta
    // This is not an error, is just to make the face of glados slightly offset to the left
    g.facePosX = Math.max(-g.faceLimitX - g.faceOffsetX, Math.min(g.faceLimitX, g.facePosX))
    g.facePosY = Math.max(-g.faceLimitY, Math.min(g.faceLimitY, g.facePosY))

    g.eyePosX = g.velocityX * g.eyesPosScalarX
    g.eyePosY = g.velocityY * g.eyesPosScalarY
    g.eyePosX = Math.max(-g.eyeLimitX, Math.min(g.eyeLimitX, g.eyePosX))
    g.eyePosY = Math.max(-g.eyeLimitY, Math.min(g.eyeLimitY, g.eyePosY))

    g.headAngle = g.velocityX * g.headAngleScalar
    g.torsoAngle = g.velocityX * g.torsoAngleScalar
    g.spineAngle = g.velocityX * g.spineAngleScalar
    g.headAngle = Math.max(-g.headAngleLimit, Math.min(g.headAngleLimit, g.headAngle))
    g.torsoAngle = Math.max(-g.torsoAngleLimit, Math.min(g.torsoAngleLimit, g.torsoAngle))

    // Handle blink timers
    if (g.blinkDelay > 0) {
      g.blinkDelay -= delta
      if (g.blinkDelay < 0) g.blinkDelay = 0
    }
    if (g.redBlinkDelay > 0) {
      g.redBlinkDelay -= delta
      if (g.redBlinkDelay < 0) g.redBlinkDelay = 0
    }
    if (g.poweredOn) {
      g.powerFactor += (1 - g.powerFactor) * delta * g.powerFactorSpeed
      if (g.powerFactor > 0.999) g.powerFactor = 1
    } else {
      g.powerFactor -= g.powerFactor * delta * g.powerFactorSpeed
      if (g.powerFactor < 0.001) g.powerFactor = 0
    }
  }

  const draw = () => {
    assert(canvasCtx !== undefined)
    // assert(analyser !== null, 'Analyser node is null')
    // const bufferLength = analyser.fftSize
    // const dataArray = new Uint8Array(bufferLength)
    // analyser.getByteTimeDomainData(dataArray)

    const g = glados.current
    const cx = canvasCtx.canvas.width / 2
    const cy = canvasCtx.canvas.height / 2

    canvasCtx.clearRect(0, 0, canvasCtx.canvas.width, canvasCtx.canvas.height);
    let x = 0, y = 0
    const spineX = cx + g.spineOffsetX + g.spinePosX
    const spineY = cy + g.spineOffsetY + g.spinePosY
    const bodyX = spineX + g.bodyOffsetX + g.bodyPosX
    const bodyY = spineY + g.bodyOffsetY + g.bodyPosY
    const cosTorsoAngle = Math.cos(g.torsoAngle)
    const sinTorsoAngle = Math.sin(g.torsoAngle)
    x = g.torsoOffsetX + g.torsoPosX
    y = g.torsoOffsetY + g.torsoPosY
    const torsoX = bodyX + cosTorsoAngle * x - y * sinTorsoAngle
    const torsoY = bodyY + sinTorsoAngle * x + y * cosTorsoAngle
    const headX = torsoX + g.headOffsetX + g.headPosX
    const headY = torsoY + g.headOffsetY + g.headPosY
    const cosHeadAngle = Math.cos(g.headAngle)
    const sinHeadAngle = Math.sin(g.headAngle)
    x = g.faceOffsetX + g.facePosX
    y = g.faceOffsetY + g.facePosY
    const faceX = headX + cosHeadAngle * x - y * sinHeadAngle
    const faceY = headY + sinHeadAngle * x + y * cosHeadAngle
    x = g.eyeOffsetX + g.eyePosX
    y = g.eyeOffsetY + g.eyePosY
    const eyeX = faceX + cosHeadAngle * x - y * sinHeadAngle
    const eyeY = faceY + sinHeadAngle * x + y * cosHeadAngle

    // The body has the angle of the torso, because it follows it's movements
    // back (attached to body)
    canvasCtx.drawRoundedRect(bodyX - g.bodyWidth / 3, bodyY - g.bodyHeight, g.bodyWidth / 1.5, g.bodyHeight * 1.5, g.torsoAngle / 2, 150, '#545454', 'black', null, 'linear', 50)

    // spine
    canvasCtx.drawRoundedRect(spineX - g.spineWidth / 2, spineY - g.spineHeight, g.spineWidth, g.spineHeight, g.spineAngle, 20, 'black', '#1c1c1c', null, 'linear', 0, true)

    // body
    canvasCtx.drawRoundedRect(bodyX - g.bodyWidth / 2, bodyY - g.bodyHeight / 2, g.bodyWidth, g.bodyHeight, g.torsoAngle / 2, 150, '#a4a4a4', '#222', null, 'linear', 50)

    // torso
    canvasCtx.drawRoundedRect(torsoX - g.torsoWidth / 2, torsoY - g.torsoHeight / 2, g.torsoWidth, g.torsoHeight, g.torsoAngle, 100, '#c4c4c4', '#333', null, 'linear', 50)

    // head
    canvasCtx.drawRoundedRect(headX - g.headWidth / 2, headY - g.headHeight / 2, g.headWidth, g.headHeight, g.headAngle, 30, '#e4e4e4', '#444444')

    // face
    canvasCtx.drawRoundedRect(faceX - g.faceWidth / 2, faceY - g.faceHeight / 2, g.faceWidth, g.faceHeight, g.headAngle, 40, 'black', '#333', null, 'radial')

    // eye
    const curve = (x: number) => (2 * x - 1) ** 2;
    const eyeScalar = curve((g.blinkTime - g.blinkDelay) / g.blinkTime)
    canvasCtx.drawLight(eyeX, eyeY, g.eyeRadius, lerpColor('#555555', '#ecdd5e', g.powerFactor), g.powerFactor * eyeScalar * 0.6 + (1 - g.powerFactor) * 0.2);
    x = g.eyeRedOffsetX
    y = g.eyeRedOffsetY
    const eyeRedX = eyeX + cosHeadAngle * x - y * sinHeadAngle
    const eyeRedY = eyeY + sinHeadAngle * x + y * cosHeadAngle
    if (g.redBlinkDelay == 0 && g.powerFactor == 1) canvasCtx.drawLight(eyeRedX, eyeRedY, g.eyeRedRadius, '#d63d51', 0);

    // Debug draw point for each body parts centers
    if (dbg.current.showPoints) {
      canvasCtx.font = '24px monospace'
      
      canvasCtx.drawCircle(spineX, spineY, 5, 'purple')
      canvasCtx.fillStyle = 'purple'
      canvasCtx.fillText('spine', spineX + 10, spineY)
      
      canvasCtx.drawCircle(bodyX, bodyY, 5, 'magenta')
      canvasCtx.fillStyle = 'magenta'
      canvasCtx.fillText('body', bodyX + 10, bodyY)
      
      canvasCtx.drawCircle(torsoX, torsoY, 5, 'red')
      canvasCtx.fillStyle = 'red'
      canvasCtx.fillText('torso', torsoX + 10, torsoY)
      
      canvasCtx.drawCircle(headX, headY, 5, 'yellow')
      canvasCtx.fillStyle = 'yellow'
      canvasCtx.fillText('head', headX + 10, headY)
      
      canvasCtx.drawCircle(faceX, faceY, 5, 'lime')
      canvasCtx.fillStyle = 'lime'
      canvasCtx.fillText('face', faceX + 10, faceY)
      
      canvasCtx.drawCircle(eyeX, eyeY, 5, 'cyan')
      canvasCtx.fillStyle = 'cyan'
      canvasCtx.fillText('eye', eyeX + 10, eyeY)
    }

    if (dbg.current.showVelocity) {
      // Draw velocity vector
      canvasCtx.strokeStyle = 'white'
      canvasCtx.lineWidth = 2
      canvasCtx.beginPath()
      canvasCtx.moveTo(spineX, spineY)
      canvasCtx.lineTo(spineX + g.velocityX * 10, spineY + g.velocityY * 10)
      canvasCtx.stroke()
    }

    // const sliceWidth = canvasCtx.canvas.width / bufferLength
    // let x = 0
    // for (let i = 0; i < bufferLength; i++) {
    //   const v = dataArray[i] / 128.0
    //   const y = (v * canvasCtx.canvas.height) / 2
    //   if (i === 0) {
    //     canvasCtx.moveTo(x, y)
    //   } else {
    //     canvasCtx.lineTo(x, y)
    //   }
    //   x += sliceWidth
    // }

    // const vol = getAverageVolume(dataArray)
    // const detectedPitch = autoCorrelate(dataArray, audioCtx!.sampleRate)
    // setVolume(vol.toFixed(3))
    // setPitch(detectedPitch ? detectedPitch.toFixed(1) : '0')

    setAnimFrameId(requestAnimationFrame(() => draw()))
  }

  const buttonClick = async () => {
    const g = glados.current
    if (g.poweredOn) {
      // Stop
      g.audioStop?.play()
      g.poweredOn = false
      stopListening()
      if (mediaStream) {
        mediaStream.getTracks().forEach(t => t.stop())
        setMediaStream(null)
      }
      if (audioCtx) {
        audioCtx.close()
        setAudioCtx(null)
      }
      setAnalyser(null)
    } else {
      // Start
      g.audioStart?.play()
      g.poweredOn = true
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const context = new AudioContext()
      const analyzer = context.createAnalyser()
      analyzer.fftSize = 2048
      const srcNode = context.createMediaStreamSource(stream)
      srcNode.connect(analyzer)
      setAudioCtx(context)
      setAnalyser(analyzer)
      setMediaStream(stream)
    }
  }

  const startListening = () => {
    SpeechRecognition.startListening({ continuous: true, language: 'en-US' })
  }

  const stopListening = () => {
    SpeechRecognition.stopListening()
  }

  const resizeCanvas = () => {
    assert(canvasCtx !== undefined)

    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const width = window.innerWidth;
    const height = window.innerHeight;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';

    canvasCtx.scale(dpr, dpr);
  };

  useEffect(() => {
    const ctx = canvasRef.current!.getContext('2d');
    if (ctx != null) setCanvasCtx(ctx);
    return () => {
      if (mediaStream) {
        mediaStream.getTracks().forEach(t => t.stop())
      }
    }
  }, [mediaStream])

  useEffect(() => {
    if (!canvasCtx) return
    draw()
    setIntervalId(window.setInterval(loop, 30))
    resizeCanvas();
    const g = glados.current
    g.audioStart = new Audio(`/glados_start.ogg`)
    g.audioStop = new Audio(`/glados_stop.ogg`)
    g.blink_function = () => {
      if (g.powerFactor == 1) g.blinkDelay = g.blinkTime
      window.setTimeout(g.blink_function, 1000 * (g.blinkCooldownDuration + g.blinkCooldownJitterDuration * Math.random()))
    }
    g.redBlink_function = () => {
      g.redBlinkDelay = g.redBlinkTime
      window.setTimeout(g.redBlink_function, 1000 * (g.redBlinkCooldownDuration + g.redBlinkCooldownJitterDuration * Math.random()))
    }
    g.blink_function()
    g.redBlink_function()

    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'g') {
        dbg.current.show = !dbg.current.show
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', resizeCanvas);
    canvasRef.current!.addEventListener('mousemove', (e: MouseEvent) => {
      const rect = canvasRef.current!.getBoundingClientRect()
      const scaleX = canvasRef.current!.width / rect.width
      const scaleY = canvasRef.current!.height / rect.height
      mousePos.current!.x = (e.clientX - rect.left) * scaleX
      mousePos.current!.y = (e.clientY - rect.top) * scaleY
    })
    return () => {
      window.removeEventListener('resize', resizeCanvas)
      window.removeEventListener('keydown', onKey)
      if (intervalId !== null) {
        clearInterval(intervalId);
      }
    };
  }, [canvasCtx])

  if (!browserSupportsSpeechRecognition) {
    return <p>Your browser does not support speech recognition.</p>
  }

  const g = glados.current

  return (
    <>
      <canvas ref={canvasRef} className='absolute w-full h-full bg-radial-[at_50%_50%] from-[#0e012e] to-[#020125] to-75%' />
      { dbg.current.show &&
        (<div className='absolute font-mono leading-4 text-sm p-2 bg-[#ffffff80] rounded-md m-4'>
          <p>DEBUG (press G to toggle visibility)</p>
          <p>g.poweredOn: {g.poweredOn.toString()}</p>
          <p>g.powerFactor: {g.powerFactor.toFixed(2).toString()}</p>
          <p>mediaStream.active: {mediaStream?.active.toString()}</p>
          <p>audioCtx.state: {audioCtx?.state}</p>
          <p>audioCtx.currentTime: {audioCtx?.currentTime.toFixed(2)}</p>
          <p>audioCtx.baseLatency: {audioCtx?.baseLatency.toFixed(2)}</p>
          <p>audioCtx.outputLatency: {audioCtx?.outputLatency.toFixed(2)}</p>
          <p>audioCtx.sampleRate: {audioCtx?.sampleRate}</p>
          <p>analyzer.fftSize: {analyser?.fftSize}</p>
          <p>Volume: {volume}</p>
          <p>Pitch: {pitch} Hz</p>
          <p>User transcript: {transcript}</p>
          <p>GLaDOS transcript: {transcript}</p>
          <label>Draw debug points: <input checked={dbg.current.showPoints} onChange={(e) => dbg.current.showPoints = e.target.checked} type='checkbox'/></label><br/>
          <label>Draw debug velocity: <input checked={dbg.current.showVelocity} onChange={(e) => dbg.current.showVelocity = e.target.checked} type='checkbox'/></label>
        </div>)
      }
      <button data-is-recording={glados.current.poweredOn} onClick={buttonClick} className="main-button">
        {glados.current.poweredOn ? 'STOP' : 'START'}
      </button>
    </>
  )
}

export default App
