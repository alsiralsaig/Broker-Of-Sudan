"use client";

import { useRef, useState } from "react";
import { Mic, Square, Send, Trash2 } from "lucide-react";

interface VoiceRecorderProps {
  onSend: (blob: Blob, durationSec: number) => void;
  disabled?: boolean;
}

/** مسجّل رسائل صوتية بسيط بواجهة MediaRecorder — للمفاصلة الصوتية داخل الدردشة */
export default function VoiceRecorder({ onSend, disabled }: VoiceRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);

  const startRecording = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      startTimeRef.current = Date.now();

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType || "audio/webm" });
        setPreviewBlob(blob);
        setPreviewUrl(URL.createObjectURL(blob));
        setDuration(Math.round((Date.now() - startTimeRef.current) / 1000));
        stream.getTracks().forEach((t) => t.stop());
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
    } catch {
      setError("تعذر الوصول للميكروفون — تأكد من إعطاء الإذن للمتصفح");
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  const discard = () => {
    setPreviewUrl(null);
    setPreviewBlob(null);
    setDuration(0);
  };

  const send = () => {
    if (previewBlob) {
      onSend(previewBlob, duration);
      discard();
    }
  };

  if (error) {
    return <p className="text-[11px] text-red-400 px-2">{error}</p>;
  }

  if (previewUrl && previewBlob) {
    return (
      <div className="flex items-center gap-2 bg-[#0f1b30] border border-sky-900/60 rounded-xl px-3 py-2">
        <audio src={previewUrl} controls className="h-8 flex-1" />
        <span className="text-[10px] text-slate-400 shrink-0">{duration}ث</span>
        <button type="button" onClick={discard} className="text-red-400 shrink-0">
          <Trash2 size={16} />
        </button>
        <button type="button" onClick={send} className="text-sky-400 shrink-0">
          <Send size={16} />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={recording ? stopRecording : startRecording}
      className={`shrink-0 w-11 h-11 rounded-full flex items-center justify-center transition ${
        recording ? "bg-red-500 animate-pulse text-white" : "bg-sky-500 text-slate-950"
      } disabled:opacity-50`}
      title={recording ? "إيقاف التسجيل" : "تسجيل رسالة صوتية"}
    >
      {recording ? <Square size={16} /> : <Mic size={18} />}
    </button>
  );
}
