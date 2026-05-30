/**
 * WebRTC Hook
 * Peer-to-peer video/audio bağlantısı yönetir
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { SignalingClient, SignalingMessage } from "./signalingClient";
import { createInterviewPeerConnection, parseIceCandidateType, isTurnConfigured } from "@/lib/webrtc";
import { SttClient, startCandidateStt } from "@/lib/stt";

interface UseWebRTCOptions {
  localStream: MediaStream | null;
  onRemoteStream?: (stream: MediaStream) => void;
  sessionId?: string; // STT için session ID
  roomId?: string; // Signaling için room ID (sessionId ile aynı olmalı)
  enableStt?: boolean; // STT'yi etkinleştir (sadece admin/mülakatçı tarafında)
}

export function useWebRTC({ localStream, onRemoteStream, sessionId, roomId, enableStt = false }: UseWebRTCOptions) {
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const resolvedRoomId = roomId || sessionId || "interview-room-1";
  
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const signalingClientRef = useRef<SignalingClient | null>(null);
  const sttClientRef = useRef<SttClient | null>(null); // STT client referansı
  const isInitiatorRef = useRef(false);
  const hasReceivedOfferRef = useRef(false);
  const hasReceivedAnswerRef = useRef(false);

  // Peer connection oluştur (merkezi TURN/STUN yapılandırması ile - ASYNC)
  const createPeerConnection = useCallback(async (): Promise<RTCPeerConnection> => {
    // createInterviewPeerConnection Metered'dan TURN credentials alır (async)
    const pc = await createInterviewPeerConnection();

    // Local stream'i peer connection'a ekle
    if (localStream) {
      console.log("📹 Local stream peer connection'a ekleniyor");
      localStream.getTracks().forEach((track) => {
        console.log("📹 Track ekleniyor:", track.kind, track.id, track.enabled);
        pc.addTrack(track, localStream);
      });
      console.log("📹 Local stream tracks eklendi. Toplam senders:", pc.getSenders().length);
    } else {
      console.warn("⚠️ Local stream yok, peer connection'a eklenemedi");
    }

    // Remote stream'i al
    pc.ontrack = (event) => {
      console.log("🎥 Remote stream alındı!", event);
      console.log("Streams:", event.streams);
      console.log("Track:", event.track);
      console.log("Track kind:", event.track.kind);
      console.log("Track enabled:", event.track.enabled);
      console.log("Track readyState:", event.track.readyState);
      
      const stream = event.streams[0] || new MediaStream([event.track]);
      console.log("Remote stream tracks:", stream.getTracks().map(t => ({ 
        kind: t.kind, 
        enabled: t.enabled, 
        id: t.id,
        readyState: t.readyState 
      })));
      
      // Stream'i set et
      setRemoteStream(stream);
      console.log("✅ Remote stream state'e set edildi");
      
      if (onRemoteStream) {
        console.log("✅ onRemoteStream callback çağrılıyor");
        onRemoteStream(stream);
      }

      // STT: Audio track geldiğinde aday sesini backend'e gönder
      if (event.track.kind === "audio" && enableStt && sessionId) {
        console.log("🎤 [STT] Audio track alındı, STT başlatılıyor...");
        
        // Önceki STT client varsa durdur
        if (sttClientRef.current) {
          sttClientRef.current.stop();
        }
        
        // Yeni STT client başlat
        sttClientRef.current = startCandidateStt(stream, sessionId);
      }
      
      // Track state değişikliklerini dinle
      event.track.onended = () => {
        console.log("⚠️ Remote track sonlandı:", event.track.kind);
        // Audio track sonlandığında STT'yi durdur
        if (event.track.kind === "audio" && sttClientRef.current) {
          sttClientRef.current.stop();
          sttClientRef.current = null;
        }
      };
      
      event.track.onmute = () => {
        console.log("⚠️ Remote track sessize alındı:", event.track.kind);
      };
      
      event.track.onunmute = () => {
        console.log("✅ Remote track ses açıldı:", event.track.kind);
      };
    };

    // ICE candidate'ları işle - RAW candidate string'i logla
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        const candidateStr = event.candidate.candidate;
        const candidateType = parseIceCandidateType(candidateStr);
        
        // RAW candidate string - typ relay olup olmadığını kontrol için kritik
        console.log('🧊 ICE candidate RAW:', candidateStr);
        console.log(`🧊 ICE candidate tipi: ${candidateType}`, {
          protocol: event.candidate.protocol,
          address: event.candidate.address,
          port: event.candidate.port,
          type: candidateType,
        });

        // TURN (relay) candidate geldiğinde özel log
        if (candidateType === 'relay') {
          console.log('✅✅✅ TURN (relay) candidate bulundu! TURN çalışıyor!');
        }

        // Signaling ile gönder
        if (signalingClientRef.current) {
          signalingClientRef.current.send({
            type: "ice-candidate",
            data: event.candidate,
          });
        }
      } else {
        console.log("🧊 ICE candidate toplama bitti (end-of-candidates)");
        
        // TURN yapılandırması kontrolü
        if (!isTurnConfigured()) {
          console.warn("⚠️ TURN yapılandırılmamış - farklı ağlar arası bağlantı olmayabilir!");
        }
      }
    };

    // ICE connection state değişikliklerini takip et
    pc.oniceconnectionstatechange = () => {
      console.log("🧊 ICE connection state:", pc.iceConnectionState);
    };

    // Connection state değişikliklerini takip et
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      console.log("Connection state:", state);
      setIsConnected(state === "connected");
      
      if (state === "failed" || state === "disconnected") {
        if (!isTurnConfigured()) {
          setConnectionError("TURN sunucusu ayarlı değil. Farklı ağlarda bağlantı kurulamayabilir.");
        } else {
          setConnectionError("Bağlantı kesildi");
        }
      } else {
        setConnectionError(null);
      }
    };

    return pc;
  }, [localStream, onRemoteStream]);

  // Offer oluştur ve gönder
  const createOffer = useCallback(async () => {
    if (!peerConnectionRef.current || !signalingClientRef.current) {
      console.error("❌ Peer connection veya signaling client yok");
      return;
    }

    try {
      console.log("📤 Offer oluşturuluyor...");
      const offer = await peerConnectionRef.current.createOffer();
      console.log("📤 Offer oluşturuldu:", offer);
      await peerConnectionRef.current.setLocalDescription(offer);
      console.log("📤 Local description set edildi");
      
      signalingClientRef.current.send({
        type: "offer",
        data: offer,
      });
      console.log("📤 Offer gönderildi");
    } catch (error) {
      console.error("❌ Offer oluşturma hatası:", error);
      setConnectionError("Bağlantı kurulamadı");
    }
  }, []);

  // Answer oluştur ve gönder
  const createAnswer = useCallback(async (offer: RTCSessionDescriptionInit) => {
    if (!peerConnectionRef.current || !signalingClientRef.current) {
      console.error("❌ Peer connection veya signaling client yok");
      return;
    }

    try {
      console.log("📥 Offer alındı, answer oluşturuluyor...", offer);
      await peerConnectionRef.current.setRemoteDescription(offer);
      console.log("📥 Remote description set edildi");
      const answer = await peerConnectionRef.current.createAnswer();
      console.log("📥 Answer oluşturuldu:", answer);
      await peerConnectionRef.current.setLocalDescription(answer);
      console.log("📥 Local description set edildi");
      
      signalingClientRef.current.send({
        type: "answer",
        data: answer,
      });
      console.log("📥 Answer gönderildi");
    } catch (error) {
      console.error("❌ Answer oluşturma hatası:", error);
      setConnectionError("Bağlantı kurulamadı");
    }
  }, []);

  // ICE candidate ekle
  const addIceCandidate = useCallback(async (candidate: RTCIceCandidateInit) => {
    if (!peerConnectionRef.current) {
      console.warn("⚠️ Peer connection yok, ICE candidate eklenemedi");
      return;
    }

    try {
      // Eğer remote description henüz set edilmediyse, candidate'ı beklet
      if (peerConnectionRef.current.remoteDescription === null) {
        console.log("⏳ Remote description yok, ICE candidate bekletiliyor...");
        // Candidate'ı geçici olarak sakla ve remote description set edildikten sonra ekle
        // Bu durumda browser otomatik olarak handle eder, ama log için bekleyelim
        setTimeout(async () => {
          if (peerConnectionRef.current && peerConnectionRef.current.remoteDescription) {
            await peerConnectionRef.current.addIceCandidate(candidate);
            console.log("✅ ICE candidate eklendi (gecikmeli)");
          }
        }, 100);
      } else {
        await peerConnectionRef.current.addIceCandidate(candidate);
        console.log("✅ ICE candidate eklendi");
      }
    } catch (error) {
      // Ignore error if candidate already added or invalid
      if (error instanceof Error && error.message.includes("already")) {
        console.log("ℹ️ ICE candidate zaten eklenmiş");
      } else {
        console.error("❌ ICE candidate ekleme hatası:", error);
      }
    }
  }, []);

  // Signaling mesajlarını işle
  const handleSignalingMessage = useCallback(
    (message: SignalingMessage) => {
      console.log("📨 Signaling mesajı alındı:", message.type, message);
      
      // Ping/pong mesajlarını sessizce işle
      if (message.type === "ping" || message.type === "pong") {
        return;
      }

      // room-info mesajı - odaya ilk girdiğimizde gelir
      if (message.type === "room-info") {
        const userCount = message.data?.user_count || 0;
        console.log(`📊 Oda bilgisi alındı. Odadaki kullanıcı sayısı: ${userCount}`);
        
        // Eğer odada sadece biz varsak, initiator olacağız
        if (userCount === 1) {
          console.log("👤 Odada tek kişiyiz, diğer kullanıcı beklenecek...");
          isInitiatorRef.current = true;
        }
        return;
      }

      // user-joined mesajı - yeni kullanıcı odaya katıldığında gelir
      if (message.type === "user-joined") {
        const userCount = message.data?.user_count || 0;
        console.log(`👥 Yeni kullanıcı katıldı! Odadaki kullanıcı sayısı: ${userCount}`);
        
        // Eğer odada 2 kişi olduysa ve biz initiator isek, offer oluştur
        if (userCount >= 2 && isInitiatorRef.current && !hasReceivedOfferRef.current && !hasReceivedAnswerRef.current) {
          console.log("🚀 2 kişi oldu, initiator olarak offer oluşturuyoruz...");
          setTimeout(() => {
            if (peerConnectionRef.current && !hasReceivedOfferRef.current) {
              createOffer();
            }
          }, 500);
        }
        return;
      }

      // user-left mesajı
      if (message.type === "user-left") {
        console.log("👋 Kullanıcı ayrıldı:", message.data);
        setConnectionError("Diğer kullanıcı ayrıldı");
        return;
      }

      if (!peerConnectionRef.current) {
        console.error("❌ Peer connection yok, mesaj işlenemiyor");
        return;
      }

      switch (message.type) {
        case "offer":
          console.log("📥 Offer mesajı alındı. Initiator:", isInitiatorRef.current, "Has received offer:", hasReceivedOfferRef.current);
          // Eğer daha önce offer almadıysak, answer oluştur
          if (!hasReceivedOfferRef.current) {
            console.log("✅ Answer oluşturulacak");
            hasReceivedOfferRef.current = true;
            isInitiatorRef.current = false; // Offer aldık, biz initiator değiliz
            createAnswer(message.data);
          } else {
            console.log("⚠️ Offer zaten işlendi");
          }
          break;

        case "answer":
          console.log("📥 Answer mesajı alındı. Initiator:", isInitiatorRef.current, "Has received answer:", hasReceivedAnswerRef.current);
          // Eğer initiator isek ve daha önce answer almadıysak, remote description'ı set et
          if (isInitiatorRef.current && !hasReceivedAnswerRef.current) {
            console.log("✅ Remote description set edilecek");
            hasReceivedAnswerRef.current = true;
            peerConnectionRef.current.setRemoteDescription(message.data)
              .then(() => {
                console.log("✅ Remote description set edildi");
                console.log("📊 Peer connection senders:", peerConnectionRef.current?.getSenders().length);
                console.log("📊 Peer connection receivers:", peerConnectionRef.current?.getReceivers().length);
                console.log("📊 Peer connection transceivers:", peerConnectionRef.current?.getTransceivers().length);
              })
              .catch((err) => console.error("❌ Remote description set hatası:", err));
          } else {
            console.log("⚠️ Answer zaten işlendi veya initiator değil");
          }
          break;

        case "ice-candidate":
          console.log("🧊 ICE candidate alındı:", message.data);
          addIceCandidate(message.data)
            .then(() => console.log("✅ ICE candidate eklendi"))
            .catch((err) => console.error("❌ ICE candidate ekleme hatası:", err));
          break;

        default:
          console.log("⚠️ Bilinmeyen mesaj tipi:", message.type);
          break;
      }
    },
    [createAnswer, addIceCandidate, createOffer]
  );

  // WebRTC bağlantısını başlat
  useEffect(() => {
    if (!localStream) return;

    // Önceki bağlantıları temizle (çift bağlantı önleme)
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (signalingClientRef.current) {
      signalingClientRef.current.disconnect();
      signalingClientRef.current = null;
    }

    // Başlangıç değerleri
    isInitiatorRef.current = false;
    hasReceivedOfferRef.current = false;
    hasReceivedAnswerRef.current = false;

    // IIFE - async initialization
    const initWebRTC = async () => {
      try {
        // ÖNCE Peer connection oluştur (Metered'dan TURN credentials alınır - async)
        console.log("🔧 Peer connection oluşturuluyor (Metered TURN credentials alınıyor)...");
        const pc = await createPeerConnection();
        peerConnectionRef.current = pc;
        console.log("🔧 Peer connection oluşturuldu");

        // SONRA Signaling client oluştur ve bağlan
        const signalingClient = new SignalingClient(resolvedRoomId);
        signalingClientRef.current = signalingClient;

        signalingClient.onMessage(handleSignalingMessage);

        await signalingClient.connect();

        console.log("🔧 WebRTC başlatıldı. Diğer kullanıcı bekleniyor...");
        console.log("🔧 Local stream tracks:", localStream.getTracks().map(t => ({ kind: t.kind, enabled: t.enabled, id: t.id })));

        // Fallback: 10 saniye içinde hiçbir şey olmazsa, kendimiz offer oluşturalım
        setTimeout(() => {
          if (peerConnectionRef.current && !hasReceivedOfferRef.current && !hasReceivedAnswerRef.current) {
            console.log("⚠️ 10 saniye geçti. Fallback: Offer oluşturuyoruz...");
            isInitiatorRef.current = true;
            createOffer();
          }
        }, 10000);
      } catch (error) {
        console.error("WebRTC başlatma hatası:", error);
        setConnectionError("Bağlantı kurulamadı");
      }
    };

    initWebRTC();

    // Cleanup
    return () => {
      console.log("🧹 WebRTC cleanup");
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
      if (signalingClientRef.current) {
        signalingClientRef.current.disconnect();
        signalingClientRef.current = null;
      }
      // STT client'ı temizle
      if (sttClientRef.current) {
        sttClientRef.current.stop();
        sttClientRef.current = null;
      }
      setRemoteStream(null);
      setIsConnected(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localStream, sessionId, roomId, enableStt, resolvedRoomId]); // localStream, sessionId veya enableStt değiştiğinde çalış

  // Local stream değiştiğinde peer connection'ı güncelle
  useEffect(() => {
    if (!localStream || !peerConnectionRef.current) return;

    // Mevcut track'leri kaldır
    peerConnectionRef.current.getSenders().forEach((sender) => {
      if (sender.track) {
        peerConnectionRef.current?.removeTrack(sender);
      }
    });

    // Yeni track'leri ekle
    localStream.getTracks().forEach((track) => {
      peerConnectionRef.current?.addTrack(track, localStream);
    });
  }, [localStream]);

  return {
    remoteStream,
    isConnected,
    connectionError,
  };
}
