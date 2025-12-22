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
  const showDebugPoints = useRef(true)
  const lastTick = useRef(performance.now())
  const [isRecording, setIsRecording] = useState(false)
  const glados = useRef({
    // positions for different body parts
    spinePosX: 0, spinePosY: 0,
    bodyPosX: 0, bodyPosY: 0,
    torsoPosX: 0, torsoPosY: 0,
    headPosX: 0, headPosY: 0,
    facePosX: 0, facePosY: 0,
    eyePosX: 0, eyePosY: 0,
    // offsets for different body parts
    spineOffsetX: 0, spineOffsetY: -40,
    bodyOffsetX: 0, bodyOffsetY: 30,
    torsoOffsetX: 0, torsoOffsetY: 30,
    headOffsetX: 0, headOffsetY: 20,
    faceOffsetX: -10, faceOffsetY: 10,
    eyeOffsetX: 0, eyeOffsetY: 0,
    // limits for different body parts
    spineLimitX: 350, spineLimitY: 50,
    bodyLimitX: 30, bodyLimitY: 30,
    torsoLimitX: 70, torsoLimitY: 10,
    headLimitX: 60, headLimitY: 50,
    faceLimitX: 20, faceLimitY: 30,
    eyeLimitX: 12, eyeLimitY: 40,
    // size of different body parts
    spineWidth: 120, spineHeight: 800,
    bodyWidth: 300, bodyHeight: 200,
    torsoWidth: 200, torsoHeight: 180,
    headWidth: 130, headHeight: 250,
    faceWidth: 67, faceHeight: 143,
    eyeRadius: 20,
  })

  const { transcript, browserSupportsSpeechRecognition } = useSpeechRecognition()

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

    const g = glados.current

    const scalex=-10
    const scaley=0

    g.spinePosX += scalex * delta
    g.spinePosY += scaley * delta
    g.spinePosX = Math.max(-g.spineLimitX, Math.min(g.spineLimitX, g.spinePosX))
    g.spinePosY = Math.max(-g.spineLimitY, Math.min(g.spineLimitY, g.spinePosY))

    g.bodyPosX += scalex * delta
    g.bodyPosY += scaley * delta
    g.bodyPosX = Math.max(-g.bodyLimitX, Math.min(g.bodyLimitX, g.bodyPosX))
    g.bodyPosY = Math.max(-g.bodyLimitY, Math.min(g.bodyLimitY, g.bodyPosY))

    g.torsoPosX += scalex * delta
    g.torsoPosY += scaley * delta
    g.torsoPosX = Math.max(-g.torsoLimitX, Math.min(g.torsoLimitX, g.torsoPosX))
    g.torsoPosY = Math.max(-g.torsoLimitY, Math.min(g.torsoLimitY, g.torsoPosY))

    g.headPosX += scalex * delta
    g.headPosY += scaley * delta
    g.headPosX = Math.max(-g.headLimitX, Math.min(g.headLimitX, g.headPosX))
    g.headPosY = Math.max(-g.headLimitY, Math.min(g.headLimitY, g.headPosY))

    g.facePosX += scalex * delta
    g.facePosY += scaley * delta
    g.facePosX = Math.max(-g.faceLimitX - g.faceOffsetX, Math.min(g.faceLimitX - g.faceOffsetX, g.facePosX))
    g.facePosY = Math.max(-g.faceLimitY, Math.min(g.faceLimitY, g.facePosY))

    g.eyePosX += scalex * delta
    g.eyePosY += scaley * delta
    g.eyePosX = Math.max(-g.eyeLimitX, Math.min(g.eyeLimitX, g.eyePosX))
    g.eyePosY = Math.max(-g.eyeLimitY, Math.min(g.eyeLimitY, g.eyePosY))
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
    const spineX = cx + g.spineOffsetX + g.spinePosX
    const spineY = cy + g.spineOffsetY + g.spinePosY
    const bodyX = spineX + g.bodyOffsetX + g.bodyPosX
    const bodyY = spineY + g.bodyOffsetY + g.bodyPosY
    const torsoX = bodyX + g.torsoOffsetX + g.torsoPosX
    const torsoY = bodyY + g.torsoOffsetY + g.torsoPosY
    const headX = torsoX + g.headOffsetX + g.headPosX
    const headY = torsoY + g.headOffsetY + g.headPosY
    const faceX = headX + g.faceOffsetX + g.facePosX
    const faceY = headY + g.faceOffsetY + g.facePosY
    const eyeX = faceX + g.eyeOffsetX + g.eyePosX
    const eyeY = faceY + g.eyeOffsetY + g.eyePosY

    // back (attached to body)
    canvasCtx.drawRoundedRect(bodyX - g.bodyWidth / 3, bodyY - g.bodyHeight, g.bodyWidth / 1.5, g.bodyHeight * 1.5, 150, '#545454', 'black', null, 'linear', 50)

    // spine
    canvasCtx.drawRoundedRect(spineX - g.spineWidth / 2, spineY - g.spineHeight, g.spineWidth, g.spineHeight, 20, 'black', '#191919')

    // body
    canvasCtx.drawRoundedRect(bodyX - g.bodyWidth / 2, bodyY - g.bodyHeight / 2, g.bodyWidth, g.bodyHeight, 150, '#a4a4a4', '#222', null, 'linear', 50)

    // torso
    canvasCtx.drawRoundedRect(torsoX - g.torsoWidth / 2, torsoY - g.torsoHeight / 2, g.torsoWidth, g.torsoHeight, 100, '#c4c4c4', '#333', null, 'linear', 50)

    // head
    canvasCtx.drawRoundedRect(headX - g.headWidth / 2, headY - g.headHeight / 2, g.headWidth, g.headHeight, 30, '#e4e4e4', '#444444')

    // face
    canvasCtx.drawRoundedRect(faceX - g.faceWidth / 2, faceY - g.faceHeight / 2, g.faceWidth, g.faceHeight, 40, 'black', '#333', null, 'radial')

    // eye
    canvasCtx.drawLight(eyeX, eyeY, g.eyeRadius, '#ecdd5e', 0.6);
    canvasCtx.drawLight(eyeX + 14, eyeY + 14, 5, '#d63d51', 0);

    // Debug draw point for each body parts centers
    if (showDebugPoints.current) {
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
      
      canvasCtx.drawCircle(eyeX, eyeY, 5, 'pink')
      canvasCtx.fillStyle = 'pink'
      canvasCtx.fillText('eye', eyeX + 10, eyeY)
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
    window.addEventListener('resize', resizeCanvas);
    return () => {
      window.removeEventListener('resize', resizeCanvas)
      if (intervalId !== null) {
        clearInterval(intervalId);
      }
    };
  }, [canvasCtx])

  if (!browserSupportsSpeechRecognition) {
    return <p>Your browser does not support speech recognition.</p>
  }

  return (
    <>
      <canvas ref={canvasRef} className='absolute w-full h-full bg-radial-[at_50%_50%] from-[#0e012e] to-[#020125] to-75%' />
      <div className='absolute font-mono leading-4 text-sm p-2 bg-[#ffffff80] rounded-md m-4'>
        <p>DEBUG</p>
        <p>glados.x: {glados.current?.x}</p>
        <p>glados.y: {glados.current?.y}</p>
        <p>mediaStream.active: {mediaStream?.active.toString()}</p>
        <p>audioCtx.state: {audioCtx?.state}</p>
        <p>audioCtx.currentTime: {audioCtx?.currentTime}</p>
        <p>audioCtx.baseLatency: {audioCtx?.baseLatency}</p>
        <p>audioCtx.outputLatency: {audioCtx?.outputLatency}</p>
        <p>audioCtx.sampleRate: {audioCtx?.sampleRate}</p>
        <p>analyzer.fftSize: {analyser?.fftSize}</p>
        <p>Volume: {volume}</p>
        <p>Pitch: {pitch} Hz</p>
        <p>User transcript: {transcript}</p>
        <p>GLaDOS transcript: {transcript}</p>
        <label>Draw debug points: <input checked={showDebugPoints.current} onChange={(e) => showDebugPoints.current = e.target.checked} type='checkbox'/></label>
      </div>
      <button data-is-recording={isRecording} onClick={buttonClick} className="main-button">
        {isRecording ? 'STOP' : 'START'}
      </button>
    </>
  )
}

export default App
