"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useWebRTC } from "@/webrtc/useWebRTC";

export default function InterviewRoomPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [duration, setDuration] = useState(0);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [sessionId, setSessionId] = useState<string>("");
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

  const { remoteStream, isConnected, connectionError } = useWebRTC({
    localStream: sessionId ? localStream : null,
    onRemoteStream: (stream) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = stream;
      }
    },
    sessionId,
    roomId: sessionId,
  });

  useEffect(() => {
    const querySession = searchParams.get("session");
    if (querySession && querySession.trim()) {
      localStorage.setItem("interview_session_id", querySession.trim());
      setSessionId(querySession.trim());
      return;
    }

    const storedSession = localStorage.getItem("interview_session_id");
    if (storedSession && storedSession.trim()) {
      setSessionId(storedSession.trim());
      return;
    }

    setSessionId("interview-room-1");
  }, [searchParams]);

  useEffect(() => {
    const interval = setInterval(() => setDuration((prev) => prev + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  useEffect(() => {
    let stream: MediaStream | null = null;

    const enableCamera = async () => {
      try {
        setVideoError(null);
        setAudioError(null);
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true,
        });
        stream.getAudioTracks().forEach((track) => {
          track.enabled = isMicOn;
        });
        setLocalStream(stream);
        setIsMicOn(true);
        setIsVideoOn(true);
      } catch (err) {
        console.error("Camera or audio error:", err);
        setAudioError("Mikrofon erişimi sağlanamadı. Yalnızca kamera açıldı.");
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false,
          });
          setLocalStream(stream);
          setIsMicOn(false);
          setIsVideoOn(true);
        } catch (videoErr) {
          console.error("Camera error:", videoErr);
          setVideoError("Kameraya erişilemiyor. Lütfen izinleri kontrol edin.");
          setIsVideoOn(false);
        }
      }
    };

    enableCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!localStream) return;
    localStream.getVideoTracks().forEach((track) => {
      track.enabled = isVideoOn;
    });
  }, [isVideoOn, localStream]);

  useEffect(() => {
    if (!videoRef.current) return;
    if (localStream && isVideoOn) {
      videoRef.current.srcObject = localStream;
      videoRef.current.play().catch((err) => console.warn("Video autoplay prevented:", err));
    } else {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
  }, [localStream, isVideoOn]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
      remoteVideoRef.current.play().catch((err) => console.error("Remote video autoplay prevented:", err));
    } else if (remoteVideoRef.current && !remoteStream) {
      remoteVideoRef.current.srcObject = null;
    }
  }, [remoteStream]);

  useEffect(() => {
    return () => {
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
      }
      setIsMicOn(false);
    };
  }, [localStream]);

  const handleToggleMic = () => {
    if (!localStream) {
      setAudioError("Önce kamerayı açmalısınız.");
      return;
    }

    const audioTracks = localStream.getAudioTracks();
    if (audioTracks.length === 0) {
      setAudioError("Mikrofon track'i bulunamadı.");
      return;
    }

    const newMicState = !isMicOn;
    audioTracks.forEach((track) => {
      track.enabled = newMicState;
    });
    setIsMicOn(newMicState);
    setAudioError(null);
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#080b16] text-white">
      <header className="border-b border-white/10 bg-white/[0.03] px-6 py-5 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => router.push("/interview-info")} className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/10 text-white/80 transition hover:bg-white/15">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-violet-300">Mülakat Oturumu</p>
              <h1 className="mt-1 text-xl font-black">Görüşme sırasında kameranız burada görüntülenecek.</h1>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-black text-white">Süre: {formatDuration(duration)}</div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 p-6">
        <div className="grid flex-1 gap-6 lg:grid-cols-[2fr,1fr]">
          <section className="relative min-h-[320px] overflow-hidden rounded-[2rem] border border-white/10 bg-black shadow-2xl shadow-black/30 lg:min-h-[520px]">
            {localStream && isVideoOn ? (
              <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-[radial-gradient(circle_at_center,rgba(124,58,237,0.28),transparent_42%),#0f172a] px-6 text-center">
                <div className="mb-5 flex h-24 w-24 items-center justify-center rounded-full bg-violet-600 text-3xl font-black shadow-xl shadow-violet-600/25">AY</div>
                <h2 className="text-2xl font-black">Aday Kamerası Kapalı</h2>
                <p className="mt-2 text-sm text-white/60">Görüşme aktif</p>
              </div>
            )}
            <div className="absolute left-5 top-5 rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-sm font-bold backdrop-blur-xl">
              Siz
            </div>
          </section>

          <aside className="flex flex-col rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 shadow-2xl shadow-black/20 backdrop-blur-xl">
            <div className="mb-5">
              <p className="text-xs font-black uppercase tracking-[0.24em] text-violet-300">Görüşmeci Görüntüsü</p>
              <h3 className="mt-2 text-xl font-black">AI Mülakat Asistanı</h3>
              <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold">
                <span className={`rounded-full px-3 py-1 ${isConnected ? "bg-emerald-500/15 text-emerald-300" : "bg-white/10 text-white/50"}`}>{isConnected ? "● Bağlı" : "Bağlantı bekleniyor"}</span>
                {connectionError && <span className="rounded-full bg-red-500/15 px-3 py-1 text-red-300">⚠ {connectionError}</span>}
              </div>
            </div>

            <div className="relative aspect-video overflow-hidden rounded-3xl bg-black">
              {remoteStream ? (
                <video ref={remoteVideoRef} autoPlay playsInline className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0f0829] px-6 text-center">
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-600 text-2xl font-black">AI</div>
                  <p className="font-black">Görüşmeci yayında</p>
                  <p className="mt-2 text-sm text-white/55">{isConnected ? "Görüşmeci bağlanıyor..." : "Görüşmeci hazır bekliyor."}</p>
                </div>
              )}
            </div>

            <p className="mt-5 text-sm leading-6 text-white/55">Gerçek görüşme senaryosunda mülakatı yapan kişinin kamerası bu alanda yayınlanır.</p>
          </aside>
        </div>

        <div className="mx-auto flex w-full max-w-xl items-center justify-center gap-4 rounded-[2rem] border border-white/10 bg-white/[0.06] px-8 py-5 shadow-2xl shadow-black/20 backdrop-blur-xl">
          <button onClick={handleToggleMic} className={`flex h-14 w-14 items-center justify-center rounded-2xl transition ${isMicOn ? "bg-white/10 text-white hover:bg-white/15" : "bg-red-500/20 text-red-300"}`} aria-label="Mikrofonu aç/kapat">
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </button>
          <button onClick={() => setIsVideoOn(!isVideoOn)} className={`flex h-14 w-14 items-center justify-center rounded-2xl transition ${isVideoOn ? "bg-white/10 text-white hover:bg-white/15" : "bg-red-500/20 text-red-300"}`} aria-label="Kamerayı aç/kapat">
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
        </div>

        {(videoError || audioError) && (
          <div className="mx-auto w-full max-w-xl space-y-2 text-center text-sm">
            {videoError && <p className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-red-200">{videoError}</p>}
            {audioError && <p className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-red-200">{audioError}</p>}
          </div>
        )}
      </main>
    </div>
  );
}
