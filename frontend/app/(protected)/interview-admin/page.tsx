"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useWebRTC } from "@/webrtc/useWebRTC";
import { LiveTranscriptPanel, TranscriptItem } from "@/components/LiveTranscriptPanel";
import { AiQuestionSuggestionsCard } from "@/components/AiQuestionSuggestionsCard";
import { useAuth } from "@/hooks/useAuth";
import {
  fetchInterviewById,
  insertTranscriptSegments,
  updateInterviewStatus,
} from "@/lib/db";

const SESSION_STORAGE_KEY = "interview_session_id";
const INTERVIEW_STORAGE_KEY = "active_interview_id";

export default function InterviewAdminPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const [isInterviewStarted, setIsInterviewStarted] = useState(true); // Otomatik başlat
  const [duration, setDuration] = useState(0); // seconds
  const [isMicOn, setIsMicOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [sessionId, setSessionId] = useState<string>("");
  const [interviewId, setInterviewId] = useState<string | null>(null);
  const [interviewError, setInterviewError] = useState<string | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [transcriptItems, setTranscriptItems] = useState<TranscriptItem[]>([]);
  const lastSavedIndexRef = useRef(0);
  const mainVideoRef = useRef<HTMLVideoElement | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);

  // WebRTC bağlantısı - STT etkin (admin/mülakatçı tarafında aday sesini yakalayacak)
  const { remoteStream, isConnected, connectionError } = useWebRTC({
    localStream: sessionId ? localStream : null,
    onRemoteStream: (stream) => {
      if (mainVideoRef.current) {
        mainVideoRef.current.srcObject = stream;
      }
    },
    sessionId,
    roomId: sessionId,
    enableStt: true, // Mülakatçı tarafında STT etkin - aday sesi transkript edilecek
  });

  useEffect(() => {
    const queryInterviewId = searchParams.get("interview_id");
    const querySession = searchParams.get("session");

    const resolveInterview = async (targetInterviewId: string) => {
      const interview = await fetchInterviewById(targetInterviewId);
      if (!interview) {
        setInterviewError("Mülakat bilgisi bulunamadi.");
        return;
      }

      localStorage.setItem(INTERVIEW_STORAGE_KEY, interview.id);
      localStorage.setItem(SESSION_STORAGE_KEY, interview.session_id);
      setInterviewId(interview.id);
      setSessionId(interview.session_id);
      setInterviewError(null);
      updateInterviewStatus(interview.id, "in_progress");
    };

    if (queryInterviewId && queryInterviewId.trim()) {
      resolveInterview(queryInterviewId.trim());
      return;
    }

    const storedInterviewId = localStorage.getItem(INTERVIEW_STORAGE_KEY);
    if (storedInterviewId && storedInterviewId.trim()) {
      resolveInterview(storedInterviewId.trim());
      return;
    }

    if (querySession && querySession.trim()) {
      localStorage.setItem(SESSION_STORAGE_KEY, querySession.trim());
      setSessionId(querySession.trim());
      return;
    }

    const storedSession = localStorage.getItem(SESSION_STORAGE_KEY);
    if (storedSession && storedSession.trim()) {
      setSessionId(storedSession.trim());
      return;
    }

    const defaultSession = "interview-room-1";
    localStorage.setItem(SESSION_STORAGE_KEY, defaultSession);
    setSessionId(defaultSession);
  }, [searchParams]);

  useEffect(() => {
    if (isInterviewStarted) {
      const interval = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [isInterviewStarted]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  useEffect(() => {
    if (!interviewId || !sessionId) return;
    if (transcriptItems.length <= lastSavedIndexRef.current) return;

    const newItems = transcriptItems.slice(lastSavedIndexRef.current);
    lastSavedIndexRef.current = transcriptItems.length;

    const payload = newItems
      .filter((item) => !isTranscriptNoise(item.text))
      .map((item) => ({
        role: item.role,
        text: item.text,
      }));

    if (payload.length > 0) {
      insertTranscriptSegments(interviewId, sessionId, payload);
    }
  }, [interviewId, sessionId, transcriptItems]);
const normalizeTranscriptText = (text: string) => {
  return text
    .toLowerCase()
    .replaceAll("ı", "i")
    .replaceAll("ğ", "g")
    .replaceAll("ü", "u")
    .replaceAll("ş", "s")
    .replaceAll("ö", "o")
    .replaceAll("ç", "c")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

  const isTranscriptNoise = (text: string) => {
    const normalized = normalizeTranscriptText(text);

    const noisePhrases = [
      "abone olmayi",
      "abone olun",
      "abone ol",
      "begeni butonuna",
      "begen butonuna",
      "yorum yapmayi",
      "yorum yapin",
      "altyazi",
      "altyazi m k",
      "dont forget subscribe",
      "do not forget subscribe",
      "like and subscribe",
      "subscribe to the channel",
      "thanks for watching",
      "subtitles by",
      "captions by",
      "amara org",
  ];

  return noisePhrases.some((phrase) => normalized.includes(phrase));
  };
  const handleInterviewAction = () => {
    // Mülakatı bitir ve rapor sayfasına yönlendir
    const candidateTranscript = transcriptItems
      .filter((item) => item.role === "Aday")
      .filter((item) => !isTranscriptNoise(item.text))
      .map((item) => item.text)
      .join("\n");
    
    localStorage.setItem("interview_transcript", candidateTranscript);
    localStorage.setItem("interview_duration", duration.toString());
    if (interviewId) {
      localStorage.setItem("active_interview_id", interviewId);
      updateInterviewStatus(interviewId, "completed");
    }
    if (sessionId) {
      localStorage.setItem("interview_session_id", sessionId);
    }

    router.push("/interview-report");
  };

  // Initialize camera and microphone stream only once on mount
  useEffect(() => {
    let stream: MediaStream | null = null;

    const enableCamera = async () => {
      try {
        setVideoError(null);
        setAudioError(null);
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: true,
        });
        // Set initial microphone state
        stream.getAudioTracks().forEach((track) => {
          track.enabled = isMicOn;
        });
        // Set initial video state
        stream.getVideoTracks().forEach((track) => {
          track.enabled = isVideoOn;
        });
        setLocalStream(stream);
        setIsMicOn(true);
        setIsVideoOn(true);
      } catch (err) {
        console.error("Camera or audio error:", err);
        setAudioError("Mikrofon erişimi sağlanamadı. Yalnızca kamera açıldı.");
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          });
          stream.getVideoTracks().forEach((track) => {
            track.enabled = isVideoOn;
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

    // Initialize stream only once when component mounts
    enableCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array - only run once on mount

  // Handle video on/off by enabling/disabling video tracks
  useEffect(() => {
    if (localStream) {
      const videoTracks = localStream.getVideoTracks();
      videoTracks.forEach((track) => {
        track.enabled = isVideoOn;
      });
    }
  }, [isVideoOn, localStream]);

  // Update preview video element (local stream)
  useEffect(() => {
    if (previewVideoRef.current) {
      if (localStream && isVideoOn) {
        previewVideoRef.current.srcObject = localStream;
        const playPromise = previewVideoRef.current.play();
        if (playPromise !== undefined) {
          playPromise.catch((err) => {
            console.warn("Video autoplay prevented:", err);
          });
        }
      } else {
        previewVideoRef.current.pause();
        previewVideoRef.current.srcObject = null;
      }
    }
  }, [localStream, isVideoOn]);

  // Update main video element (remote stream)
  useEffect(() => {
    if (mainVideoRef.current && remoteStream && remoteStream.getTracks().length > 0) {
      console.log("🎥 Admin: Remote stream video element'e set ediliyor", remoteStream);
      console.log("🎥 Remote stream tracks:", remoteStream.getTracks().map(t => ({ 
        kind: t.kind, 
        enabled: t.enabled, 
        id: t.id,
        readyState: t.readyState,
        muted: t.muted
      })));
      
      // Video element'e stream'i set et
      if (mainVideoRef.current.srcObject !== remoteStream) {
        mainVideoRef.current.srcObject = remoteStream;
        console.log("✅ Video element srcObject set edildi");
      }
      
      // Video'yu oynat
      const playPromise = mainVideoRef.current.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            console.log("✅ Remote video oynatılıyor");
            console.log("📊 Video element durumu:", {
              paused: mainVideoRef.current?.paused,
              readyState: mainVideoRef.current?.readyState,
              videoWidth: mainVideoRef.current?.videoWidth,
              videoHeight: mainVideoRef.current?.videoHeight
            });
          })
          .catch((err) => {
            console.error("❌ Remote video autoplay prevented:", err);
          });
      }
    } else if (mainVideoRef.current && (!remoteStream || remoteStream.getTracks().length === 0)) {
      console.log("⚠️ Admin: Remote stream yok veya track yok, video temizleniyor");
      if (mainVideoRef.current.srcObject) {
        mainVideoRef.current.srcObject = null;
      }
    }
  }, [remoteStream]);

  // Cleanup on unmount
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

    // Sadece audio track'in enabled özelliğini değiştir
    const newMicState = !isMicOn;
    audioTracks.forEach((track) => {
      track.enabled = newMicState;
    });
    setIsMicOn(newMicState);
    setAudioError(null);
  };

  // Sabit transcriptions kaldırıldı - artık LiveTranscriptPanel gerçek zamanlı veri alıyor

  return (
    <div className="h-screen bg-gray-50 flex overflow-hidden">
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/dashboard")}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Mülakat Oturumu</h1>
              <p className="text-sm text-gray-600">Aday: Ahmet Yılmaz</p>
            </div>
          </div>
          <div className="text-sm font-medium text-gray-700">Süre: {formatDuration(duration)}</div>
        </div>

        {interviewError && (
          <div className="px-6 pt-4">
            <div className="bg-red-50 border border-red-200 text-red-600 rounded-lg px-4 py-3 text-sm">
              {interviewError}
            </div>
          </div>
        )}

        <div className="flex-1 p-6 space-y-4 overflow-hidden">
          <div
            className="relative bg-gray-900 rounded-lg overflow-hidden flex items-center justify-center mx-auto max-w-4xl w-full"
            style={{ aspectRatio: "16/9" }}
          >
            {remoteStream && remoteStream.getTracks().length > 0 ? (
              <video
                ref={mainVideoRef}
                autoPlay
                playsInline
                muted={false}
                className="absolute inset-0 w-full h-full object-cover"
                style={{ display: "block" }}
                onLoadedMetadata={() => console.log("✅ Remote video metadata yüklendi")}
                onCanPlay={() => console.log("✅ Remote video oynatılabilir")}
                onPlay={() => console.log("✅ Remote video oynatılıyor")}
                onError={(e) => console.error("❌ Remote video hatası:", e)}
              />
            ) : (
              <div className="text-center text-white px-6">
                <div className="w-24 h-24 bg-purple-600 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl font-semibold">
                  AI
                </div>
                <h2 className="text-2xl font-semibold">
                  {isConnected ? "Aday bağlanıyor..." : "Aday Bağlantı Bekleniyor"}
                </h2>
                <p className="text-gray-300 text-sm mt-2">
                  {isConnected ? "Kamera akışı yükleniyor..." : "Adayın bağlanmasını bekliyorum."}
                </p>
                {connectionError && (
                  <p className="text-red-400 text-sm mt-2">⚠ {connectionError}</p>
                )}
                {isConnected && !connectionError && (
                  <p className="text-green-400 text-sm mt-2">● Bağlı - Video bekleniyor...</p>
                )}
                {!isConnected && (
                  <p className="text-yellow-400 text-sm mt-2">⏳ WebRTC bağlantısı kuruluyor...</p>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-col lg:flex-row items-center justify-center gap-6 flex-shrink-0">
            <div className="relative bg-gray-900 rounded-lg overflow-hidden w-40" style={{ aspectRatio: "16/10" }}>
              {localStream && isVideoOn ? (
                <video
                  ref={previewVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-12 h-12 bg-purple-600 rounded-full flex items-center justify-center mx-auto mb-2 text-sm font-semibold text-white">
                      Siz
                    </div>
                    <p className="text-xs text-gray-400">Kamera kapalı</p>
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center gap-4 bg-white rounded-2xl px-8 py-5 shadow-sm">
              <button
                onClick={handleToggleMic}
                className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors text-gray-700 ${
                  isMicOn ? "bg-gray-100" : "bg-red-100 text-red-600"
                }`}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                  />
                </svg>
              </button>
              <button
                onClick={() => setIsVideoOn((prev) => !prev)}
                className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors text-gray-700 ${
                  isVideoOn ? "bg-gray-100" : "bg-red-100 text-red-600"
                }`}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
              </button>
              <Button
                onClick={handleInterviewAction}
                className="px-8 py-3 rounded-full font-medium flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white"
              >
                ⏹ Mülakatı Bitir
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-2 flex-shrink-0">
            {videoError && (
              <p className="text-sm text-red-500 bg-white/70 rounded-lg px-4 py-2 w-full max-w-xl text-center">
                {videoError}
              </p>
            )}
            {audioError && (
              <p className="text-sm text-red-500 bg-white/70 rounded-lg px-4 py-2 w-full max-w-xl text-center">
                {audioError}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="w-96 bg-gray-50 border-l border-gray-200 overflow-y-auto h-full">
        <div className="p-6 space-y-6">
          {/* Canlı Transkript - WebSocket üzerinden gerçek zamanlı */}
          <LiveTranscriptPanel 
            sessionId={sessionId} 
            onTranscriptChange={setTranscriptItems}
          />

          {/* Soru Önerileri (Gemini) - Duygu Analizi yerine */}
          <AiQuestionSuggestionsCard 
            sessionId={sessionId}
            transcriptItems={transcriptItems}
          />

        </div>
      </div>
    </div>
  );
}


