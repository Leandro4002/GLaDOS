import React, { useRef, useState, useEffect } from 'react'
import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition'
import './App.css'


const App = () => {
const canvasRef = useRef(null)
const [audioCtx, setAudioCtx] = useState(null)
const [analyser, setAnalyser] = useState(null)
const [mediaStream, setMediaStream] = useState(null)
const [rafId, setRafId] = useState(null)
const [volume, setVolume] = useState(0)
const [pitch, setPitch] = useState(0)


const { transcript, listening, browserSupportsSpeechRecognition } = useSpeechRecognition()


const getAverageVolume = (dataArray) => {
let sum = 0
for (let i = 0; i < dataArray.length; i++) {
const val = (dataArray[i] - 128) / 128
sum += val * val
}
return Math.sqrt(sum / dataArray.length)
}


const autoCorrelate = (buf, sampleRate) => {
let SIZE = buf.length
let rms = 0
for (let i = 0; i < SIZE; i++) {
const val = (buf[i] - 128) / 128
rms += val * val
}
rms = Math.sqrt(rms / SIZE)
if (rms < 0.01) return 0


let r1 = 0, r2 = SIZE - 1, thres = 0.2
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
let T0 = maxpos
return sampleRate / T0
}


const draw = (ctx, analyser) => {
const bufferLength = analyser.fftSize
const dataArray = new Uint8Array(bufferLength)
analyser.getByteTimeDomainData(dataArray)


ctx.fillStyle = '#000'
ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height)
ctx.strokeStyle = '#0f0'
ctx.beginPath()
const sliceWidth = ctx.canvas.width / bufferLength
let x = 0
for (let i = 0; i < bufferLength; i++) {
const v = dataArray[i] / 128.0
const y = (v * ctx.canvas.height) / 2
i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
x += sliceWidth
}
ctx.stroke()


const vol = getAverageVolume(dataArray)
const detectedPitch = autoCorrelate(dataArray, audioCtx.sampleRate)
setVolume(vol.toFixed(3))
setPitch(detectedPitch ? detectedPitch.toFixed(1) : '0')


const id = requestAnimationFrame(() => draw(ctx, analyser))
setRafId(id)
}


const startMic = async () => {
const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
const context = new AudioContext()
const analyzer = context.createAnalyser()
analyzer.fftSize = 2048
const srcNode = context.createMediaStreamSource(stream)
srcNode.connect(analyzer)
setAudioCtx(context)
export default App